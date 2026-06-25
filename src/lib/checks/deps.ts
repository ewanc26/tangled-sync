export interface CheckResult {
  status: boolean;
  message: string;
}

export async function checkDependencies(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  try {
    await import("@atproto/api");
    results.push({ status: true, message: "@atproto/api installed" });
  } catch {
    results.push({
      status: false,
      message: "@atproto/api not installed (run: npm install)",
    });
  }

  try {
    await import("dotenv");
    results.push({ status: true, message: "dotenv installed" });
  } catch {
    results.push({
      status: false,
      message: "dotenv not installed (run: npm install)",
    });
  }

  return results;
}
