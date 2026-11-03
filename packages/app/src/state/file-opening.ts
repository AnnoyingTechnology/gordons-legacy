import { errorMessages, FIREARM_FORMAT, importGrtProjectiles, importGrtPropellant, importGrtrace, parseFirearm, type Projectile } from '@gordons-legacy/formats';
import { withProjectile, withPropellant } from '../editor/components.ts';
import type { MessageKey } from '../i18n/i18n.ts';
import { readChronographCsv, type ChronographCsv } from '../measurements/chronograph-csv.ts';
import type { ComponentLibrary } from './components.ts';
import type { DocumentStore } from './documents.ts';
import type { FirearmLibrary } from './firearms.ts';
import type { Library } from './library.ts';

/*
 * What a file holds and where it goes, whichever way it came in: opened from the toolbar or dropped on
 * the editor (`openInEditor`), or imported from the library view (`importIntoLibrary`). Both decide with
 * `fileKind`, so a file is never one thing in the editor and another in the library.
 */

/** A file's name and its text, read once. */
export interface FileText {
  name: string;
  text: string;
}

export type FileKind = 'load' | 'propellant' | 'projectile' | 'caliber' | 'firearm' | 'trace' | 'chronograph';

/** Where opened files end up: the open loads, and the user's components, guns and saved loads. */
export interface FileDestinations {
  documents: DocumentStore;
  components: ComponentLibrary;
  firearms: FirearmLibrary;
  library: Library;
}

/** What opening files leaves for the shell to show, beyond the changes already made. */
export interface OpenedFiles {
  /** Why some of the files couldn't be used. */
  errors: string[];
  /** A load was opened in a new tab, so the editor should show it. */
  loadOpened: boolean;
  /** The projectiles of a `.projectile` file holding several, for the user to choose the active load's. */
  projectileChoice?: Projectile[];
  /** A chronograph export waiting for the user to confirm its column and unit. */
  chronograph?: { csv: ChronographCsv; fileName: string };
}

type Translate = (key: MessageKey, parameters?: Record<string, string>) => string;

/** Reads the text of files the user chose or dropped. */
export function readFiles(files: Iterable<File>): Promise<FileText[]> {
  return Promise.all([...files].map(async (file) => ({ name: file.name, text: await file.text() })));
}

/**
 * What a file holds. GRT's component and trace files and chronograph exports are told by their extension.
 * A gun is JSON, like a saved load, so it is told by what it says it is. Anything else is read as a load.
 */
export function fileKind({ name, text }: FileText): FileKind {
  const extension = name.slice(name.lastIndexOf('.')).toLowerCase();
  if (extension === '.propellant') return 'propellant';
  if (extension === '.projectile') return 'projectile';
  if (extension === '.caliber') return 'caliber';
  if (extension === '.grtrace') return 'trace';
  if (extension === '.csv') return 'chronograph';
  if (text.includes(FIREARM_FORMAT)) return 'firearm';
  return 'load';
}

/**
 * Opens files in the editor. A load opens in a new tab. A powder or projectile replaces the active load's
 * and is kept in the component library; a caliber is only kept there. A pressure trace or chronograph
 * export is added to the active load's measurements. A gun is kept in the gun library.
 */
export async function openInEditor(files: readonly FileText[], destinations: FileDestinations, t: Translate): Promise<OpenedFiles> {
  const { documents, components, firearms } = destinations;
  const opened: OpenedFiles = { errors: [], loadOpened: false };
  for (const file of files) {
    const kind = fileKind(file);
    if (kind === 'propellant' || kind === 'projectile') {
      opened.errors.push(...putComponent(kind, file.text, documents, opened, t));
      // Kept for later too. A file that can't be read was reported just above.
      await components.importFile(file.name, file.text);
    } else if (kind === 'caliber') {
      opened.errors.push(...(await components.importFile(file.name, file.text)));
    } else if (kind === 'trace') {
      opened.errors.push(...addTrace(file.text, documents, t));
    } else if (kind === 'chronograph') {
      opened.errors.push(...readChronograph(file.name, file.text, documents, opened, t));
    } else if (kind === 'firearm') {
      opened.errors.push(...(await keepFirearm(file, firearms, t)));
    } else {
      const result = documents.open(file.name, file.text);
      if (result.ok) opened.loadOpened = true;
      else opened.errors.push(...errorMessages(result.issues));
    }
  }
  return opened;
}

/**
 * Imports files into the library: loads as saved loads, powders, projectiles and calibers into the
 * component library, guns into the gun library. Returns why some of the files couldn't be used.
 */
export async function importIntoLibrary(files: readonly FileText[], destinations: FileDestinations, t: Translate): Promise<string[]> {
  const { components, firearms, library } = destinations;
  const errors: string[] = [];
  const loads: FileText[] = [];
  for (const file of files) {
    const kind = fileKind(file);
    if (kind === 'propellant' || kind === 'projectile' || kind === 'caliber') {
      errors.push(...(await components.importFile(file.name, file.text)));
    } else if (kind === 'firearm') {
      errors.push(...(await keepFirearm(file, firearms, t)));
    } else if (kind === 'trace' || kind === 'chronograph') {
      // A measurement belongs to a load: the library has nowhere to keep one on its own.
      errors.push(t('library.importFailed', { name: file.name }));
    } else {
      loads.push(file);
    }
  }
  const failed = await library.importFiles(loads);
  return [...failed.map((name) => t('library.importFailed', { name })), ...errors];
}

/** Puts a powder or projectile into the active load; returns error messages. */
function putComponent(kind: 'propellant' | 'projectile', text: string, documents: DocumentStore, opened: OpenedFiles, t: Translate): string[] {
  const active = documents.active;
  if (!active) return [t('components.noLoad')];
  if (kind === 'propellant') {
    const result = importGrtPropellant(text);
    if (!result.ok) return errorMessages(result.issues);
    documents.update(active.id, withPropellant(active.load, result.value));
    return [];
  }
  const result = importGrtProjectiles(text);
  if (!result.ok) return errorMessages(result.issues);
  if (result.value.length === 1) documents.update(active.id, withProjectile(active.load, result.value[0]!));
  else opened.projectileChoice = result.value;
  return [];
}

/** Adds a PressureTrace recording to the active load's measurements; returns error messages. */
function addTrace(text: string, documents: DocumentStore, t: Translate): string[] {
  const active = documents.active;
  if (!active) return [t('components.noLoad')];
  const result = importGrtrace(text);
  if (!result.ok) return errorMessages(result.issues);
  documents.update(active.id, { ...active.load, measurements: [...active.load.measurements, result.value] });
  return [];
}

/** Reads a chronograph export for the user to confirm; returns error messages. */
function readChronograph(fileName: string, text: string, documents: DocumentStore, opened: OpenedFiles, t: Translate): string[] {
  if (!documents.active) return [t('components.noLoad')];
  const csv = readChronographCsv(text);
  if (!csv) return [t('chronograph.nothing', { file: fileName })];
  opened.chronograph = { csv, fileName };
  return [];
}

/** A gun file, into the gun library: the same place "Save as a gun" puts one. Returns error messages. */
async function keepFirearm({ name, text }: FileText, firearms: FirearmLibrary, t: Translate): Promise<string[]> {
  const result = parseFirearm(text);
  if (!result.ok) return [t('library.importFailed', { name })];
  try {
    await firearms.save(result.value);
    return [];
  } catch {
    return [t('library.saveFailed')];
  }
}
