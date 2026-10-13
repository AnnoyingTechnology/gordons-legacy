import { importGrtLoad, serializeLoad, type ImportIssue, type ImportResult, type Load } from '@gordons-legacy/formats';
import { element, fillDefinitionList } from '../dom.ts';
import { summarizeLoad } from './load-summary.ts';
import { renderSimulation } from './simulation-view.ts';
import { grtTraditional } from '@gordons-legacy/engine';

/**
 * A preview of the GRT importer: the user opens or drops a `.grtload` file and sees what was read, the
 * issues found, and can download the load in Gordon's Legacy's JSON format. Files never leave the browser.
 */
export function setupLoadViewer(fileInput: HTMLInputElement, dropZone: HTMLElement, output: HTMLElement): void {
  const open = async (file: File) => {
    const result = importGrtLoad(await file.text(), { fileName: file.name });
    output.replaceChildren(renderImport(file.name, result));
  };

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file !== undefined) void open(file);
  });

  dropZone.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropZone.classList.add('dragging');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragging'));
  dropZone.addEventListener('drop', (event) => {
    event.preventDefault();
    dropZone.classList.remove('dragging');
    const file = event.dataTransfer?.files[0];
    if (file !== undefined) void open(file);
  });
}

function renderImport(fileName: string, result: ImportResult<Load>): HTMLElement {
  const container = element('div', { class: 'import-result' }, [element('h3', {}, [fileName])]);
  if (result.issues.length > 0) container.append(renderIssues(result.issues));
  if (!result.ok) {
    container.append(element('p', { class: 'error' }, ['The file could not be imported.']));
    return container;
  }

  const groups = element('div', { class: 'summary' });
  for (const group of summarizeLoad(result.value)) {
    const list = element('dl');
    fillDefinitionList(list, group.rows);
    groups.append(element('section', {}, [element('h4', {}, [group.title]), list]));
  }
  container.append(renderSimulation(result.value, grtTraditional.simulate(result.value)), groups, downloadLink(fileName, result.value));
  return container;
}

const SEVERITY_LABELS: Record<ImportIssue['severity'], string> = {
  error: 'Error',
  warning: 'Check',
  info: 'Note',
};

function renderIssues(issues: ImportIssue[]): HTMLUListElement {
  return element(
    'ul',
    { class: 'issues' },
    issues.map((issue) =>
      element('li', { class: issue.severity }, [
        element('span', { class: 'severity' }, [SEVERITY_LABELS[issue.severity]]),
        ` ${issue.message}`,
        ...(issue.path === undefined ? [] : [' ', element('code', {}, [issue.path])]),
      ]),
    ),
  );
}

function downloadLink(fileName: string, load: Load): HTMLAnchorElement {
  const blob = new Blob([serializeLoad(load)], { type: 'application/json' });
  const jsonName = `${fileName.replace(/\.grtload$/i, '')}.json`;
  return element('a', { class: 'button', href: URL.createObjectURL(blob), download: jsonName }, [
    `Download ${jsonName}`,
  ]);
}
