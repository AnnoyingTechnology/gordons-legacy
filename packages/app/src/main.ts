const welcomeKey = 'gordons-legacy.welcome-seen';
const welcome = document.getElementById('welcome') as HTMLDialogElement;
if (localStorage.getItem(welcomeKey) === null) {
  welcome.addEventListener('close', () => localStorage.setItem(welcomeKey, '1'), { once: true });
  welcome.showModal();
}

const repo = 'https://github.com/AnnoyingTechnology/gordons-legacy';

const rows: [string, string | HTMLElement][] = [
  ['Milestone', __MILESTONE__],
  ['Build', link(`${repo}/commit/${__BUILD_COMMIT__}`, __BUILD_COMMIT__.slice(0, 7))],
  ['Built', __BUILD_DATE__],
  ['Progress', link(`${repo}/blob/main/docs/PROGRESS.md`, 'docs/PROGRESS.md')],
  ['Plan', link(`${repo}/blob/main/docs/PLAN.md`, 'docs/PLAN.md')],
];

const status = document.getElementById('status')!;
for (const [term, value] of rows) {
  const dt = document.createElement('dt');
  dt.textContent = term;
  const dd = document.createElement('dd');
  dd.append(value);
  status.append(dt, dd);
}

function link(href: string, text: string): HTMLAnchorElement {
  const a = document.createElement('a');
  a.href = href;
  a.textContent = text;
  return a;
}
