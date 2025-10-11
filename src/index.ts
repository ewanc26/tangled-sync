
import { BskyAgent } from "@atproto/api";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { run, ensureDir, ensureTangledRecord, updateReadme } from "./repo-utils";

dotenv.config({ path: "./src/config.env" });

const BASE_DIR = process.env.BASE_DIR!;
const GITHUB_USER = process.env.GITHUB_USER!;
const ATPROTO_DID = process.env.ATPROTO_DID!;
const BLUESKY_PDS = process.env.BLUESKY_PDS!; // <-- GET PDS URL
const TANGLED_BASE_URL = `git@tangled.sh:${ATPROTO_DID}`;

// Initialize BskyAgent with the specified PDS URL
const agent = new BskyAgent({ service: BLUESKY_PDS }); // <-- USE PDS URL

async function login() {
  if (!process.env.BLUESKY_USERNAME || !process.env.BLUESKY_PASSWORD) {
    throw new Error("Missing Bluesky credentials");
  }
  await agent.login({ identifier: process.env.BLUESKY_USERNAME, password: process.env.BLUESKY_PASSWORD });
  console.log("[LOGIN] Logged in to Bluesky");
}

async function getGitHubRepos(): Promise<{ clone_url: string, name: string, description?: string }[]> {
  // We use `shell: true` in repo-utils for this command as it contains quotes and a pipe is complex to pass as an array.
  const curl = `curl -s "https://api.github.com/users/${GITHUB_USER}/repos?per_page=200"`;
  const output = run(curl);
  const json = JSON.parse(output);
  return json.filter((r: any) => r.name !== GITHUB_USER).map((r: any) => ({ clone_url: r.clone_url, name: r.name, description: r.description })) as any[];
}

// -----------------------------------------------------
// NEW/MODIFIED LOGIC HERE: ENSURE REMOTE AND PUSH SAFELY
// -----------------------------------------------------
async function ensureTangledRemoteAndPush(repoDir: string, repoName: string, cloneUrl: string) {
  const tangledUrl = `${TANGLED_BASE_URL}/${repoName}`;

  try {
    const remotes = run("git remote", repoDir).split("\n");

    if (!remotes.includes("tangled")) {
      console.log(`[REMOTE] 'tangled' remote not found for ${repoName}. Attempting to add it...`);
      run(`git remote add tangled ${tangledUrl}`, repoDir);
      console.log(`[REMOTE] Added Tangled remote: ${tangledUrl}`);
    }

    // Safety check: ensure 'origin' push URL is not pointing to tangled.sh
    const originPushUrl = run("git remote get-url --push origin", repoDir);
    if (originPushUrl.includes("tangled.sh")) {
      run(`git remote set-url --push origin ${cloneUrl}`, repoDir);
      console.log(`[REMOTE] Removed Tangled from origin push URL and set to: ${cloneUrl}`);
    }

    // Attempt to push. This is the point where the SSH connection is tested for this repo.
    run(`git push tangled main`, repoDir);
    console.log(`[PUSH] Pushed main branch to Tangled successfully.`);

  } catch (error) {
    console.log(`[FAIL] Push to Tangled failed for ${repoName}. This is expected if the remote repository does not exist on tangled.sh or SSH is not configured.`);
    console.log(`[HINT] You must ensure 'ssh -T git@tangled.sh' works before running the sync.`);
    // The script continues to the next repo/record creation even if the push fails.
  }
}

async function main() {
  await login();
  ensureDir(BASE_DIR);
  const repos = await getGitHubRepos();

  for (const { clone_url, name: repoName, description } of repos) {
    console.log(`
[PROGRESS] Processing ${repoName}`);
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
