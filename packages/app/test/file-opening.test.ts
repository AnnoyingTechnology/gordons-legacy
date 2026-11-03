import { readFileSync } from 'node:fs';
import { serializeFirearm } from '@gordons-legacy/formats';
import { describe, expect, test } from 'vitest';
import { ComponentLibrary, type ComponentEntry } from '../src/state/components.ts';
import { DocumentStore } from '../src/state/documents.ts';
import { exampleLoad } from '../src/state/example-load.ts';
import { fileKind, importIntoLibrary, openInEditor, type FileDestinations } from '../src/state/file-opening.ts';
import { FirearmLibrary, newFirearm, type FirearmEntry } from '../src/state/firearms.ts';
import { memoryStore } from '../src/state/indexed-db.ts';
import { Library } from '../src/state/library.ts';
import { memoryStorage } from '../src/state/library-storage.ts';

function fixtureText(path: string): string {
  return readFileSync(new URL(`../../formats/test/fixtures/${path}`, import.meta.url), 'utf8');
}

const caliber = { name: '308 Win.caliber', text: fixtureText('cc0/calibers/308_Win._Winchester_308_Winchester_762_x_51_by_Charlie_2023.06.28.caliber') };
const powder = { name: 'Red Dot.propellant', text: fixtureText('cc0/powders/Alliant_Red_Dot_-_2023_06_21_by_Tom24_2023.06.21.propellant') };
const translate = (key: string) => key;

function destinations(): FileDestinations {
  return {
    documents: new DocumentStore(),
    components: new ComponentLibrary(memoryStore<ComponentEntry>(), []),
    firearms: new FirearmLibrary(memoryStore<FirearmEntry>()),
    library: new Library(memoryStorage()),
  };
}

describe('fileKind', () => {
  test('tells a file by its extension, and a gun from a load by what its JSON says it is', () => {
    expect(fileKind(caliber)).toBe('caliber');
    expect(fileKind(powder)).toBe('propellant');
    expect(fileKind({ name: 'shots.CSV', text: '' })).toBe('chronograph');
    expect(fileKind({ name: 'trace.grtrace', text: '' })).toBe('trace');
    expect(fileKind({ name: 'gun.json', text: serializeFirearm(newFirearm()) })).toBe('firearm');
    expect(fileKind({ name: 'load.grtload', text: '' })).toBe('load');
  });
});

/** A dropped `.caliber` file used to be read as a load and fail, while the library's import kept it. */
test('a .caliber file goes to the component library whether opened in the editor or imported into the library', async () => {
  const editor = destinations();
  const opened = await openInEditor([caliber], editor, translate);
  expect(opened).toEqual({ errors: [], loadOpened: false });
  expect(editor.documents.documents).toHaveLength(0);

  const library = destinations();
  expect(await importIntoLibrary([caliber], library, translate)).toEqual([]);
  expect(library.library.entries).toHaveLength(0);

  const keptByEditor = editor.components.calibers();
  const keptByLibrary = library.components.calibers();
  expect(keptByEditor).toHaveLength(1);
  expect(keptByLibrary).toHaveLength(1);
  expect(keptByEditor[0]!.value).toEqual(keptByLibrary[0]!.value);
});

test("a powder opened in the editor replaces the active load's and is kept in the component library", async () => {
  const editor = destinations();
  editor.documents.openNew('Example.json', exampleLoad({ title: 'Example', note: '' })!);
  const opened = await openInEditor([powder], editor, translate);
  expect(opened.errors).toEqual([]);
  expect(editor.documents.active!.load.propellant.product).toContain('Red Dot');
  expect(editor.components.powders()).toHaveLength(1);
});

test('without an open load, a powder is still kept, and the editor says why the load did not change', async () => {
  const editor = destinations();
  const opened = await openInEditor([powder], editor, translate);
  expect(opened.errors).toEqual(['components.noLoad']);
  expect(editor.components.powders()).toHaveLength(1);
});
