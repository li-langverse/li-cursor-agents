import { existsSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, resolve, sep } from "node:path";
import { agentsPackageRoot } from "../runner.js";
import { resolveBenchmarksRoot } from "../preflight.js";
import { controlPlaneRoot, runsDir } from "./paths.js";

const MAX_BYTES = 512_000;

export interface SafeFileReadResult {
  path: string;
  resolved_path: string;
  content: string;
  truncated: boolean;
  size_bytes: number;
}

function licRoot(): string | undefined {
  const env = process.env.LIC_ROOT?.trim();
  if (env) return env;
  const benchmarks = resolveBenchmarksRoot();
  if (benchmarks) return join(benchmarks, "..", "lic");
  return undefined;
}

export function allowedFileReadRoots(): string[] {
  const roots: string[] = [agentsPackageRoot(), runsDir(), controlPlaneRoot()];
  const benchmarks = resolveBenchmarksRoot();
  if (benchmarks) roots.push(benchmarks);
  const lic = licRoot();
  if (lic) roots.push(lic);
  return [...new Set(roots.map((r) => resolve(r)))];
}

function isPathInsideRoot(resolvedFile: string, resolvedRoot: string): boolean {
  const root = resolvedRoot.endsWith(sep) ? resolvedRoot : resolvedRoot + sep;
  return resolvedFile === resolvedRoot || resolvedFile.startsWith(root);
}

function resolveUnderRoots(filePath: string, cwd?: string): string | null {
  const raw = filePath.trim();
  if (!raw || raw.includes("\0")) return null;
  if (raw.split(/[/\\]/).some((seg) => seg === "..")) return null;

  const candidates: string[] = [];
  if (isAbsolute(raw)) {
    candidates.push(raw);
  } else if (cwd) {
    candidates.push(join(cwd, raw));
  }
  for (const root of allowedFileReadRoots()) {
    candidates.push(isAbsolute(raw) ? raw : join(root, raw));
  }

  for (const candidate of candidates) {
    const abs = resolve(candidate);
    if (!existsSync(abs)) continue;
    let resolvedFile: string;
    let resolvedRoot: string;
    try {
      resolvedFile = realpathSync(abs);
    } catch {
      continue;
    }
    for (const root of allowedFileReadRoots()) {
      if (!existsSync(root)) continue;
      try {
        resolvedRoot = realpathSync(root);
      } catch {
        continue;
      }
      if (isPathInsideRoot(resolvedFile, resolvedRoot)) return resolvedFile;
    }
  }
  return null;
}

export function readFileSafe(filePath: string, cwd?: string): SafeFileReadResult | null {
  const resolved = resolveUnderRoots(filePath, cwd);
  if (!resolved) return null;

  const buf = readFileSync(resolved);
  const truncated = buf.length > MAX_BYTES;
  const slice = truncated ? buf.subarray(0, MAX_BYTES) : buf;
  return {
    path: filePath,
    resolved_path: resolved,
    content: slice.toString("utf8"),
    truncated,
    size_bytes: buf.length,
  };
}
