#!/usr/bin/env python3
"""Keep proof-explorer desktop shards at replicas=1; restart stuck pods."""
from __future__ import annotations

import json
import os
import ssl
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

NS = os.environ.get("LI_GOAL_NAMESPACE", "li-swarm")
INTERVAL = int(os.environ.get("LI_PROOF_EXPLORER_UNBLOCKER_INTERVAL_SEC", "600"))
SHARDS = int(os.environ.get("LI_PROOF_EXPLORER_SHARD_TOTAL", "6"))
STUCK_MIN = int(os.environ.get("LI_PROOF_EXPLORER_UNBLOCKER_STUCK_MIN", "180"))
LONG_RUN_MIN = int(os.environ.get("LI_PROOF_EXPLORER_UNBLOCKER_LONG_RUN_MIN", "240"))

STUCK_REASONS = {
    "ImagePullBackOff",
    "ErrImagePull",
    "CrashLoopBackOff",
    "CreateContainerConfigError",
    "InvalidImageName",
    "CreateContainerError",
    "RunContainerError",
    "OOMKilled",
}


def _load_in_cluster() -> tuple[str, str]:
    token_path = "/var/run/secrets/kubernetes.io/serviceaccount/token"
    with open(token_path, encoding="utf-8") as f:
        token = f.read().strip()
    host = os.environ.get("KUBERNETES_SERVICE_HOST", "")
    port = os.environ.get("KUBERNETES_SERVICE_PORT_HTTPS", "443")
    if not host:
        raise RuntimeError("not in cluster")
    return f"https://{host}:{port}", token


def k8s_request(method: str, path: str, body: dict | None = None) -> tuple[int, object]:
    base, token = _load_in_cluster()
    url = f"{base}{path}"
    data = None if body is None else json.dumps(body).encode("utf-8")
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
    if data is not None:
        headers["Content-Type"] = "application/merge-patch+json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    ctx = ssl.create_default_context()
    with open("/var/run/secrets/kubernetes.io/serviceaccount/ca.crt", "rb") as f:
        ctx.load_verify_locations(cadata=f.read().decode("utf-8"))
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="ignore")
        try:
            parsed: object = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            parsed = raw
        return e.code, parsed


def shard_names() -> list[str]:
    return [f"li-proof-explorer-shard-{i}" for i in range(SHARDS)]


def scale_up(name: str) -> None:
    status, _ = k8s_request("GET", f"/apis/apps/v1/namespaces/{NS}/deployments/{name}")
    if status == 404:
        print(f"unblocker: missing deploy {name}")
        return
    status, body = k8s_request("GET", f"/apis/apps/v1/namespaces/{NS}/deployments/{name}")
    if status != 200 or not isinstance(body, dict):
        return
    replicas = (body.get("spec") or {}).get("replicas", 0)
    if replicas >= 1:
        return
    patch = {"spec": {"replicas": 1}}
    st, _ = k8s_request("PATCH", f"/apis/apps/v1/namespaces/{NS}/deployments/{name}", patch)
    print(f"unblocker: scale {name} 0->1 status={st}")


def restart_deploy(name: str) -> None:
    ts = datetime.now(timezone.utc).isoformat()
    patch = {"spec": {"template": {"metadata": {"annotations": {"li-langverse.io/unblocker-restartedAt": ts}}}}}
    st, _ = k8s_request("PATCH", f"/apis/apps/v1/namespaces/{NS}/deployments/{name}", patch)
    print(f"unblocker: restart {name} status={st}")


def heal_pods() -> None:
    status, body = k8s_request("GET", f"/api/v1/namespaces/{NS}/pods")
    if status != 200 or not isinstance(body, dict):
        return
    now = datetime.now(timezone.utc)
    restarted: set[str] = set()
    for item in body.get("items") or []:
        meta = item.get("metadata") or {}
        labels = meta.get("labels") or {}
        app = labels.get("app", "")
        if not app.startswith("li-proof-explorer-shard-"):
            continue
        dep = app
        st = item.get("status") or {}
        phase = st.get("phase", "")
        waiting = None
        running_at = None
        for cs in st.get("containerStatuses") or []:
            state = cs.get("state") or {}
            if state.get("waiting", {}).get("reason"):
                waiting = state["waiting"]["reason"]
            if state.get("running", {}).get("startedAt"):
                running_at = state["running"]["startedAt"]
            term = (state.get("terminated") or {}).get("reason")
            if term in ("OOMKilled", "Error"):
                waiting = term
        if waiting and waiting in STUCK_REASONS and dep not in restarted:
            restart_deploy(dep)
            restarted.add(dep)
            continue
        if phase == "Pending" and st.get("startTime"):
            started = datetime.fromisoformat(st["startTime"].replace("Z", "+00:00"))
            if (now - started).total_seconds() > STUCK_MIN * 60 and dep not in restarted:
                restart_deploy(dep)
                restarted.add(dep)
            continue
        if phase == "Running" and running_at:
            started = datetime.fromisoformat(running_at.replace("Z", "+00:00"))
            if (now - started).total_seconds() > LONG_RUN_MIN * 60 and dep not in restarted:
                print(f"unblocker: long run {dep} pod={meta.get('name')} — restart")
                restart_deploy(dep)
                restarted.add(dep)


def tick() -> None:
    for name in shard_names():
        scale_up(name)
    heal_pods()


def main() -> None:
    print(f"proof-explorer-shard-unblocker: ns={NS} shards={SHARDS} interval={INTERVAL}s")
    while True:
        try:
            tick()
        except Exception as exc:  # noqa: BLE001
            print(f"unblocker: error {exc}")
        time.sleep(INTERVAL)


if __name__ == "__main__":
    main()
