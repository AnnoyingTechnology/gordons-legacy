import { describe, expect, it } from 'vitest';
import { readChronographCsv } from '../src/measurements/chronograph-csv.ts';

// Layouts in the style of common devices; the values are made up.
const LABRADAR_STYLE = `sep=;
Device ID;LBR-0123456;
Series No;0001;
Units velocity;fps;
Units distances;yd;

Shot ID;V0;V10;V20;Date;Time
0001;2124.5;2101.2;2078.0;10-30-2020;14:18:49
0002;2130.1;2106.8;2083.4;10-30-2020;14:19:30
0003;2119.9;2096.6;2073.3;10-30-2020;14:20:02
`;

const MAGNETOSPEED_STYLE = `Series,1
Shot,Speed (m/s)
1,686.2
2,684.9
3,688.0
`;

describe('readChronographCsv', () => {
  it('finds the V0 column and the stated unit in a semicolon file', () => {
    const csv = readChronographCsv(LABRADAR_STYLE)!;
    const column = csv.columns[csv.suggestedColumn]!;
    expect(column.header).toBe('V0');
    expect(column.values).toEqual([2124.5, 2130.1, 2119.9]);
    expect(csv.statedUnit).toBe('ft/s');
  });

  it('finds a speed column in metres per second in a comma file', () => {
    const csv = readChronographCsv(MAGNETOSPEED_STYLE)!;
    expect(csv.columns[csv.suggestedColumn]).toEqual({ header: 'Speed (m/s)', values: [686.2, 684.9, 688.0] });
    expect(csv.statedUnit).toBe('m/s');
  });

  it('leaves the unit to the user when the file does not say', () => {
    expect(readChronographCsv('Shot;Velocity\n1;812\n2;815\n')!.statedUnit).toBeUndefined();
  });

  it('finds nothing in a file without velocities', () => {
    expect(readChronographCsv('a,b\n1,2\n')).toBeUndefined();
  });
});
