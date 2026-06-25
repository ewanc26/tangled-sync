import fs from "fs";
import { execSync } from "child_process";

// ── Filesystem ─────────────────────────────────────────────────

export function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ── Shell ──────────────────────────────────────────────────────

export function run(cmd: string, cwd?: string): string {
  const options: import("child_process").ExecSyncOptions = {
    cwd,
    stdio: "pipe",
    shell: process.env.SHELL || "/bin/bash",
    encoding: "utf-8",
  };
  return execSync(cmd, options).toString().trim();
}

// ── TID generation ─────────────────────────────────────────────

const BASE32_SORTABLE = "234567abcdefghijklmnopqrstuvwxyz";

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

export function generateTid(): string {
  const nowMicroseconds = BigInt(Date.now()) * 1000n;
  const clockId = generateClockId();
  const tidBigInt = (nowMicroseconds << 10n) | BigInt(clockId);
  return toBase32Sortable(tidBigInt);
}

// ── Tangled repo types ─────────────────────────────────────────

export interface TangledRepoRecord {
  $type: "sh.tangled.repo";
  name: string;
  knot: string;
  createdAt: string;
  spindle?: string;
  description?: string;
  website?: string;
  topics?: string[];
  source?: string;
  labels?: string[];
}
