import { AtpAgent } from "@atproto/api";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { run, ensureDir, ensureTangledRecord, updateReadme } from "./repo-utils";

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

async function getGitHubRepos(): Promise<{ clone_url: string, name: string, description?: string }[]> {
  const curl = `curl -s "https://api.github.com/users/${GITHUB_USER}/repos?per_page=200"`;
  const output = run(curl);
  const json = JSON.parse(output);
  return json.filter((r: any) => r.name !== GITHUB_USER)
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
