import { AtpAgent } from "@atproto/api";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

dotenv.config({ path: "./src/.env" });

const BASE_DIR = process.env.BASE_DIR!;
const GITHUB_USER = process.env.GITHUB_USER!;
const ATPROTO_DID = process.env.ATPROTO_DID!;
const BLUESKY_PDS = process.env.BLUESKY_PDS!;
const TANGLED_BASE_URL = `git@tangled.sh:${ATPROTO_DID}`;

const agent = new AtpAgent({ service: BLUESKY_PDS });

async function login() {
  const username = process.env.BLUESKY_USERNAME;
  const password = process.env.BLUESKY_PASSWORD;
  if (!username || !password) throw new Error("Missing Bluesky credentials");
  await agent.login({ identifier: username, password });
  console.log("[LOGIN] Logged in to Bluesky");
}

async function getGitHubRepos(): Promise<{ clone_url: string; name: string; description?: string }[]> {
  const curl = `curl -s "https://api.github.com/users/${GITHUB_USER}/repos?per_page=200"`;
  const output = run(curl);
  const json = JSON.parse(output);
  return json
    .filter((r: any) => r.name !== GITHUB_USER)
    .map((r: any) => ({ clone_url: r.clone_url, name: r.name, description: r.description }));
}

async function ensureTangledRemoteAndPush(repoDir: string, repoName: string, cloneUrl: string) {
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
    console.warn(`[WARN] Could not push ${repoName} to Tangled. Check SSH or repo existence.`);
  }
}

const BASE32_SORTABLE = "234567abcdefghijklmnopqrstuvwxyz";

function run(cmd: string, cwd?: string): string {
  const options: import("child_process").ExecSyncOptions = {
    cwd,
    stdio: "pipe",
    shell: process.env.SHELL || "/bin/bash",
    encoding: "utf-8",
  };
  return execSync(cmd, options).toString().trim();
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function generateClockId(): number {
  return Math.floor(Math.random() * 1024);
}

function toBase32Sortable(num: bigint): string {
  if (num === 0n) return "2222222222222";
  let result = "";
  while (num > 0n) {
    result = BASE32_SORTABLE[Number(num % 32n)] + result;
    num = num / 32n;
  }
  return result.padStart(13, "2");
}

function generateTid(): string {
  const nowMicroseconds = BigInt(Date.now()) * 1000n;
  const clockId = generateClockId();
  const tidBigInt = (nowMicroseconds << 10n) | BigInt(clockId);
  return toBase32Sortable(tidBigInt);
}

// Tangled repo schema typing
interface TangledRepoRecord {
  $type: "sh.tangled.repo";
  knot: string;
  name: string;
  spindle: string;
  description: string;
  source: string;
  labels: string[];
  createdAt: string;
}

// Cache for existing repo records
const recordCache: Record<string, string> = {};

async function ensureTangledRecord(
  agent: AtpAgent,
  atprotoDid: string,
  githubUser: string,
  repoName: string,
  description?: string
): Promise<string> {
  if (recordCache[repoName]) return recordCache[repoName];

  let cursor: string | undefined = undefined;
  let tid: string | null = null;

  do {
    const res: any = await agent.api.com.atproto.repo.listRecords({
      repo: atprotoDid,
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
        break;
      }
    }

    cursor = res.data.cursor;
  } while (!tid && cursor);

  if (!tid) {
    tid = generateTid();
    const record: TangledRepoRecord = {
      $type: "sh.tangled.repo",
      knot: "knot1.tangled.sh",
      name: repoName,
      spindle: "",
      description: description ?? repoName,
      source: `https://github.com/${githubUser}/${repoName}`,
      labels: [],
      createdAt: new Date().toISOString(),
    };

    await agent.api.com.atproto.repo.putRecord({
      repo: atprotoDid,
      collection: "sh.tangled.repo",
      rkey: tid,
      record,
    });

    recordCache[repoName] = tid;
    console.log(`[CREATED] Tangled record for ${repoName} (TID: ${tid})`);
  }

  return tid;
}

function updateReadme(baseDir: string, repoName: string, atprotoDid: string) {
  const repoDir = path.join(baseDir, repoName);
  const readmeFiles = ["README.md", "README.MD", "README.txt", "README"];
  const readmeFile = readmeFiles.find((f) => fs.existsSync(path.join(repoDir, f)));
  if (!readmeFile) return;
  const readmePath = path.join(repoDir, readmeFile);
  const content = fs.readFileSync(readmePath, "utf-8");
  if (!/tangled\.org/i.test(content)) {
    fs.appendFileSync(
      readmePath,
      `
Mirrored on Tangled: https://tangled.org/${atprotoDid}/${repoName}
`
    );
    run(`git add ${readmeFile}`, repoDir);
    run(`git commit -m "Add Tangled mirror reference to README"`, repoDir);
    run(`git push origin main`, repoDir);
    console.log(`[README] Updated for ${repoName}`);
  }
}

async function main() {
  await login();
  ensureDir(BASE_DIR);
  const repos = await getGitHubRepos();

  for (const { clone_url, name: repoName, description } of repos) {
    console.log(`[PROGRESS] Processing ${repoName}`);
    const repoDir = path.join(BASE_DIR, repoName);

    if (!fs.existsSync(repoDir)) {
      run(`git clone ${clone_url} ${repoDir}`);
      console.log(`[CLONE] ${repoName}`);
    }

    await ensureTangledRemoteAndPush(repoDir, repoName, clone_url);
    updateReadme(BASE_DIR, repoName, ATPROTO_DID);
    await ensureTangledRecord(agent, ATPROTO_DID, GITHUB_USER, repoName, description);
  }
}

main().catch(console.error);
