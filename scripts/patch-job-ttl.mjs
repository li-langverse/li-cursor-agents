import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const ttlImport =
  'import { FINISHED_JOB_TTL_SECONDS } from "../k8s/finished-job-ttl.js";\n';

for (const rel of [
  "src/org-prs/org-pr-k8s-client.ts",
  "src/org-issues/org-issue-k8s-client.ts",
  "src/org-research/org-research-k8s-client.ts",
]) {
  const fp = path.join(root, rel);
  let s = fs.readFileSync(fp, "utf8");
  if (!s.includes("finished-job-ttl")) s = ttlImport + s;
  s = s.replace(
    "ttlSecondsAfterFinished: 86400",
    "ttlSecondsAfterFinished: FINISHED_JOB_TTL_SECONDS",
  );
  fs.writeFileSync(fp, s);
  console.log("patched", rel);
}

const cronDir = path.join(root, "deploy/k8s/engine");
for (const f of fs.readdirSync(cronDir).filter((x) => x.startsWith("cronjob-"))) {
  const fp = path.join(cronDir, f);
  let y = fs.readFileSync(fp, "utf8");
  if (y.includes("ttlSecondsAfterFinished")) {
    console.log("ttl already in", f);
    continue;
  }
  y = y.replace(
    /(\s+jobTemplate:\r?\n\s+spec:\r?\n)(\s+backoffLimit:)/,
    "$1      ttlSecondsAfterFinished: 3600\n$2",
  );
  fs.writeFileSync(fp, y);
  console.log("patched cronjob", f);
}
