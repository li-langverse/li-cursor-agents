# Li World Studio — X demo script (~37s)

**Audience:** X (Twitter) — technical builders, game/sim engineers, agent-native tooling curious.  
**Visual source:** Marketing mocks from `lic` branch `cursor/studio-ui-ux-plan-loop` (`deploy/studio-demo/screenshots/`). **Not** the shipped native `li-studio` binary — production UI is `studio` + `ui` + `render` (wgpu) on Li Engine.  
**Video artifact:** `docs/demo/media/studio-x-demo.mp4` (silent reel; add VO in post or record live with this script).

---

## On-screen beats (video timeline)

| Time | Scene | Visual |
|------|-------|--------|
| 0:00–0:10 | **Hook** | Full workspace — viewport, timeline, inspector, agent running |
| 0:10–0:17 | **Beat 1** | Empty viewport — text scenes, selection, idle agent dock |
| 0:17–0:25 | **Beat 2** | Agent error strip — recovery UX, stay in flow |
| 0:25–0:37 | **CTA** | Workspace return — brand + link |

---

## Voiceover (read at ~140 wpm; ~37s total)

**[0:00 — Hook]**  
"What if your game engine editor was built for agents first — and still provable?"

**[0:10 — Beat 1]**  
"Li World Studio: text `world.li` scenes, one engine for games and simulation, layouts that adapt — not bolt-on AI."

**[0:17 — Beat 2]**  
"When an agent fails, you see it, recover, and keep editing. No mystery dialogs."

**[0:25 — CTA]**  
"We're building it in the open on Li Engine. Follow **@li_langverse** — link in bio: **li-langverse.github.io/li-language**."

---

## Post copy (X)

**Option A (short)**  
Agent-native world editor on a provable engine. Text scenes · one runtime · recovery-first agents.  
→ li-langverse.github.io/li-language  
#LiLang #gamedev #simulation

**Option B (thread hook)**  
UE/Unity hide your scene graph. Li World Studio keeps `world.li` in git and treats Cursor agents as first-class users.  
37s preview 👇 [attach `studio-x-demo.mp4`]

---

## Recording notes

- Rebuild video: `./scripts/record-studio-x-demo.sh` (from repo root).  
- Native viewport capture (SDL grid stub) needs a display; see `docs/demo/RECORDING.md`.  
- For a **live** native demo later: screen-record the `li-studio` window once PH-GD-5 wgpu shell ships; do not rely on headless Chrome for production UI.
