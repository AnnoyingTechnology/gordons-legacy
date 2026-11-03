import { afterEach, describe, expect, it, vi } from 'vitest';
import { DELAY } from '../../../tools/data/firearms/maker-site.ts';
import { blocks, PRODUCT_TOKEN, readRobots, readSitemap, summaryLine, survey } from '../../../tools/data/firearms/survey-site.ts';

/**
 * The first step of a gun intake: what a maker's `robots.txt` says about being read
 * (tools/data/firearms/survey-site.ts, issue #30). The files below are in the shape the real ones have —
 * Cloudflare's default list of AI crawlers is on a great many sites now — with invented hosts.
 */
describe('surveying a maker site', () => {
  const CLOUDFLARE = `# As a condition of accessing this website, you agree to the content signals.
User-agent: *
Content-Signal: search=yes,ai-train=no
Disallow: /cart/

User-agent: Amazonbot
Disallow: /

User-agent: ClaudeBot
Disallow: /

User-agent: GPTBot
Disallow: /

Sitemap: https://example.invalid/sitemap.xml
`;

  it('splits a file into its blocks, comments and blank lines dropped', () => {
    expect(blocks('# a note\nUser-agent: A\nUser-agent: B\nDisallow: /x\n\nUser-agent: C\nAllow: /\n')).toEqual([
      { agents: ['A', 'B'], rules: ['disallow: /x'] },
      { agents: ['C'], rules: ['allow: /'] },
    ]);
  });

  it('reads a refusal of AI crawlers as a refusal of this intake', () => {
    const read = readRobots(CLOUDFLARE);
    expect(read.refusedCrawlers).toEqual(['Amazonbot', 'ClaudeBot', 'GPTBot']);
    // Everyone else is welcome everywhere but the basket, which is why the file has to be read in blocks
    // and not searched for the word `Disallow`.
    expect(read.disallowsUs).toBe(false);
    expect(read.sitemaps).toEqual(['https://example.invalid/sitemap.xml']);
  });

  it('tells a delay asked of everyone from one asked of a named crawler', () => {
    // Springfield Armory's shape: five minutes a page, but only for ChatGPT-User and bingbot.
    expect(readRobots('User-agent: *\nDisallow: /wp-includes/\n\nUser-agent: ChatGPT-User\nCrawl-delay: 300\n').crawlDelay).toBeUndefined();
    expect(readRobots('User-agent: *\nCrawl-delay: 10\nDisallow:\n').crawlDelay).toBe(10);
  });

  it('sees a blanket refusal, whichever order the rules come in', () => {
    expect(readRobots('User-agent: *\nDisallow: /\n').disallowsUs).toBe(true);
    expect(readRobots('User-agent: *\nAllow: /public\nDisallow: /\n').disallowsUs).toBe(true);
    expect(readRobots('User-agent: Bytespider\nDisallow: /\n').disallowsUs).toBe(false);
  });

  it('obeys a group naming this crawl before the one for everyone', () => {
    expect(PRODUCT_TOKEN).toBe('gordons-legacy-research');
    // Everyone is welcome, but this crawl by name is not: the `*` group says nothing about us here.
    expect(readRobots('User-agent: *\nDisallow:\n\nUser-agent: gordons-legacy-research\nDisallow: /\n').disallowsUs).toBe(true);
    // And the other way round: shut to everyone, open to us. The name is matched ignoring case.
    expect(readRobots('User-agent: *\nDisallow: /\n\nUser-agent: Gordons-Legacy-Research\nAllow: /\n').disallowsUs).toBe(false);
    // Our group's delay is the one we keep, even where `*` asks for another or for none.
    expect(readRobots('User-agent: *\nCrawl-delay: 1\n\nUser-agent: gordons-legacy-research\nCrawl-delay: 10\n').crawlDelay).toBe(10);
    expect(readRobots('User-agent: *\nDisallow: /cart/\n\nUser-agent: gordons-legacy-research\nCrawl-delay: 5\n').crawlDelay).toBe(5);
  });

  it('takes two groups naming this crawl together', () => {
    const robots = 'User-agent: gordons-legacy-research\nCrawl-delay: 5\n\nUser-agent: *\nAllow: /\n\nUser-agent: gordons-legacy-research\nDisallow: /\n';
    expect(readRobots(robots)).toMatchObject({ disallowsUs: true, crawlDelay: 5 });
  });

  it('counts a catalogue, and knows an index of sitemaps from a list of pages', () => {
    expect(readSitemap('<urlset><url><loc>https://a/1</loc></url><url><loc>https://a/2</loc></url></urlset>')).toEqual({ entries: 2, index: false });
    expect(readSitemap('<sitemapindex><sitemap><loc>https://a/products.xml</loc></sitemap></sitemapindex>')).toEqual({ entries: 1, index: true });
  });

  it('says in one line what a person has to decide on', () => {
    const answer = { host: 'example.invalid', robotsStatus: 200, disallowsUs: false, refusedCrawlers: [], sitemaps: [], entries: 553, index: false };
    expect(summaryLine(answer)).toBe('example.invalid              robots 200  553 addresses');
    expect(summaryLine({ ...answer, refusedCrawlers: ['ClaudeBot'] })).toContain('refuses ClaudeBot');
    expect(summaryLine({ ...answer, robotsStatus: 403 })).toContain('robots.txt itself answers 403');
    expect(summaryLine({ ...answer, crawlDelay: 10 })).toContain('asks 10 s');
    expect(summaryLine({ ...answer, robotsStatus: 503, disallowsUs: true })).toContain('robots.txt answers 503, read as a refusal');
  });
});

/**
 * What `survey` does with a `robots.txt` that cannot be read, against a stand-in for the network: per
 * RFC 9309, a server error or no answer at all forbids everything, and a 404 forbids nothing.
 */
describe('surveying a site whose robots.txt cannot be read', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  /** A network that answers every address with the next of these responses, keeping what was asked. */
  function network(...answers: Array<Response | Error>): string[] {
    const asked: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      asked.push(url);
      const answer = answers.shift() ?? new Response('', { status: 404 });
      if (answer instanceof Error) throw answer;
      return answer;
    });
    return asked;
  }

  it('reads a server error as a refusal, and asks nothing more', async () => {
    const asked = network(new Response('', { status: 503 }));
    const answer = await survey('example.invalid');
    expect(answer).toMatchObject({ robotsStatus: 503, disallowsUs: true, problem: 'robots.txt answered 503' });
    expect(asked).toEqual(['https://example.invalid/robots.txt']);
  });

  it('reads no answer at all as a refusal too', async () => {
    const asked = network(new Error('getaddrinfo ENOTFOUND example.invalid'));
    const answer = await survey('example.invalid');
    expect(answer).toMatchObject({ robotsStatus: 0, disallowsUs: true, problem: 'getaddrinfo ENOTFOUND example.invalid' });
    expect(asked).toHaveLength(1);
  });

  it('reads a missing robots.txt as no rules, and goes on to the sitemap', async () => {
    vi.useFakeTimers();
    const asked = network(
      new Response('', { status: 404 }),
      new Response('<urlset><url><loc>https://example.invalid/rifle</loc></url></urlset>', { status: 200 }),
    );
    const surveying = survey('example.invalid');
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(await surveying).toMatchObject({ robotsStatus: 404, disallowsUs: false, entries: 1 });
    expect(asked).toEqual(['https://example.invalid/robots.txt', 'https://example.invalid/sitemap.xml']);
  });
});
