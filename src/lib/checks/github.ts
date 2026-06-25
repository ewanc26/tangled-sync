import { execSync } from "child_process";

export interface CheckResult {
  status: boolean;
  message: string;
}

export async function checkGitHubApi(): Promise<CheckResult | null> {
  const githubUser = process.env.GITHUB_USER;
  if (!githubUser) return null;

  try {
    const response = execSync(
      `curl -s "https://api.github.com/users/${githubUser}"`,
      { encoding: "utf-8", timeout: 5000 },
    );
    const data = JSON.parse(response);

    if (data.login) {
      return {
        status: true,
        message: `GitHub user found: ${data.login} (${data.public_repos || 0} public repos)`,
      };
    }
    return { status: false, message: `GitHub user not found: ${githubUser}` };
  } catch (error: any) {
    return {
      status: false,
      message: `Could not check GitHub API: ${error.message}`,
    };
  }
}
