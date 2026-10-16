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
  /** True where `User-agent: *` is disallowed everything. */
  disallowsEveryone: boolean;
  /** The AI crawlers the file disallows, which this intake reads as a refusal of itself. */
  refusedCrawlers: string[];
  /** The seconds between pages the file asks for, where it asks. */
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

/** What a `robots.txt` says about us, without fetching anything. */
export function readRobots(robots: string): Pick<SiteAnswer, 'disallowsEveryone' | 'refusedCrawlers' | 'sitemaps'> & { crawlDelay?: number } {
  const groups = blocks(robots);
  const everyone = groups.filter((group) => group.agents.includes('*'));
  const disallowsEveryone = everyone.some((group) => group.rules.includes('disallow: /'));
  const refusedCrawlers = AI_CRAWLERS.filter((crawler) =>
    groups.some(
      (group) =>
        group.agents.some((agent) => agent.toLowerCase() === crawler.toLowerCase()) &&
        group.rules.some((rule) => rule.startsWith('disallow:') && rule !== 'disallow:'),
    ),
  );
  const delays = everyone
    .flatMap((group) => group.rules)
    .filter((rule) => rule.startsWith('crawl-delay:'))
    .map((rule) => Number(rule.slice('crawl-delay:'.length).trim()))
    .filter((seconds) => Number.isFinite(seconds));
  const sitemaps = [...robots.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map(([, address]) => address!);
  return { disallowsEveryone, refusedCrawlers, sitemaps, ...(delays[0] === undefined ? {} : { crawlDelay: Math.max(...delays) }) };
}

/** How many addresses a sitemap holds, and whether it is an index naming further sitemaps. */
export function readSitemap(xml: string): { entries: number; index: boolean } {
  return { entries: [...xml.matchAll(/<loc>/g)].length, index: /<sitemapindex/i.test(xml) };
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
    disallowsEveryone: false,
    refusedCrawlers: [],
    sitemaps: [],
    entries: 0,
    index: false,
  };
  if (robots.status === 0) return { ...answer, problem: robots.text };
  const read = robots.status === 200 ? readRobots(robots.text) : { disallowsEveryone: false, refusedCrawlers: [], sitemaps: [] };
  const sitemaps = read.sitemaps.length > 0 ? read.sitemaps : [`https://${host}/sitemap.xml`];
  const withRobots = { ...answer, ...read, sitemaps };
  // A site that refuses us is not asked for anything else.
  if (withRobots.disallowsEveryone || withRobots.refusedCrawlers.length > 0 || robots.status === 403) return withRobots;
  await sleep(DELAY);
  const sitemap = await get(sitemaps[0]!);
  return { ...withRobots, ...readSitemap(sitemap.text), ...(sitemap.status === 200 ? {} : { problem: `sitemap answered ${sitemap.status}` }) };
}

/** One host on the log, in the words a person has to read to decide. */
export function summaryLine(answer: SiteAnswer): string {
  const verdict = answer.disallowsEveryone
    ? 'disallows everyone'
    : answer.refusedCrawlers.length > 0
      ? `refuses ${answer.refusedCrawlers.join(', ')}`
      : answer.robotsStatus === 403
        ? 'robots.txt itself answers 403'
        : answer.robotsStatus === 0
          ? `no answer: ${answer.problem ?? ''}`
          : `${answer.entries} ${answer.index ? 'sitemaps' : 'addresses'}${answer.problem === undefined ? '' : ` (${answer.problem})`}`;
  const delay = answer.crawlDelay === undefined ? '' : `  asks ${answer.crawlDelay} s`;
  return `${answer.host.padEnd(28)} robots ${String(answer.robotsStatus).padStart(3)}  ${verdict}${delay}`;
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
