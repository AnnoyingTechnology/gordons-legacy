import { describe, expect, it } from 'vitest';
import { blocks, readRobots, readSitemap, summaryLine } from '../../../tools/data/firearms/survey-site.ts';

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
    expect(read.disallowsEveryone).toBe(false);
    expect(read.sitemaps).toEqual(['https://example.invalid/sitemap.xml']);
  });

  it('tells a delay asked of everyone from one asked of a named crawler', () => {
    // Springfield Armory's shape: five minutes a page, but only for ChatGPT-User and bingbot.
    expect(readRobots('User-agent: *\nDisallow: /wp-includes/\n\nUser-agent: ChatGPT-User\nCrawl-delay: 300\n').crawlDelay).toBeUndefined();
    expect(readRobots('User-agent: *\nCrawl-delay: 10\nDisallow:\n').crawlDelay).toBe(10);
  });

  it('sees a blanket refusal, whichever order the rules come in', () => {
    expect(readRobots('User-agent: *\nDisallow: /\n').disallowsEveryone).toBe(true);
    expect(readRobots('User-agent: *\nAllow: /public\nDisallow: /\n').disallowsEveryone).toBe(true);
    expect(readRobots('User-agent: Bytespider\nDisallow: /\n').disallowsEveryone).toBe(false);
  });

  it('counts a catalogue, and knows an index of sitemaps from a list of pages', () => {
    expect(readSitemap('<urlset><url><loc>https://a/1</loc></url><url><loc>https://a/2</loc></url></urlset>')).toEqual({ entries: 2, index: false });
    expect(readSitemap('<sitemapindex><sitemap><loc>https://a/products.xml</loc></sitemap></sitemapindex>')).toEqual({ entries: 1, index: true });
  });

  it('says in one line what a person has to decide on', () => {
    const answer = { host: 'example.invalid', robotsStatus: 200, disallowsEveryone: false, refusedCrawlers: [], sitemaps: [], entries: 553, index: false };
    expect(summaryLine(answer)).toBe('example.invalid              robots 200  553 addresses');
    expect(summaryLine({ ...answer, refusedCrawlers: ['ClaudeBot'] })).toContain('refuses ClaudeBot');
    expect(summaryLine({ ...answer, robotsStatus: 403 })).toContain('robots.txt itself answers 403');
    expect(summaryLine({ ...answer, crawlDelay: 10 })).toContain('asks 10 s');
  });
});
