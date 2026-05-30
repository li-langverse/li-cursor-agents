import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SWARM_CI_WORKER_LABELS, swarmCiWorkerDeferredBySprintRole, swarmCiWorkerEnabled, swarmCiWorkerLabelFilter, swarmCiWorkerRequireLabels, } from "./swarm-ci-worker-config.js";
test("swarmCiWorkerEnabled requires LI_SWARM_CI_WORKER_ALWAYS_ON", () => {
    const prevOn = process.env.LI_SWARM_CI_WORKER_ALWAYS_ON;
    const prevRole = process.env.ORG_PR_SPRINT_ROLE;
    delete process.env.LI_SWARM_CI_WORKER_ALWAYS_ON;
    delete process.env.ORG_PR_SPRINT_ROLE;
    assert.equal(swarmCiWorkerEnabled(), false);
    process.env.LI_SWARM_CI_WORKER_ALWAYS_ON = "1";
    assert.equal(swarmCiWorkerEnabled(), true);
    process.env.ORG_PR_SPRINT_ROLE = "old-dirty";
    assert.equal(swarmCiWorkerDeferredBySprintRole(), "old-dirty");
    assert.equal(swarmCiWorkerEnabled(), false);
    if (prevOn === undefined)
        delete process.env.LI_SWARM_CI_WORKER_ALWAYS_ON;
    else
        process.env.LI_SWARM_CI_WORKER_ALWAYS_ON = prevOn;
    if (prevRole === undefined)
        delete process.env.ORG_PR_SPRINT_ROLE;
    else
        process.env.ORG_PR_SPRINT_ROLE = prevRole;
});
test("default label filter includes li-swarm and ci_maintainer", () => {
    const prev = process.env.LI_SWARM_CI_WORKER_LABELS;
    delete process.env.LI_SWARM_CI_WORKER_LABELS;
    const labels = swarmCiWorkerLabelFilter();
    assert.ok(labels.includes("li-swarm"));
    assert.ok(labels.includes("agent:ci_maintainer"));
    assert.equal(labels.length, DEFAULT_SWARM_CI_WORKER_LABELS.length);
    if (prev === undefined)
        delete process.env.LI_SWARM_CI_WORKER_LABELS;
    else
        process.env.LI_SWARM_CI_WORKER_LABELS = prev;
});
test("swarmCiWorkerRequireLabels defaults true", () => {
    const prev = process.env.LI_SWARM_CI_WORKER_REQUIRE_LABELS;
    delete process.env.LI_SWARM_CI_WORKER_REQUIRE_LABELS;
    assert.equal(swarmCiWorkerRequireLabels(), true);
    process.env.LI_SWARM_CI_WORKER_REQUIRE_LABELS = "0";
    assert.equal(swarmCiWorkerRequireLabels(), false);
    if (prev === undefined)
        delete process.env.LI_SWARM_CI_WORKER_REQUIRE_LABELS;
    else
        process.env.LI_SWARM_CI_WORKER_REQUIRE_LABELS = prev;
});