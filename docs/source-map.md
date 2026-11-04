# Source and coverage

## Ordinary maintenance — 4 November 2026

Compared source `59177c2d881a51bc9c6b08ea913e400875cef7b3` with the previous ordinary baseline. Existing guides now cover the shared Settings inventory/form layouts, host compatibility, separate save scopes, draft guards, failure retention, stale ACL cleanup and destructive-confirmation labels. Evidence is `ui/settings.js`, `ui/management.js` and the Settings lifecycle test declarations; no application tests or live vault operations were run. Agent tool/server contracts and the GSS skill are unchanged. The standalone documentation workflow now supplies the required `/goblin-secret-store/` link-check base path. Unchanged pages retain their dated full-review evidence.

## Full reconciliation checkpoint — 1 November 2026

All 13 guides in this section were reviewed against implementation **2026.10.28**, source commit `a80eef571c775a8b98891684811c669f34881d95`. Setup, configuration, authentication, credential editing, record ACLs, agent handles versus operator references, encryption/storage, backup and restore, audit paging, APIs, and troubleshooting were compared with the current implementation. Access-selector labels, API error statuses and the standalone documentation check command were corrected. This was a static documentation reconciliation, not application-test execution, a security audit, or verification of an installed runtime. Public package availability and installed Core/mod capabilities must still be checked separately.

## Previous implementation checkpoint — 29 October 2026

This ordinary delta pass uses implementation **2026.10.28**, commit `1292e41e4162f9f6522c416b28ce6df4e4ee9adf`, and reconciles the enabled-agent sharing picker and preservation of existing selected grants to disabled agents. Unchanged pages retain the prior dated review below. No application tests or provider calls were run. Source review is not runtime certification or a security audit; public package synchronization and installed capabilities remain separate checks.

## Previous implementation checkpoint — 26 October 2026

This ordinary delta pass uses implementation **2026.10.25.1**, commit `eb13366fbf3466f43fd5be1766a07aa52da8ef17`, and reconciles optional public Service URL metadata in the credential editor, record reads and backup/restore since the full review below. Unchanged pages retain that full-review coverage. No application tests or provider calls were run; this is documentation maintenance, not a security audit or runtime certification. Public package synchronization and installed capabilities remain separate checks.

## Full reconciliation checkpoint — 25 October 2026

This full documentation reconciliation uses implementation **2026.10.25**, commit `d05ff437bdb1fa72880b922b141856f27629e5e9`, as the current baseline. All pages in this section were checked against current source contracts, including unchanged setup, reference, operations, and troubleshooting guidance. Historical release notes below remain historical. Public package synchronization may carry a different calendar version; verify the installed package and required Core capabilities. This was documentation review, not a security audit or runtime certification; no application tests or provider calls were run.


The original public guide described Goblin Secret Store release line **2026.10.19**. Check the installed mod version when comparing behavior.

| Area | Public source |
| --- | --- |
| Routes, limits, tool registration | [server/index.mjs](https://github.com/GoblinKing-Burrow/Goblin-Secret-Store/blob/main/server/index.mjs) |
| Encryption, storage, access, restore | [server/store.mjs](https://github.com/GoblinKing-Burrow/Goblin-Secret-Store/blob/main/server/store.mjs) |
| Credential, sharing, backup UI | [ui/management.js](https://github.com/GoblinKing-Burrow/Goblin-Secret-Store/blob/main/ui/management.js) |
| Browser sessions | [ui/session.js](https://github.com/GoblinKing-Burrow/Goblin-Secret-Store/blob/main/ui/session.js) |
| API contract | [API-CONTRACT.md](https://github.com/GoblinKing-Burrow/Goblin-Secret-Store/blob/main/API-CONTRACT.md) |

The guide is checked against these sources. A successful documentation build is not a security certification or proof that your deployment and backups are safe. Verify your own network boundary, consumer behavior, and recovery procedure.

## Build the documentation

The shared Docusaurus site is built from Docs-Website. Follow [Build this documentation](https://docs.goblin-kingdom.com/burrow/development/documentation/) for its Node.js setup and deployment.

### Original standalone site

For the original Goblin-Secret-Store repository’s separate MkDocs site, use Python 3.12 and install `requirements-docs.txt`, then run:

```sh
python -m mkdocs build --strict
python scripts/docs/check_site.py site --base-path /goblin-secret-store/
```

The standalone site is published from the original public repository. See [releases](https://github.com/GoblinKing-Burrow/Goblin-Secret-Store/releases) and the [license](https://github.com/GoblinKing-Burrow/Goblin-Secret-Store/blob/main/LICENSE).

## Review checkpoint: 21 October 2026

All pages in this section were reconciled from the [2026.10.19 runtime baseline](https://github.com/GoblinKing-Burrow/Goblin-Secret-Store/tree/9641ab88741716e1aff6ad2601dc50f992411aa9) through [public source `80b264f`](https://github.com/GoblinKing-Burrow/Goblin-Secret-Store/tree/80b264fd14e4eb1d503a57772b214099991b50a1). The public runtime implementation is unchanged across that interval; documentation changes do not imply a new runtime release. Core-dependent and forthcoming managed-skill behavior is identified separately in the relevant guides.

The original guides named the release line but did not pin every page to a commit. This review uses the published release snapshot and repository history as the baseline, rather than assuming an undocumented per-page source revision.

## Test prerequisites and public-snapshot limitation

`npm run build` performs JavaScript syntax checks. Full `npm test` also imports a compatible Core checkout (`BURROW_CORE_ROOT`), its installed dependencies, and PostgreSQL 17 with pgvector; the fixture owns a disposable cluster and must run as a non-root user.

The 2026.10.19 public snapshot retains `server/development-release-workflow.test.mjs` but excludes the development release workflow it reads. The aggregate suite fails on that missing file. A focused unit-test pass or a documentation build must not be reported as a passing full integration suite.
