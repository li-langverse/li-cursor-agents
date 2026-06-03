import fs from "node:fs";
import path from "node:path";

const patch = JSON.stringify({
  spec: {
    jobTemplate: {
      spec: {
        ttlSecondsAfterFinished: 3600,
      },
    },
  },
});

const cronjobs = [
  "li-org-issue-supervisor-wake",
  "li-org-issue-worker",
  "li-org-pr-supervisor-wake",
  "li-org-reviewer-supervisor-wake",
  "li-org-research-supervisor-wake",
  "li-org-planner-supervisor-wake",
  "limq-bench-reporter",
];

const patchFile = path.join(import.meta.dirname, "cronjob-ttl-patch.json");
fs.writeFileSync(patchFile, patch);
console.log("wrote", patchFile);
console.log("cronjobs:", cronjobs.join(", "));
