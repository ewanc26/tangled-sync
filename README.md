
# Tangled Sync

This bootstrap creates a TypeScript project that syncs GitHub repos to Tangled and
publishes ATProto records for each repository.

See `src/config.env` for configuration. After running this script, run `npm install`
and then `npm run sync` from the project directory.

**Crucially**, before running `npm run sync`, you must **verify your SSH connection** to Tangled:

1.  Run `ssh -T git@tangled.sh` and ensure it succeeds.
2.  If the tangled remote does not exist for a GitHub repo, the script will attempt to create it on first run, but this requires an active, working SSH key.
