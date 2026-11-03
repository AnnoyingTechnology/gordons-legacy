import type { Load, ShotGroup } from '@gordons-legacy/formats';

/**
 * The load without one of its shot groups, and without the target photo that only this group used.
 * The photo is the bulk of a group (a downscaled JPEG, often hundreds of kilobytes), and a photo nothing
 * points to would otherwise be saved with the load, and synced, forever.
 *
 * A photo is kept when another group still refers to it (the format allows two groups on one photo), and
 * the other groups' photo indices are shifted down past the removed one, since pictures are referred to
 * by their position in `load.pictures`.
 */
export function withoutShotGroup(load: Load, groupIndex: number): Load {
  const groups = load.shotGroups ?? [];
  const removed = groups[groupIndex];
  if (removed === undefined) return load;
  const remaining = groups.filter((_, position) => position !== groupIndex);
  const photoIndex = removed.picture?.index;
  const photoStillUsed = remaining.some((group) => group.picture?.index === photoIndex);
  if (photoIndex === undefined || photoStillUsed || load.pictures[photoIndex] === undefined) return { ...load, shotGroups: remaining };
  return {
    ...load,
    pictures: load.pictures.filter((_, position) => position !== photoIndex),
    shotGroups: remaining.map((group) => withPhotoIndexAfterRemoval(group, photoIndex)),
  };
}

function withPhotoIndexAfterRemoval(group: ShotGroup, removedPhotoIndex: number): ShotGroup {
  if (group.picture === undefined || group.picture.index < removedPhotoIndex) return group;
  return { ...group, picture: { ...group.picture, index: group.picture.index - 1 } };
}
