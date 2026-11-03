/**
 * Asks a maker's site, cheaply and politely, whether it can be read at all (issue #30,
 * docs/firearm-data.md). One line per host: what `robots.txt` answers, whether it refuses us, the delay
 * it asks for, and how large the catalogue its sitemap names is.
 *
 *     deno run -A tools/data/firearms/survey-site.ts browning.com blaser.com sabatti.it
 *
 * This is the first step of every run, before a single extractor is written: of the eighty-eight hosts
 * surveyed on 2026-10-16, twenty answered 403, refused AI crawlers by name, or did not answer at all,
 * and knowing that first saved writing twenty extractors. It fetches two or three pages per host, a
 * second apart, so it costs a site almost nothing.
 *
 * It judges nothing on its own: it prints what the site says, and a person decides whether to read it.
 */
import { AGENT, DELAY, sleep } from './maker-site.ts';

/**
 * The name a `robots.txt` addresses this crawl by: the product token of its user agent, the part before
 * the version (`gordons-legacy-research`), which RFC 9309 (section 2.2.1) says a group is matched on,
 * ignoring case.
 */
export const PRODUCT_TOKEN = AGENT.slice(0, AGENT.indexOf('/')).toLowerCase();

/**
 * The crawlers a `robots.txt` names when it means "no artificial intelligence here". Cloudflare ships
 * this list by default, so it appears on sites whose owner never wrote a line of it. A site disallowing
 * any of them refuses this intake too, whatever our own user agent is called: the crawl is run by an
 * agent (`docs/firearm-data.md`, rule 1).
 */
const AI_CRAWLERS = [
  'AI2Bot',
  'Amazonbot',
  'anthropic-ai',
  'Applebot-Extended',
  'Bytespider',
  'CCBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-Web',
  'cohere-ai',
  'Diffbot',
  'FacebookBot',
  'Google-Extended',
  'GPTBot',
  'meta-externalagent',
  'OAI-SearchBot',
  'omgili',
  'PerplexityBot',
  'Timpibot',
  'YouBot',
];

/** What a host says about being read. */
export interface SiteAnswer {
  host: string;
  /** The status `robots.txt` answered with, or 0 where nothing answered at all. */
  robotsStatus: number;
  /**
   * True where the whole site is disallowed to this crawl: by the group naming our product token, or by
   * `User-agent: *` where no group names us; or because `robots.txt` could not be read at all (a server
   * error or no answer), which RFC 9309 reads as a complete disallow.
   */
  disallowsUs: boolean;
  /** The AI crawlers the file disallows, which this intake reads as a refusal of itself. */
  refusedCrawlers: string[];
  /** The seconds between pages the file asks of us (our own group, else `*`), where it asks. */
  crawlDelay?: number;
  /** The sitemaps the file names, or the conventional address where it names none. */
  sitemaps: string[];
  /** How many addresses the first sitemap holds, and whether it is an index of further sitemaps. */
  entries: number;
  index: boolean;
  /** Why the host could not be surveyed, where it could not. */
  problem?: string;
}

/** The blocks of a `robots.txt`, as one group of user agents to one group of rules. */
interface Block {
  agents: string[];
  rules: string[];
}

/** A `robots.txt` split into its blocks, with comments and blank lines dropped. */
export function blocks(robots: string): Block[] {
  const found: Block[] = [];
  let block: Block | undefined;
  for (const line of robots.split(/\r?\n/).map((text) => text.replace(/#.*$/, '').trim())) {
    if (line === '') continue;
    const [field, ...rest] = line.split(':');
    const name = (field ?? '').trim().toLowerCase();
    const value = rest.join(':').trim();
    if (name === 'user-agent') {
      if (block === undefined || block.rules.length > 0) {
        block = { agents: [], rules: [] };
        found.push(block);
      }
      block.agents.push(value);
    } else if (block !== undefined) {
      block.rules.push(`${name}: ${value}`);
    }
  }
  return found;
}

/**
 * What a `robots.txt` says about us, without fetching anything.
 *
 * The rules that apply are those of the groups naming our product token, taken together, and only where
 * no group names us those of `User-agent: *` (RFC 9309, section 2.2.1): a site can let everyone in and
 * shut this crawl out, or the other way round, and the `*` group says nothing about either.
 */
export function readRobots(robots: string): Pick<SiteAnswer, 'disallowsUs' | 'refusedCrawlers' | 'sitemaps'> & { crawlDelay?: number } {
  const groups = blocks(robots);
  const ours = groups.filter((group) => group.agents.some((agent) => agent.toLowerCase() === PRODUCT_TOKEN));
  const applying = ours.length > 0 ? ours : groups.filter((group) => group.agents.includes('*'));
  const disallowsUs = applying.some((group) => group.rules.includes('disallow: /'));
  const refusedCrawlers = AI_CRAWLERS.filter((crawler) =>
    groups.some(
      (group) =>
        group.agents.some((agent) => agent.toLowerCase() === crawler.toLowerCase()) &&
        group.rules.some((rule) => rule.startsWith('disallow:') && rule !== 'disallow:'),
    ),
  );
  const delays = applying
    .flatMap((group) => group.rules)
    .filter((rule) => rule.startsWith('crawl-delay:'))
    .map((rule) => Number(rule.slice('crawl-delay:'.length).trim()))
    .filter((seconds) => Number.isFinite(seconds));
  const sitemaps = [...robots.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map(([, address]) => address!);
  return { disallowsUs, refusedCrawlers, sitemaps, ...(delays[0] === undefined ? {} : { crawlDelay: Math.max(...delays) }) };
}

/** How many addresses a sitemap holds, and whether it is an index naming further sitemaps. */
export function readSitemap(xml: string): { entries: number; index: boolean } {
  return { entries: [...xml.matchAll(/<loc>/g)].length, index: /<sitemapindex/i.test(xml) };
}

/**
 * Whether a `robots.txt` status means the file could not be read, so that nothing may be: a server error
 * or no answer at all. RFC 9309 (section 2.3.1.4) reads that as a complete disallow, because rules may
 * exist that we cannot see. Any other 4xx means there are no rules, which allows everything (section
 * 2.3.1.3), except a 403, which this intake takes as a final refusal (docs/firearm-data.md, rule 1).
 */
export function robotsUnreadable(status: number): boolean {
  return status === 0 || status >= 500;
}

/** A page, with its status; a status of 0 means nothing answered. */
async function get(url: string): Promise<{ status: number; text: string }> {
  try {
    const response = await fetch(url, { headers: { 'user-agent': AGENT } });
    return { status: response.status, text: response.ok ? await response.text() : '' };
  } catch (cause) {
    return { status: 0, text: cause instanceof Error ? cause.message : String(cause) };
  }
}

export async function survey(host: string): Promise<SiteAnswer> {
  const robots = await get(`https://${host}/robots.txt`);
  const answer: SiteAnswer = {
    host,
    robotsStatus: robots.status,
    disallowsUs: false,
    refusedCrawlers: [],
    sitemaps: [],
    entries: 0,
    index: false,
  };
  if (robotsUnreadable(robots.status)) {
    return { ...answer, disallowsUs: true, problem: robots.status === 0 ? robots.text : `robots.txt answered ${robots.status}` };
  }
  const read = robots.status === 200 ? readRobots(robots.text) : { disallowsUs: false, refusedCrawlers: [], sitemaps: [] };
  const sitemaps = read.sitemaps.length > 0 ? read.sitemaps : [`https://${host}/sitemap.xml`];
  const withRobots = { ...answer, ...read, sitemaps };
  // A site that refuses us is not asked for anything else.
  if (withRobots.disallowsUs || withRobots.refusedCrawlers.length > 0 || robots.status === 403) return withRobots;
  await sleep(DELAY);
  const sitemap = await get(sitemaps[0]!);
  return { ...withRobots, ...readSitemap(sitemap.text), ...(sitemap.status === 200 ? {} : { problem: `sitemap answered ${sitemap.status}` }) };
}

/** One host on the log, in the words a person has to read to decide. */
export function summaryLine(answer: SiteAnswer): string {
  const delay = answer.crawlDelay === undefined ? '' : `  asks ${answer.crawlDelay} s`;
  return `${answer.host.padEnd(28)} robots ${String(answer.robotsStatus).padStart(3)}  ${verdict(answer)}${delay}`;
}

/** What the site's answer comes to. Why `robots.txt` could not be read goes first: it is the reason. */
function verdict(answer: SiteAnswer): string {
  if (answer.robotsStatus === 403) return 'robots.txt itself answers 403';
  if (answer.robotsStatus === 0) return `no answer, read as a refusal: ${answer.problem ?? ''}`;
  if (robotsUnreadable(answer.robotsStatus)) return `robots.txt answers ${answer.robotsStatus}, read as a refusal until it answers`;
  if (answer.disallowsUs) return 'disallows us the whole site';
  if (answer.refusedCrawlers.length > 0) return `refuses ${answer.refusedCrawlers.join(', ')}`;
  return `${answer.entries} ${answer.index ? 'sitemaps' : 'addresses'}${answer.problem === undefined ? '' : ` (${answer.problem})`}`;
}

async function main(): Promise<void> {
  const hosts = process.argv.slice(2);
  if (hosts.length === 0) {
    console.error('usage: deno run -A tools/data/firearms/survey-site.ts <host>...');
    process.exitCode = 1;
    return;
  }
  for (const host of hosts) {
    console.log(summaryLine(await survey(host)));
    await sleep(DELAY);
  }
}

if (import.meta.main) await main();
