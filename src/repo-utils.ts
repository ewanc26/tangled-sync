
import { BskyAgent } from "@atproto/api";
import * as child_process from "child_process";
import * as fs from "fs";
import * as path from "path";

const BASE32_SORTABLE = '234567abcdefghijklmnopqrstuvwxyz';

export function run(cmd: string, cwd?: string): string {
  // Use shell: true for commands that contain pipes or shell built-ins
  return child_process.execSync(cmd, { cwd, stdio: "pipe", shell: true }).toString().trim();
}

export function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function generateClockId(): number { return Math.floor(Math.random() * 1024); }

function toBase32Sortable(num: bigint): string {
  if (num === 0n) return '2222222222222';
  let result = '';
  while (num > 0n) {
    result = BASE32_SORTABLE[Number(num % 32n)] + result;
    num = num / 32n;
  }
  return result.padStart(13, '2');
}

export function generateTid(): string {
  const nowMicroseconds = BigInt(Date.now()) * 1000n;
  const clockId = generateClockId();
  const tidBigInt = (nowMicroseconds << 10n) | BigInt(clockId);
  return toBase32Sortable(tidBigInt);
}

export async function ensureTangledRecord(agent: BskyAgent, atprotoDid: string, githubUser: string, repoName: string, description?: string) {
  let tid: string;
  let exists = true;
  while (exists) {
    tid = generateTid();
    try {
      await agent.api.com.atproto.repo.getRecord({ repo: atprotoDid, collection: "sh.tangled.repo", rkey: tid });
      exists = true;
    } catch {
      exists = false;
    }
  }

  const record = {
    $type: "sh.tangled.repo",
    knot: "knot1.tangled.sh",
    name: repoName,
    createdAt: new Date().toISOString(),
    description: description || repoName,
    labels: [],
    source: `https://github.com/${github_user}/${repoName}`,
    spindle: "",
  };

  await agent.api.com.atproto.repo.putRecord({ repo: atprotoDid, collection: "sh.tangled.repo", rkey: tid, record });
  console.log(`[CREATED] Tangled record for ${repoName} (TID: ${tid})`);
}

export function updateReadme(baseDir: string, repoName: string, atprotoDid: string) {
  const repoDir = path.join(baseDir, repoName);
  const readmeFiles = ["README.md", "README.MD", "README.txt", "README"];
  const readmeFile = readmeFiles.find(f => fs.existsSync(path.join(repoDir, f)));
  if (!readmeFile) return;
  const readmePath = path.join(repoDir, readmeFile);
  const content = fs.readFileSync(readmePath, "utf-8");
  if (!/tangled\.org/i.test(content)) {
    fs.appendFileSync(readmePath, `
Mirrored on Tangled: https://tangled.org/${atprotoDid}/${repoName}
`);
    run(`git add ${readmeFile}`, repoDir);
    run(`git commit -m "Add Tangled mirror reference to README"`, repoDir);
    run(`git push origin main`, repoDir);
    console.log(`[README] Updated for ${repoName}`);
  }
}
