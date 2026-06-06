import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { agentsPackageRoot } from "../runner.js";

function shellScriptsUnder(root: string, dirs: string[]): string[] {
  const paths: string[] = [];
  for (const dir of dirs) {
    const base = join(root, dir);
    for (const name of readdirSync(base)) {
      const full = join(base, name);
      if (statSync(full).isDirectory()) {
        for (const nested of readdirSync(full)) {
          if (nested.endsWith(".sh")) paths.push(join(full, nested));
        }
      } else if (name.endsWith(".sh")) {
        paths.push(full);
      }
    }
  }
  return paths;
}

test("org-worker-entrypoint uses LF line endings (no bash\\r shebang crash)", () => {
  const path = join(agentsPackageRoot(), "deploy", "org-worker-entrypoint.sh");
  const bytes = readFileSync(path);
  assert.equal(bytes.includes("\r\n"), false, `${path} must not contain CRLF`);
  const text = bytes.toString("utf8");
  assert.match(text, /^#!\/usr\/bin\/env bash\n/);
  assert.match(text, /exec "\$@"/);
});

test("Dockerfile strips CR from shell scripts during image build", () => {
  const dockerfile = readFileSync(join(agentsPackageRoot(), "deploy", "Dockerfile"), "utf8");
  assert.ok(dockerfile.includes("sed -i 's/\\r$//'"), "Dockerfile must strip CR from shell scripts");
  assert.match(dockerfile, /find \/app\/deploy \/app\/scripts/);
  assert.match(dockerfile, /org-worker-entrypoint\.sh/);
});

test("deploy and scripts shell files use LF in working tree", () => {
  const root = agentsPackageRoot();
  const scripts = shellScriptsUnder(root, ["deploy", "scripts"]);
  const crlf = scripts.filter((p) => readFileSync(p).includes("\r\n"));
  assert.deepEqual(
    crlf,
    [],
    `CRLF shell scripts break Linux K8s jobs: ${crlf.join(", ")}`,
  );
});
