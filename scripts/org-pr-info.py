#!/usr/bin/env python3
"""Print MR/PR mergeability for org swarm debugging (GitLab primary)."""
import json
import sys

from _vcs_api import _gitlab_mergeable_state, _github_mergeable_state, get_pr, head_sha, is_draft, vcs_provider


def main() -> None:
    for spec in sys.argv[1:]:
        repo, num_s = spec.split("#")
        num = int(num_s)
        d = get_pr(repo, num)
        if vcs_provider() == "gitlab":
            mergeable, mergeable_state = _gitlab_mergeable_state(d)
            head = head_sha(d)
            draft = is_draft(d)
            title = d.get("title", "")[:80]
        else:
            mergeable, mergeable_state = _github_mergeable_state(d)
            head = d["head"]["sha"][:7]
            draft = d.get("draft")
            title = d["title"][:80]
        print(
            f"{repo}#{num} state={mergeable_state} mergeable={mergeable} "
            f"draft={draft} head={head} title={title}"
        )


if __name__ == "__main__":
    main()
