import { fillDefinitionList, link } from './dom.ts';

const REPOSITORY = 'https://github.com/AnnoyingTechnology/gordons-legacy';

/** Fills the development status list: milestone, build and links to the plan and progress record. */
export function renderStatus(list: HTMLDListElement): void {
  fillDefinitionList(list, [
    ['Milestone', __MILESTONE__],
    ['Build', link(`${REPOSITORY}/commit/${__BUILD_COMMIT__}`, __BUILD_COMMIT__.slice(0, 7))],
    ['Built', __BUILD_DATE__],
    ['Progress', link(`${REPOSITORY}/blob/main/docs/PROGRESS.md`, 'docs/PROGRESS.md')],
    ['Plan', link(`${REPOSITORY}/blob/main/docs/PLAN.md`, 'docs/PLAN.md')],
  ]);
}
