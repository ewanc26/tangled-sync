import { loadConfig, runConfigChecks } from "./lib/config";
import { createAgent } from "./lib/atproto";
import { checkSshConnection } from "./lib/checks/ssh";
import { checkGitHubApi } from "./lib/checks/github";
import { checkDependencies } from "./lib/checks/deps";

async function runHealthCheck() {
  loadConfig();

  console.log("🔍 Running Tangled Sync Health Check...\n");

  let errors = 0;
  let warnings = 0;

  // ── Configuration checks ──────────────────────────────────────
  console.log("📋 Configuration Checks\n");
  const configChecks = runConfigChecks();
  for (const check of configChecks) {
    const icon = check.status ? "✅" : "❌";
    console.log(`${icon} ${check.name}: ${check.message}`);
    if (!check.status) errors++;
  }

  // ── AT Proto connection check ─────────────────────────────────
  console.log("\n🔐 AT Proto Connection Check\n");
  const canConnect =
    process.env.BLUESKY_USERNAME &&
    process.env.BLUESKY_PASSWORD &&
    process.env.BLUESKY_PDS &&
    process.env.ATPROTO_DID;

  if (canConnect) {
    try {
      const agent = await createAgent();
      const did = process.env.ATPROTO_DID!;

      if (agent.session?.did !== did) {
        console.log(
          `⚠️  DID mismatch! Expected: ${did}, Got: ${agent.session?.did}`,
        );
        warnings++;
      }

      const records = await agent.api.com.atproto.repo.listRecords({
        repo: did,
        collection: "sh.tangled.repo",
        limit: 5,
      });
      console.log(
        `✅ Can access AT Proto records (${records.data.records.length} sample records)`,
      );
    } catch (error: any) {
      console.log(`❌ AT Proto connection failed: ${error.message}`);
      errors++;
    }
  } else {
    console.log("⏭️  Skipped (missing credentials)");
  }

  // ── SSH connection check ──────────────────────────────────────
  console.log("\n🔑 SSH Connection Check\n");
  const sshResult = await checkSshConnection();
  const sshIcon = sshResult.status ? "✅" : "❌";
  console.log(`${sshIcon} ${sshResult.message}`);
  if (!sshResult.status) errors++;

  // ── GitHub API check ──────────────────────────────────────────
  console.log("\n🐙 GitHub API Check\n");
  const ghResult = await checkGitHubApi();
  if (ghResult) {
    const ghIcon = ghResult.status ? "✅" : "❌";
    console.log(`${ghIcon} ${ghResult.message}`);
    if (!ghResult.status) errors++;
  } else {
    console.log("⏭️  Skipped (no GITHUB_USER set)");
  }

  // ── Dependencies check ────────────────────────────────────────
  console.log("\n📦 Dependencies Check\n");
  const depResults = await checkDependencies();
  for (const dep of depResults) {
    const depIcon = dep.status ? "✅" : "❌";
    console.log(`${depIcon} ${dep.message}`);
    if (!dep.status) errors++;
  }

  // ── Summary ───────────────────────────────────────────────────
  console.log("\n" + "=".repeat(50));
  if (errors === 0 && warnings === 0) {
    console.log("✅ All checks passed! Ready to sync.");
    console.log("\nNext steps:");
    console.log("  npm run sync       # Sync new repos only");
    console.log("  npm run sync:force # Force sync all repos");
  } else {
    if (errors > 0)
      console.log(`❌ ${errors} error(s) found - please fix before syncing`);
    if (warnings > 0)
      console.log(`⚠️  ${warnings} warning(s) - review before syncing`);
    console.log("\nSee SETUP.md for detailed troubleshooting");
    if (errors > 0) process.exit(1);
  }
  console.log("=".repeat(50));
}

runHealthCheck().catch((error) => {
  console.error("\n❌ Health check failed with error:", error);
  process.exit(1);
});
