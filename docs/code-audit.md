# Code audit (#32)

Started 2026-10-16. R2 and physics/model changes are outside this work. The first pass follows data
boundaries and persistence, where a small failure can lose work or prevent an offline session.

| Area | Finding | Status |
|---|---|---|
| Repository manifest | Only its envelope was checked. Malformed entries could reach cache mutations; duplicate paths could produce competing downloads. | Fixed: shared complete shape checks, path validation and duplicate rejection before sync changes. The CLI validator reports malformed manifests instead of throwing. |
| Component cache | A file with a valid hash but invalid content replaced the last valid cached copy before its fields were checked. | Fixed: content validation precedes cache writes. Regression tests preserve the previous copy. |
| Offline reading | JSON `null` crashed the component reader and interrupted the entire cache read. | Fixed: malformed JSON values are rejected independently; valid entries remain available. |
| IndexedDB writes | The wrapper resolves at request success, before transaction completion. A subsequent abort can be reported as a successful save. | Next: reproduce and wait for commit. |
| Backup restore | The envelope is accessed without checking JSON `null`; version is not checked, and null entries interrupt restore. | Next: reject unsupported envelopes and count invalid entries independently. |

Validation for the first fixes: 712 tests, typecheck and production build pass. The published data
repository's 463 files also validate. This is an ongoing audit, not a claim that every module has been
reviewed. Document workflow findings and remaining history work are in [ui-audit.md](ui-audit.md).
