# Everyday document workflow audit (#34)

Reviewed 2026-10-16. This covers document management and navigation, independently of the simulation
model. R2 is outside this work.

| Task | Finding and current behavior |
|---|---|
| Create a load | New in the toolbar and empty state. Two paths: clone an open/saved load, or guided setup. The guide starts with a gun or cartridge, then projectile, powder and a final name/input review. Searchable, large choices work on phones too. |
| Start from a gun | Own guns and barrels from saved loads precede published records. Published guns load on demand. The gun’s cartridge is preselected with Continue and an option to change it. Exact names and explicit synonyms can supply a unique definition from the user’s open/saved loads or the database. Without a definition, the name still carries forward and missing numeric inputs remain blank. |
| Complete missing inputs | Only values present in selected records are filled; an absent cartridge definition does not block the component-selection steps. Matching case variants are offered explicitly, including the seven bundled .308 cases. Selected records supply a labelled reference capacity and available dimensions; manual edits survive a variant change. Remaining required values are entered before a valid document is created; no example charge or case capacity is silently copied. Larger, content-sized fields are grouped into load details, case/barrel and technical details; invalid hidden fields open their section before validation. Changing the cartridge clears the previous component choices and their values. |
| Clone | Open edits take precedence over their saved library snapshot. The copy is independent and unsaved, with no library id, measurements, targets, notes, pictures or imported-file metadata. Powder calibration metadata stays with its parameters. The UI explains this before creation. |
| Rename | The results heading is the load name. Click it (or F2 on its tab) to edit in place; Enter/blur confirms and Escape cancels. No extra toolbar row or permanent input. This updates the title and tab/file name together. It preserves the library identity and marks the load dirty. |
| Save / Export | Save writes to the local library; Export writes a shareable JSON file. Tooltips distinguish them. Saves of one document run in order and share its library identity. Completion records the exact written snapshot, so subsequent edits remain dirty. Keyboard actions commit a still-focused name input first. |
| Export errors | Picker cancellation stays quiet; permission/write failures are reported and leave the document open. Export names replace path separators and invalid filename characters without changing the load title. A successful retry clears the error. |
| Remove saved data | Saved loads and guns both require confirmation before removal. |
| Close a load | Edited documents ask Save and close / Discard changes / Cancel. A failed save retains the document. Focus moves to the surviving active tab, or New when none remain. Comparison returns to the editor if fewer than two loads remain. |
| Open from another view | Imported loads become visible in the editor even when opened from Library or Compare. |
| Shortcuts | Toolbar help has an explicit, persisted opt-in: Alt/Option+Shift+N for New, Alt/Option+Shift+W for Close, Ctrl/Cmd+S for Save. Modal dialogs suspend these shortcuts. Ctrl/Cmd+W and Ctrl/Cmd+N remain browser commands. |
| Local tab navigation | While a tab button has focus, Left/Right, Home/End navigate; F2 edits its name; Delete requests its guarded close. These keys do not capture editing in other controls. |
| Compact results | The load name replaces the redundant simulation heading. The simulation notice is inside the review box, including its loading state, instead of a separate banner. |
| Result cards | Speed legend is at the velocity card’s upper right. Blast annotation sits beside its value, with the full explanation and model uncertainty retained in the tooltip. On phones the blast, case drawing and secondary details span the available width. |
| Page spacing | One page gutter aligns the toolbar, tabs and load contents; input/results headings have no extra top gap. Development notice and build/date share a full-width footer flush with the bottom. The danger hatch follows the panel edges without moving content. |
| Reload recovery | Open documents persist in localStorage, including their saved snapshots and library identities. Invalid entries are skipped independently with a recovery warning; valid tabs and their active selection survive. Invalid display preferences fall back independently. Existing storage-full warning remains visible. Library/guns have backup and restore. |

## Remaining work

- No document-level Undo/Redo or Reopen closed load. Native text-field undo remains available; it does
  not undo a component replacement or a closed tab. These need an explicit bounded history design.
- Browser coverage so far is Chromium on Linux. Native macOS/Windows keyboard behavior and Firefox/
  Safari file downloads remain manual checks; browser-reserved shortcuts cannot be promised across
  platforms.

## Verification and references

Vitest covers creation validation, source independence, clone-source deduplication, rename/save
snapshots, ordered concurrent saves, export errors/cancellation, shortcut modifiers and the opt-in preference. Headless Chromium exercises both funnels,
open/saved clones, missing/invalid inputs, Back, search, rename, dialog focus, guarded close, save
failure, reload recovery, keyboard navigation, focused-name commands, export failure/retry and gun-removal confirmation. Layouts were inspected at desktop and 390 px phone
widths in both themes. All five language catalogs compile and render.

The local tab keys follow the [WAI-ARIA tabs keyboard conventions](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/).
These controls remain ordinary navigation buttons, without claiming tab-panel semantics they do not
implement. Application commands use separate combinations because
[`preventDefault()` only affects cancelable events](https://developer.mozilla.org/en-US/docs/Web/API/Event/preventDefault);
it cannot guarantee interception of browser chrome commands.
