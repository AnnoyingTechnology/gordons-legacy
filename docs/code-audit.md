# Code audit (#32)

Started 2026-10-16. R2 and physics/model changes are outside this work. The first pass follows data
boundaries and persistence, where a small failure can lose work or prevent an offline session.

| Area | Finding | Status |
|---|---|---|
| Repository manifest | Only its envelope was checked. Malformed entries could reach cache mutations; duplicate paths could produce competing downloads. | Fixed: shared complete shape checks, path validation and duplicate rejection before sync changes. The CLI validator reports malformed manifests instead of throwing. |
| Component cache | A file with a valid hash but invalid content replaced the last valid cached copy before its fields were checked. | Fixed: content validation precedes cache writes. Regression tests preserve the previous copy. |
| Offline reading | JSON `null` crashed the component reader and interrupted the entire cache read. | Fixed: malformed JSON values are rejected independently; valid entries remain available. |
| IndexedDB writes | The wrapper resolves at request success, before transaction completion. A subsequent abort can be reported as a successful save. | Fixed: resolve on transaction completion, reject an abort even after request success. Failed opens can retry; version changes close and discard the old connection. |
| Backup restore | The envelope is accessed without checking JSON `null`; version is not checked, and null entries interrupt restore. | Fixed: validate supported v1/v2 envelopes before writes; reject malformed records independently, count committed records and failed writes, and report unreadable files in the UI. |
| Saved tabs | One malformed entry stopped the loop before later valid tabs; an inaccessible storage read escaped the handler. Invalid metadata could enter the UI. | Fixed: validate each entry independently, preserve active selection by original position, keep missing save snapshots dirty, and show a recovery warning. |
| Display preferences | Stored values were spread over defaults without checking their shape. Unknown languages or null units/groups could stop rendering. | Fixed: validate settings independently, retain valid custom units and choices, and fall back to browser-language/preset defaults. |
| Reaching the storage at all | `window.localStorage` **throws** a `SecurityError` where a browser blocks site data (Safari in a framed page, Chromium with all cookies blocked), and the shell read it in three field initialisers. A user who blocks site data got an **empty page**: headless Chromium with the property made to throw showed `SecurityError: The operation is insecure.` uncaught and `gl-app` holding 0 bytes. | Fixed: `state/browser-storage.ts` asks the browser once through a `try` and answers nothing when refused; the store, the settings and the welcome flag already take a `Storage \| undefined`, `saveSettings` no longer throws out of the click that changed a unit, and the shell says plainly that this browser remembers nothing (`documents.storageDenied`, five languages, German capitalisation corrected by Codex). Verified in the same browser: the app renders whole (183,724 bytes), the warning is shown, the example load opens, nothing is thrown. |

| Record metadata | `getAll()` was cast to the record type, so a value with no usable `id` reached a library, where reading a field off it threw inside the promise the whole list depends on: one bad record emptied the user's library instead of itself. The entries' own metadata was unchecked too — a dateless gun, a component of an unknown `kind` read as a projectile, a load with no name — and the load library's check lived in its IndexedDB wrapper, where no test ever ran it. | Fixed: `keyedRecords()` drops values with no string `id` as they leave a store; each library's `checked()` now also fills a missing date (the epoch) and a missing name (the load's title, else `Untitled`), and drops an entry whose `kind` is none of the three instead of reading it as a projectile. The load library's check moved from `library-storage.ts` into `Library` itself, beside the other two, so it applies whatever the entries were stored in. |

Validation: 878 tests, typecheck and production build pass. Native Chromium reproduced an IndexedDB
request succeeding and then aborting; the save previously resolved with no stored record and now
rejects with `AbortError`. Browser checks also cover unreadable files and partial backup recovery. The published data
repository's 463 files also validate. This is an ongoing audit, not a claim that every module has been
reviewed. Document workflow findings and remaining history work are in [ui-audit.md](ui-audit.md).

Denied browser storage and record metadata are both done (the last two rows). Of the pass that started
this document, what is left is the parts of the app no storage failure reaches: the editor's own input
handling, and the document workflow findings recorded in [ui-audit.md](ui-audit.md).

The IndexedDB distinction follows the [transaction lifecycle](https://w3c.github.io/IndexedDB/#transaction-lifecycle):
a successful request precedes the transaction commit.
