# Everyday document workflow audit (#34)

Reviewed 2026-10-16. This covers document management and navigation, independently of the simulation
model. R2 is outside this work.

| Task | Finding and current behavior |
|---|---|
| Create a load | New in the toolbar and empty state. Two paths: clone an open/saved load, or guided setup. The guide starts with a gun or cartridge, then projectile, powder and a final name/input review. Searchable, large choices work on phones too. |
| Start from a gun | Own guns and barrels from saved loads precede published records. Published guns load on demand. The user explicitly chooses a cartridge; a text match is not a chambering decision. |
| Complete missing inputs | Only values present in selected records are filled. Remaining required values are entered before a valid document is created; no example charge or case capacity is silently copied. Changing the cartridge clears the previous component choices and their values. |
| Clone | Open edits take precedence over their saved library snapshot. The copy is independent and unsaved, with no library id, measurements, targets, notes, pictures or imported-file metadata. Powder calibration metadata stays with its parameters. The UI explains this before creation. |
| Rename | Editable load name above the editor updates the title and tab/file name together. It preserves the library identity and marks the load dirty. |
| Save / Export | Save writes to the local library; Export writes a shareable JSON file. Tooltips distinguish them. Save completion records the exact written snapshot, so edits made during a save remain dirty. |
| Close a load | Edited documents ask Save and close / Discard changes / Cancel. A failed save retains the document. Focus moves to the surviving active tab, or New when none remain. Comparison returns to the editor if fewer than two loads remain. |
| Open from another view | Imported loads become visible in the editor even when opened from Library or Compare. |
| Shortcuts | Toolbar help has an explicit, persisted opt-in: Alt/Option+Shift+N for New, Alt/Option+Shift+W for Close, Ctrl/Cmd+S for Save. Modal dialogs suspend these shortcuts. Ctrl/Cmd+W and Ctrl/Cmd+N remain browser commands. |
| Local tab navigation | While a tab button has focus, Left/Right, Home/End navigate; Delete requests its guarded close. These keys do not capture editing in other controls. |
| Reload recovery | Open documents persist in localStorage, including their saved snapshots and library identities. Existing storage-full warning remains visible. Library/guns have backup and restore. |

## Remaining work

- Serialize repeated saves of one document: two overlapping first saves can create separate library
  entries before the first completion supplies the document's library id.
- Report file export failures separately from a user cancelling the native picker. Currently both
  return false with no explanation.
- Gun removal in the library needs the same confirmation as saved-load removal.
- No document-level Undo/Redo or Reopen closed load. Native text-field undo remains available; it does
  not undo a component replacement or a closed tab. These need an explicit bounded history design.
- Browser coverage so far is Chromium on Linux. Native macOS/Windows keyboard behavior and Firefox/
  Safari file downloads remain manual checks; browser-reserved shortcuts cannot be promised across
  platforms.

## Verification and references

Vitest covers creation validation, source independence, clone-source deduplication, rename/save
snapshots, shortcut modifiers and the opt-in preference. Headless Chromium exercises both funnels,
open/saved clones, missing/invalid inputs, Back, search, rename, dialog focus, guarded close, save
failure, reload recovery and keyboard navigation. Layouts were inspected at desktop and 390 px phone
widths in both themes. All five language catalogs compile and render.

The local tab keys follow the [WAI-ARIA tabs keyboard conventions](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/).
These controls remain ordinary navigation buttons, without claiming tab-panel semantics they do not
implement. Application commands use separate combinations because
[`preventDefault()` only affects cancelable events](https://developer.mozilla.org/en-US/docs/Web/API/Event/preventDefault);
it cannot guarantee interception of browser chrome commands.
