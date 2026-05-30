#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, os, sys, time, urllib.parse, urllib.request
from pathlib import Path
ORG, API = "li-langverse", "https://api.github.com"
BASELINE = Path(__file__).resolve().parents[1] / "data" / "goal-directed-sprints" / "org-pr-merge-baseline.json"
def headers():
    token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    if not token: raise SystemExit("GH_TOKEN required")
    return {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
def baseline_keys():
    return {(p["repo"], int(p["number"])) for p in json.loads(BASELINE.read_text(encoding="utf-8")).get("prs", [])}
def count_open(new_only=False):
    baseline = baseline_keys() if new_only else set()
    page, n = 1, 0
    while True:
        q = urllib.parse.quote(f"org:{ORG} is:open is:pr")
        req = urllib.request.Request(f"{API}/search/issues?q={q}&per_page=100&page={page}", headers=headers())
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read().decode())
        for item in data.get("items", []):
            key = (item["repository_url"].rstrip("/").split("/")[-1], int(item["number"]))
            if not new_only or key not in baseline: n += 1
        if len(data.get("items", [])) < 100: break
        page += 1; time.sleep(1)
    return n
def main():
    p = argparse.ArgumentParser()
    p.add_argument("--new-only", action="store_true")
    p.add_argument("--require-zero", action="store_true")
    p.add_argument("--json", action="store_true")
    args = p.parse_args()
    label = "new_open_prs" if args.new_only else "open_prs"
    c = count_open(args.new_only)
    print(json.dumps({label: c}) if args.json else f"org-pr-merge: {label}={c}")
    if args.require_zero:
        sys.exit(0 if c == 0 else 1)
if __name__ == "__main__": main()
