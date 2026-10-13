import './components/app-shell.ts';
import { enableOffline } from './offline.ts';
import { renderStatus } from './status.ts';
import { showWelcomeOnFirstVisit } from './welcome.ts';

function byId<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (found === null) throw new Error(`Missing element #${id} in index.html`);
  return found as T;
}

showWelcomeOnFirstVisit(byId('welcome'));
renderStatus(byId('status'));
enableOffline();
