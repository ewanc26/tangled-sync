import dotenv from "dotenv";
import fs from "fs";
import path from "path";

/** Load .env from src/.env, relative to the project root. */
export function loadConfig(): void {
  dotenv.config({ path: "./src/.env" });
}

/** Required environment variables for Tangled Sync. */
export const REQUIRED_VARS = [
  { name: "BASE_DIR", description: "Base directory for repos" },
  { name: "GITHUB_USER", description: "GitHub username" },
  { name: "ATPROTO_DID", description: "AT Proto DID" },
  { name: "BLUESKY_PDS", description: "Bluesky PDS URL" },
  { name: "BLUESKY_USERNAME", description: "Bluesky username" },
  { name: "BLUESKY_PASSWORD", description: "Bluesky app password" },
] as const;

export interface ConfigCheck {
  name: string;
  status: boolean;
  message: string;
}

/** Validate all required env vars are present. */
export function validateEnvVars(): ConfigCheck[] {
  return REQUIRED_VARS.map(({ name, description }) => {
    const value = process.env[name];
    const exists = !!value && value.trim().length > 0;
    return {
      name,
      status: exists,
      message: exists ? `✓ Set` : `✗ Missing (${description})`,
    };
  });
}

/** Check that the .env file exists on disk. */
export function checkEnvFile(envPath?: string): ConfigCheck {
  const p = envPath ?? path.join(process.cwd(), "src", ".env");
  const exists = fs.existsSync(p);
  return {
    name: ".env file",
    status: exists,
    message: exists
      ? `Found at src/.env`
      : "Missing! Copy src/.env.example to src/.env",
  };
}

/** Check that BASE_DIR exists on disk. */
export function checkBaseDir(): ConfigCheck | null {
  const baseDir = process.env.BASE_DIR;
  if (!baseDir) return null;
  const exists = fs.existsSync(baseDir);
  return {
    name: "BASE_DIR path",
    status: exists,
    message: exists
      ? `Exists: ${baseDir}`
      : `Missing (will be created): ${baseDir}`,
  };
}

/** Validate DID format. */
export function checkDidFormat(): ConfigCheck | null {
  const did = process.env.ATPROTO_DID;
  if (!did) return null;
  const valid = did.startsWith("did:plc:") || did.startsWith("did:web:");
  return {
    name: "DID format",
    status: valid,
    message: valid
      ? "Valid DID format"
      : "Invalid! Should start with 'did:plc:' or 'did:web:'",
  };
}

/** Validate PDS URL format. */
export function checkPdsUrl(): ConfigCheck | null {
  const pds = process.env.BLUESKY_PDS;
  if (!pds) return null;
  const valid = pds.startsWith("http://") || pds.startsWith("https://");
  return {
    name: "PDS URL format",
    status: valid,
    message: valid
      ? `Valid URL: ${pds}`
      : "Invalid! Should start with 'https://'",
  };
}

/** Run all configuration checks. */
export function runConfigChecks(): ConfigCheck[] {
  const results: ConfigCheck[] = [checkEnvFile(), ...validateEnvVars()];

  const baseDirCheck = checkBaseDir();
  if (baseDirCheck) results.push(baseDirCheck);

  const didCheck = checkDidFormat();
  if (didCheck) results.push(didCheck);

  const pdsCheck = checkPdsUrl();
  if (pdsCheck) results.push(pdsCheck);

  return results;
}
