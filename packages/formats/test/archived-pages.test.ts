import { describe, expect, it } from 'vitest';
import { indexQuery, latestSnapshots, snapshotAddress, snapshotDate } from '../../../tools/data/firearms/archived-pages.ts';

/**
 * Reading a page a maker no longer serves from the Wayback Machine (#30). The index answers in the shape
 * the archive documents: a JSON table whose first row names the columns. The captures are made up.
 */
describe('the archive of a page that is gone', () => {
  const answer = JSON.stringify([
    ['original', 'timestamp'],
    ['https://ruger.com/products/gp100/specSheets/1707.html', '20240115093000'],
    ['https://ruger.com/products/gp100/specSheets/1707.html?buy=1', '20250310120000'],
    ['https://ruger.com/products/gp100/specSheets/1752.html', '20231201080000'],
    ['https://ruger.com/products/gp100/specSheets/1752.html', 'not-a-time'],
  ]);

  it('takes the latest capture of each page, its address without the query', () => {
    expect(latestSnapshots(answer)).toEqual([
      { original: 'https://ruger.com/products/gp100/specSheets/1707.html', timestamp: '20250310120000' },
      { original: 'https://ruger.com/products/gp100/specSheets/1752.html', timestamp: '20231201080000' },
    ]);
  });

  it('takes the addresses one page was archived under over the years for that one page', () => {
    const years = JSON.stringify([
      ['original', 'timestamp'],
      ['http://www.ruger.com:80/products/gp100/specSheets/1702.html', '20100427050209'],
      ['http://ruger.com/products/gp100/specSheets/1702.html', '20110108063037'],
      ['https://ruger.com/products/gp100/specSheets/1702.html', '20250601000000'],
    ]);
    expect(latestSnapshots(years)).toEqual([{ original: 'https://ruger.com/products/gp100/specSheets/1702.html', timestamp: '20250601000000' }]);
  });

  it('cites the snapshot and the day it was captured', () => {
    const [snapshot] = latestSnapshots(answer);
    expect(snapshotAddress(snapshot!)).toBe('https://web.archive.org/web/20250310120000/https://ruger.com/products/gp100/specSheets/1707.html');
    expect(snapshotDate(snapshot!)).toBe('2025-03-10');
  });

  it('gives nothing for an answer that is not the table, such as the archive being offline', () => {
    expect(latestSnapshots('<html><title>Internet Archive: Temporarily Offline</title></html>')).toEqual([]);
    expect(latestSnapshots('[]')).toEqual([]);
  });

  it('asks the index for the pages answered 200 under a prefix', () => {
    const query = new URL(indexQuery('ruger.com/products/gp100/specSheets/'));
    expect(query.searchParams.get('matchType')).toBe('prefix');
    expect(query.searchParams.get('filter')).toBe('statuscode:200');
  });
});

describe('a crawl told to read families from the archive', () => {
  it('takes each family named, and never a value for the output folder', async () => {
    const { archivedFamilies } = await import('../../../tools/data/firearms/ruger.ts');
    const { crawlArguments } = await import('../../../tools/data/firearms/maker-site.ts');
    const argv = ['--archived', 'gp100', '/tmp/ruger', '--archived', 'sp101', '--limit', '5'];
    expect(archivedFamilies(argv)).toEqual(['gp100', 'sp101']);
    expect(crawlArguments('ruger', argv)).toEqual({ folder: '/tmp/ruger', limit: 5 });
  });
});
