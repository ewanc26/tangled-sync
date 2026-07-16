# AGENTS.md

Guidance for agents working on tangled-sync. This repository is tombstoned; the canonical package is `pkgs/packages/tangled-sync`. Do not resume feature development here unless explicitly requested.

## Historical behavior

- `src/check.ts` audits state, `validate-config.ts` validates setup, `test-atproto.ts` probes AT Protocol access, and `index.ts` performs synchronization.
- Sync changes Git/hosting state and may write AT Protocol records; dry-run/check paths must remain non-mutating.

## Rules

- Implement maintained fixes in `pkgs` first. Only backport here when the requested outcome includes the archive.
- Preserve repository ownership, visibility, default branches, and remote identity. Never force-push or delete remote content.
- Validate config before any write; redact tokens, SSH material, app passwords, and authorization headers.
- Make retries bounded and operations idempotent so reruns do not duplicate repositories or records.

## Validation

For an archival fix run `npm install`, `npm run validate`, `npm run check`, and TypeScript type checking. Exercise sync with mocked APIs or disposable repositories before any live run. `sync:force` is destructive/expansive and is never routine validation. Do not commit configuration secrets or generated state.
