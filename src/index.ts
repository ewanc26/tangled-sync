/**
 * tangled-sync: synchronise GitHub repositories to Tangled knotwork.
 *
 * Discovers repos for a GitHub user, clones any not yet on disk,
 * adds a Tangled git remote, pushes main, and creates an ATProto
 * record (sh.tangled.repo) so the Tangled network knows about it.
 */

import { loadConfig } from "./lib/config";
import { createAgent } from "./lib/atproto";
import { ensureDir, run, generateTid, TangledRepoRecord } from "./lib/utils";
import fs from "fs";
import path from "path";

loadConfig();

// Re-process all repos regardless of existing ATProto records
const FORCE_SYNC = process.argv.includes("--force");
const BASE_DIR = process.env.BASE_DIR!;
const GITHUB_USER = process.env.GITHUB_USER!;
const ATPROTO_DID = process.env.ATPROTO_DID!;
// Tangled uses the ATProto DID as a namespace for git remotes
const TANGLED_BASE_URL = `git@tangled.sh:${ATPROTO_DID}`;

// ── GitHub repo fetching ───────────────────────────────────────

async function getGitHubRepos(): Promise<
  { clone_url: string; name: string; description?: string }[]
> {
  const output = run(
    `curl -s "https://api.github.com/users/${GITHUB_USER}/repos?per_page=200"`,
  );
  const json = JSON.parse(output);
  return json
    .filter((r: any) => r.name !== GITHUB_USER)
    .map((r: any) => ({
      clone_url: r.clone_url,
      name: r.name,
      description: r.description,
    }));
}

// ── Tangled remote & push ──────────────────────────────────────

async function ensureTangledRemoteAndPush(
  repoDir: string,
  repoName: string,
  cloneUrl: string,
) {
  const tangledUrl = `${TANGLED_BASE_URL}/${repoName}`;
  try {
    const remotes = run("git remote", repoDir).split("\n");
    if (!remotes.includes("tangled")) {
      console.log(`[REMOTE] Adding Tangled remote for ${repoName}`);
      run(`git remote add tangled ${tangledUrl}`, repoDir);
    }

    const originPushUrl = run("git remote get-url --push origin", repoDir);
    if (originPushUrl.includes("tangled.sh")) {
      run(`git remote set-url --push origin ${cloneUrl}`, repoDir);
      console.log(`[REMOTE] Reset origin push URL to GitHub`);
    }

    run(`git push tangled main`, repoDir);
    console.log(`[PUSH] Pushed main to Tangled`);
  } catch (error) {
    console.warn(
      `[WARN] Could not push ${repoName} to Tangled. Check SSH or repo existence.`,
    );
  }
}

// ── Tangled record management ──────────────────────────────────

const recordCache: Record<string, string> = {};

async function ensureTangledRecord(
  agent: Awaited<ReturnType<typeof createAgent>>,
  repoName: string,
  description?: string,
): Promise<{ tid: string; existed: boolean }> {
  if (recordCache[repoName]) {
    return { tid: recordCache[repoName], existed: true };
  }

  let cursor: string | undefined;
  let tid: string | null = null;

  do {
    const res: any = await agent.api.com.atproto.repo.listRecords({
      repo: ATPROTO_DID,
      collection: "sh.tangled.repo",
      limit: 50,
      cursor,
    });

    for (const record of res.data.records) {
      const value = record.value as TangledRepoRecord;
      if (value.name === repoName && record.rkey) {
        tid = record.rkey;
        recordCache[repoName] = tid;
        console.log(`[FOUND] Existing record for ${repoName} (TID: ${tid})`);
        return { tid, existed: true };
      }
    }
    cursor = res.data.cursor;
  } while (!tid && cursor);

  tid = generateTid();
  const record: TangledRepoRecord = {
    $type: "sh.tangled.repo",
    name: repoName,
    knot: "knot1.tangled.sh",
    createdAt: new Date().toISOString(),
    description: description ?? repoName,
    source: `https://github.com/${GITHUB_USER}/${repoName}`,
    labels: [],
  };

  try {
    const result = await agent.api.com.atproto.repo.putRecord({
      repo: ATPROTO_DID,
      collection: "sh.tangled.repo",
      rkey: tid,
      record,
    });
    console.log(`[CREATED] ATProto record URI: ${result.data.uri}`);
  } catch (error: any) {
    console.error(
      `[ERROR] Failed to create ATProto record for ${repoName}:`,
      error.message,
    );
    throw error;
  }

  recordCache[repoName] = tid;
  console.log(`[CREATED] Tangled record for ${repoName} (TID: ${tid})`);
  return { tid, existed: false };
}

// ── README update ──────────────────────────────────────────────

function updateReadme(baseDir: string, repoName: string) {
  const repoDir = path.join(baseDir, repoName);
  const readmeFiles = ["README.md", "README.MD", "README.txt", "README"];
  const readmeFile = readmeFiles.find((f) =>
    fs.existsSync(path.join(repoDir, f)),
  );
  if (!readmeFile) return;

  const readmePath = path.join(repoDir, readmeFile);
  const content = fs.readFileSync(readmePath, "utf-8");
  if (!/tangled\.org/i.test(content)) {
    fs.appendFileSync(
      readmePath,
      `\nMirrored on Tangled: https://tangled.org/${ATPROTO_DID}/${repoName}\n`,
    );
    run(`git add ${readmeFile}`, repoDir);
    run(`git commit -m "Add Tangled mirror reference to README"`, repoDir);
    run(`git push origin main`, repoDir);
    console.log(`[README] Updated for ${repoName}`);
  }
}

// ── Main orchestrator ──────────────────────────────────────────

async function main() {
  console.log("[STARTUP] Starting Tangled Sync...");
  if (FORCE_SYNC)
    console.log("[MODE] Force sync enabled - will process all repos");
  console.log(`[CONFIG] Base directory: ${BASE_DIR}`);
  console.log(`[CONFIG] GitHub user: ${GITHUB_USER}`);
  console.log(`[CONFIG] ATProto DID: ${ATPROTO_DID}`);

  const agent = await createAgent();
  ensureDir(BASE_DIR);

  console.log(`[GITHUB] Fetching repositories for ${GITHUB_USER}...`);
  const repos = await getGitHubRepos();
  console.log(`[GITHUB] Found ${repos.length} repositories`);

  let reposToProcess = repos;
  let skippedRepos: typeof repos = [];

  if (!FORCE_SYNC) {
    console.log(`[ATPROTO] Fetching existing Tangled records...`);
    let cursor: string | undefined;
    const existingRepos = new Set<string>();

    do {
      const res: any = await agent.api.com.atproto.repo.listRecords({
        repo: ATPROTO_DID,
        collection: "sh.tangled.repo",
        limit: 100,
        cursor,
      });

      for (const record of res.data.records) {
        const value = record.value as TangledRepoRecord;
        if (value.name) {
          existingRepos.add(value.name);
          recordCache[value.name] = record.rkey;
        }
      }
      cursor = res.data.cursor;
    } while (cursor);

    console.log(
      `[ATPROTO] Found ${existingRepos.size} existing Tangled records`,
    );

    reposToProcess = repos.filter((r) => !existingRepos.has(r.name));
    skippedRepos = repos.filter((r) => existingRepos.has(r.name));

    console.log(`[INFO] ${reposToProcess.length} new repos to sync`);
    console.log(
      `[INFO] ${skippedRepos.length} repos already synced (skipping)\n`,
    );

    if (skippedRepos.length > 0) {
      console.log(
        "[SKIPPED] The following repos already have AT Proto records:",
      );
      skippedRepos.forEach((r) => console.log(`  - ${r.name}`));
      console.log("");
    }
  } else {
    console.log(
      `[INFO] Processing all ${repos.length} repos (force sync mode)\n`,
    );
  }

  let syncedCount = 0;
  let errorCount = 0;

  for (const { clone_url, name: repoName, description } of reposToProcess) {
    console.log(
      `\n[PROGRESS] Processing ${repoName} (${syncedCount + 1}/${reposToProcess.length})`,
    );
    const repoDir = path.join(BASE_DIR, repoName);

    try {
      if (!fs.existsSync(repoDir)) {
        run(`git clone ${clone_url} ${repoDir}`);
        console.log(`[CLONE] ${repoName}`);
      } else {
        console.log(`[EXISTS] ${repoName} already cloned`);
      }

      await ensureTangledRemoteAndPush(repoDir, repoName, clone_url);
      updateReadme(BASE_DIR, repoName);
      const result = await ensureTangledRecord(agent, repoName, description);

      if (!result.existed) syncedCount++;
    } catch (error: any) {
      console.error(`[ERROR] Failed to sync ${repoName}: ${error.message}`);
      errorCount++;
    }
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log(`[COMPLETE] Sync finished!`);
  console.log(`  ✅ New repos synced: ${syncedCount}`);
  if (!FORCE_SYNC) console.log(`  ⏭️  Repos skipped: ${skippedRepos.length}`);
  if (errorCount > 0) console.log(`  ❌ Errors: ${errorCount}`);
  console.log(`${"=".repeat(50)}`);
}

main().catch(console.error);
