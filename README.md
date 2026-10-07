# flux-workbench

Lokale Projektverwaltung für FLUX-Renderings: Projekte anlegen, Renderings mit ihren
Parametern ablegen, Unterschiede zum Vorgängerbild sehen und neue Render-Aufträge über
eine Queue an die GX10-Bridge schicken.

- `server/` – Python (FastAPI): Dateien unter `projects/`, Render-Queue, Bridge-Client, `open`-Viewer
- `web/` – Angular-App (wird vom Server unter `/` ausgeliefert)
- `projects/YYYYMMDD-<Name>/<n>.png` + `<n>.json` (`{"request": …, "effective": …}`)

## Voraussetzungen (MacBook)

- [uv](https://docs.astral.sh/uv/) (bringt Python mit)
- Node.js ≥ 22 + npm

## Starten

```bash
cd web && npm ci && npm run build && cd ..
uv run flux-workbench
```

Dann <http://127.0.0.1:8080> öffnen.

## Konfiguration (Umgebungsvariablen)

| Variable | Default |
|---|---|
| `FLUX_BRIDGE_URL` | `http://192.168.178.87:8002/generate` |
| `FLUX_BRIDGE_TIMEOUT` | `900` (Sekunden) |
| `FLUX_PROJECTS_DIR` | `./projects` |
| `FLUX_PORT` | `8080` |

## Entwicklung

```bash
uv run pytest && uv run ruff check server && uv run ruff format --check server
cd web && npx ng test --watch=false && npx ng lint && npx prettier --check "src/**/*.{ts,html,css}"
# UI mit Live-Reload: Server starten, dann in web/: npx ng serve  (Proxy /api -> :8080)
```
