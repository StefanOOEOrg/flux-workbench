# flux-workbench

Local project manager for FLUX renderings: create projects, keep renderings together with their
parameters, see what changed from the previous image, and send new render jobs through a queue
to the render bridge.

- `server/` – Python (FastAPI): files under `projects/`, render queue, bridge client, `open` viewer
- `web/` – Angular app (served by the server under `/`)
- `projects/YYYYMMDD-<name>/<n>.png` + `<n>.json` (`{"request": …, "effective": …}`)

## Requirements

- [uv](https://docs.astral.sh/uv/) (brings its own Python)
- Node.js ≥ 22 + npm

## Run

```bash
cd web && npm ci && npm run build && cd ..
uv run flux-workbench
```

Then open <http://127.0.0.1:8080>.

## Configuration (environment variables)

| Variable | Default |
|---|---|
| `FLUX_BRIDGE_URL` | `http://127.0.0.1:8002/generate` |
| `FLUX_BRIDGE_TIMEOUT` | `900` (seconds) |
| `FLUX_PROJECTS_DIR` | `./projects` |
| `FLUX_LORA_CONFIG` | `./loras.json` |
| `FLUX_PORT` | `8080` |

### LoRA slots

The parameter form shows one control per LoRA slot listed in `loras.json` (at most 5 entries).
Which LoRA file a slot loads is decided by the render bridge on the GX10, so the `key` must be a
request key the bridge knows (today `lora_strength` and `lora2`).

```bash
cp loras.example.json loras.json   # then edit labels, defaults and toggles
```

`loras.json` is **not** committed (see `.gitignore`) — every machine keeps its own. Without the
file the form shows "No LoRAs configured"; a broken file falls back to the two built-in slots and
shows a warning.

## Development

```bash
uv run pytest && uv run ruff check server && uv run ruff format --check server
cd web && npx ng test --watch=false && npx ng lint && npx prettier --check "src/**/*.{ts,html,css}"
# UI with live reload: start the server, then in web/: npx ng serve  (proxy /api -> :8080)
```
