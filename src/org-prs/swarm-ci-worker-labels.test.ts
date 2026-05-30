import test from "node:test";
import assert from "node:assert/strict";
import { filterQueueRowsByLabels, rowMatchesLabelFilter } from "./swarm-ci-worker-labels.js";
test("rowMatchesLabelFilter accepts any configured swarm label", () => {
    const labels = new Map([["lic#1", ["li-swarm", "agent:ci_maintainer"]]]);
    assert.equal(rowMatchesLabelFilter({ repo: "lic", number: 1 }, labels, ["agent:docs_maintainer"]), false);
    assert.equal(rowMatchesLabelFilter({ repo: "lic", number: 1 }, labels, ["li-swarm"]), true);
});
test("filterQueueRowsByLabels keeps only labeled PRs", () => {
    const labels = new Map([
        ["a#1", ["li-swarm"]],
        ["b#2", ["other"]],
    ]);
    const rows = [
        { repo: "a", number: 1 },
        { repo: "b", number: 2 },
    ];
    const out = filterQueueRowsByLabels(rows, labels, ["li-swarm"]);
    assert.equal(out.length, 1);
    assert.equal(out[0]?.repo, "a");
});