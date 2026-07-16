# AGENTS.md

Guidance for agents working on the archived `tangled-sync` repository. The maintained implementation is `pkgs/packages/tangled-sync`; do not resume feature development here unless the requested scope explicitly includes the tombstone.

## Historical implementation

- `src/index.ts` loads `src/.env`, fetches one public GitHub user-repository page, clones missing directories, adds/pushes a `tangled` remote, may edit/commit/push README files to GitHub, and writes `sh.tangled.repo` records.
- `src/check.ts` performs live configuration, AT Protocol login/read, Tangled SSH, GitHub API, and dependency checks. `src/test-atproto.ts` also logs in and reads records; neither is an isolated unit test.
- `src/lib/` holds configuration checks, shell execution, AT Protocol login, TID generation, and health probes.
- `README.md` correctly marks the repository archived. `SETUP.md` and `USAGE.md` are historical and include stale descriptions: `USAGE.md` names missing `src/validate-config.ts`, which `package.json` still exposes as `npm run validate`.

## Mutation hazards and current limitations

- Normal sync skips repositories whose AT Protocol record already exists; force mode processes all, but record creation still checks for an existing record. Neither mode is a dry run.
- GitHub discovery uses `/users/<name>/repos`, does not paginate beyond its single request, and does not filter forks or archived repositories. It excludes only a repository whose name equals the username. Do not use this code for an owned/non-fork-only migration without fixing and testing selection.
- Failure to push to Tangled is swallowed as a warning; the code then continues to mutate the README and create an AT Protocol record, so a record is not proof that the mirror push succeeded.
- `updateReadme` runs `git add <README>`, `git commit`, and `git push origin main`. A commit includes any changes already staged in that worktree, and branch/remote assumptions are hard-coded. Never run it against valuable dirty repositories.
- Repository names, usernames, paths, and URLs are interpolated into shell command strings through `execSync`. Validate or replace these calls with argument arrays before accepting untrusted values.
- The custom TID uses millisecond time shifted to simulated microseconds plus a random clock ID; it is not the reference monotonic TID implementation. Remote URLs, the knot hostname, collection name, `main` branch, and GitHub source URLs are hard-coded.
- Keep app passwords, tokens, SSH keys, `.env`, and session output out of Git and logs. Never force-push or delete remote records/content from this tombstone.

## Validation

For an explicitly requested archival fix, use `npm install` and `npx tsc --noEmit`; repair the missing validation entry point or script before claiming `npm run validate` works. Treat `npm run check` and `npm run test-atproto` as live network/auth probes, not tests, and do not run `npm run sync` or `sync:force` for routine validation. Exercise selection, shell argument handling, dirty-worktree refusal, push failure, README commits, pagination, and AT Protocol writes with mocked clients and disposable repositories. Implement the maintained correction in `pkgs` first when applicable.
