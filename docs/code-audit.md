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

Validation: 727 tests, typecheck and production build pass. Native Chromium reproduced an IndexedDB
request succeeding and then aborting; the save previously resolved with no stored record and now
rejects with `AbortError`. Browser checks also cover unreadable files and partial backup recovery. The published data
repository's 463 files also validate. This is an ongoing audit, not a claim that every module has been
reviewed. Document workflow findings and remaining history work are in [ui-audit.md](ui-audit.md).

Next pass: IndexedDB record metadata validation and whole-app handling of denied browser storage.
Document recovery and settings reads now tolerate denied access, but acquiring `window.localStorage`
and persisting preferences/welcome state still need their own checks.

The IndexedDB distinction follows the [transaction lifecycle](https://w3c.github.io/IndexedDB/#transaction-lifecycle):
a successful request precedes the transaction commit.
