"""Configuration from environment variables (fully implemented, no stub)."""

import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]

#: Folder that contains one sub-folder per project (YYYYMMDD-<name>).
PROJECTS_DIR = Path(os.environ.get("FLUX_PROJECTS_DIR", REPO_ROOT / "projects")).resolve()

#: Built Angular app (``npm run build`` in web/).
WEB_DIST_DIR = Path(
    os.environ.get("FLUX_WEB_DIST_DIR", REPO_ROOT / "web" / "dist" / "web" / "browser")
).resolve()

#: Full URL of the render bridge endpoint.
BRIDGE_URL = os.environ.get("FLUX_BRIDGE_URL", "http://127.0.0.1:8002/generate")

#: Seconds to wait for one render (final + hires can take several minutes).
BRIDGE_TIMEOUT = float(os.environ.get("FLUX_BRIDGE_TIMEOUT", "900"))

HOST = os.environ.get("FLUX_HOST", "127.0.0.1")
PORT = int(os.environ.get("FLUX_PORT", "8080"))
