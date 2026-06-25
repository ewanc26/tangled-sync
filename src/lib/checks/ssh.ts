/**
 * SSH connectivity check for Tangled.
 *
 * Runs `ssh -T git@tangled.sh` and inspects the response.
 * Tangled's SSH greeting includes "successfully authenticated"
 * on success or "Hi <user>" — either signals a working key.
 */

import { execSync } from "child_process";

export interface CheckResult {
  status: boolean;
  message: string;
}

export async function checkSshConnection(): Promise<CheckResult> {
  try {
    const sshTest = execSync("ssh -T git@tangled.sh 2>&1", {
      encoding: "utf-8",
      timeout: 5000,
    });

    if (
      sshTest.includes("successfully authenticated") ||
      sshTest.includes("Hi")
    ) {
      return { status: true, message: sshTest.trim().split("\n")[0] };
    }
    return { status: false, message: `Uncertain: ${sshTest.trim()}` };
  } catch (error: any) {
    const output = error.stdout?.toString() || error.message;
    if (
      output.includes("successfully authenticated") ||
      output.includes("Hi")
    ) {
      return { status: true, message: "SSH connection to Tangled works" };
    }
    return {
      status: false,
      message:
        "SSH connection failed. Add your SSH key at https://tangled.org/settings/keys",
    };
  }
}
