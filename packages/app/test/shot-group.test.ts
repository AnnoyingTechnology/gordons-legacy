import { expect, test } from 'vitest';
import type { Picture, ShotGroup } from '@gordons-legacy/formats';
import { groupStatistics, milliradians, minutesOfAngle } from '../src/analysis/shot-group.ts';
import { withoutShotGroup } from '../src/editor/shot-groups.ts';
import { exampleLoad } from '../src/state/example-load.ts';

test('a square of four hits 10 mm apart', () => {
  const statistics = groupStatistics([
    { x: 0, y: 0 },
    { x: 0.01, y: 0 },
    { x: 0, y: 0.01 },
    { x: 0.01, y: 0.01 },
  ])!;
  expect(statistics.centre).toEqual({ x: 0.005, y: 0.005 });
  expect(statistics.extremeSpread).toBeCloseTo(Math.SQRT2 * 0.01, 12);
  expect(statistics.minimumSpacing).toBeCloseTo(0.01, 12);
  expect(statistics.meanRadius).toBeCloseTo((Math.SQRT2 * 0.01) / 2, 12);
  // Four values ±5 mm about the mean: sample SD √(4·25/3) mm.
  expect(statistics.horizontalDeviation).toBeCloseTo(Math.sqrt(100 / 3) / 1000, 12);
});

test('one hit is no group', () => {
  expect(groupStatistics([{ x: 0, y: 0 }])).toBeUndefined();
});

test('29.1 mm at 100 m is one minute of angle, 0.291 mrad', () => {
  expect(minutesOfAngle(0.0290888, 100)).toBeCloseTo(1, 4);
  expect(milliradians(0.0290888, 100)).toBeCloseTo(0.290888, 5);
});

const photo = (name: string): Picture => ({ name, mediaType: 'image/jpeg', width: 10, height: 10, data: 'AAAA' });
const groupOn = (title: string, photoIndex: number): ShotGroup => ({ title, distance: 100, hits: [], note: '', picture: { index: photoIndex, metresPerPixel: 0.001 } });
const loadWith = (pictures: Picture[], shotGroups: ShotGroup[]) => ({ ...exampleLoad({ title: 'Load', note: '' })!, pictures, shotGroups });

test('removing a shot group removes its photo, and the later photos move up', () => {
  const gallery = photo('chronograph.jpg');
  const load = loadWith([gallery, photo('100 m.jpg'), photo('200 m.jpg')], [groupOn('100 m', 1), groupOn('200 m', 2)]);
  const removed = withoutShotGroup(load, 0);
  expect(removed.pictures).toEqual([gallery, photo('200 m.jpg')]);
  expect(removed.shotGroups).toEqual([groupOn('200 m', 1)]);
});

test('removing a shot group keeps a photo another group still uses', () => {
  const load = loadWith([photo('target.jpg')], [groupOn('first five', 0), groupOn('next five', 0)]);
  const removed = withoutShotGroup(load, 0);
  expect(removed.pictures).toEqual([photo('target.jpg')]);
  expect(removed.shotGroups).toEqual([groupOn('next five', 0)]);
});

test('removing a shot group entered by hand leaves the pictures alone', () => {
  const byHand: ShotGroup = { title: 'by hand', distance: 100, hits: [{ x: 0, y: 0 }], note: '' };
  const load = loadWith([photo('gallery.jpg')], [byHand]);
  const removed = withoutShotGroup(load, 0);
  expect(removed.pictures).toEqual([photo('gallery.jpg')]);
  expect(removed.shotGroups).toEqual([]);
});
