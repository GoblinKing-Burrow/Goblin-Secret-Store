# Burrow Settings integration

GSS uses Burrow's shared Settings surfaces and controls. Install a Burrow UI containing imperative `form` and `form-inventory` support (Burrow-UI PR #5 or later). Draft APIs alone do not establish layout support. A host missing `setDraft`, `navigate`, or `confirm` displays an update message and does not enable vault editing.

## Layout and save scopes

- **Credentials:** bounded credential inventory on the left, complete selected credential editor on the right. A new credential uses the same editor. Name, service URL, template, and fields commit together with **Save credential**. Existing ACL and opaque version are retained.
- **Agent sharing:** the same inventory/editor arrangement, with a separate **Save access** or **Regrant access** action. Disabled-agent grants are preserved. Unavailable IDs remain visible and can be removed by explicit Save even when no visible checkbox changed.
- **Backup & restore:** encrypted backup in the main form and an expanded **Restore backup** section in the contextual third column on wide layouts. The host adapts columns on narrower screens; without an overflow surface Restore appears below backup. Passphrase/file requirements and typed `RESTORE` confirmation remain unchanged. Backup and restore remain separate immediate operations; they never save an unrelated credential draft.

The host owns responsive tracks, navigation and Statistics. GSS does not add another column shell or a separate theme. When no overflow surface exists, credential selection remains available in a disclosed fallback above the editor. Long credential names wrap; the chosen item exposes `aria-pressed` and a visible Selected label.

## Draft and lifecycle behavior

Credential and sharing drafts register with Burrow's shared Save/Discard/Stay mechanism. Selecting another credential, creating another credential or logging out uses that guard. Failed writes retain entered values, selection and dirty state. Busy writes disable controls, block navigation and prevent duplicate requests. Successful writes establish a clean scope, including when the subsequent reload fails; reload failure remains visible rather than being reported as an unqualified success.

Deletion uses the host's destructive confirmation. Cancellation preserves the draft. Disposal or authentication invalidation prevents an old confirmation from issuing a delete. Requests are aborted on disposal, and stale authentication-generation results cannot repopulate a later session.

Protected values remain write-only. An unchanged existing protected field with a blank input omits its value, while explicit clear submits an empty string. Private keys remain textareas in both masked and visible modes to preserve line breaks. Drafts and session tokens stay in memory only. Restore never reactivates agent access implicitly.

## Validation

`npm run build` checks JavaScript syntax. `npm test` also includes actual Core/PostgreSQL integration and requires the sibling Burrow Backend (or `BURROW_CORE_ROOT`) plus PostgreSQL 17 and pgvector.

Standalone checks without that integration environment:

    node --test ui/*.test.mjs server/backup-boundary.test.mjs server/store.test.mjs server/storage-path.test.mjs server/development-release-workflow.test.mjs

The Settings lifecycle tests cover unsupported hosts, layout metadata, fallback inventory, dirty/reverted drafts, failure retention, stale ACL cleanup, destructive confirmation, authentication invalidation, request deduplication and disposal. Actual ModSettingsHost integration and browser acceptance should also be run against the target host before release; standalone DOM tests do not prove pixel geometry.

The module-owned primary and overflow wrappers explicitly opt into the shared normalized section/action rules. They do not acquire the workspace class or mutate host targets, and their overflow remains visible so the host keeps scroll ownership. This prevents legacy nested cards and grid-stretched actions in the extension shell. The portable actual-host computed-style regression is in `scripts/settings-host/`; its README explains how to run it in a Burrow-UI checkout.

