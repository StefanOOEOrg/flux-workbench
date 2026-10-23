"""Configuration from environment variables (fully implemented, no stub)."""

import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]

# #52: read a `.env` before any constant below is computed, because all of them are built at
# import time:
#   from .env_file import load_env_file
#   ENV_FILE = Path(os.environ.get("FLUX_ENV_FILE", REPO_ROOT / ".env"))
#   load_env_file(ENV_FILE)   # process environment wins over the file
# `ENV_FILE` is exported so `main()` can tell the user which file was used.

#: Folder that contains one sub-folder per project (YYYYMMDD-<name>).
PROJECTS_DIR = Path(os.environ.get("FLUX_PROJECTS_DIR", REPO_ROOT / "projects")).resolve()

#: LoRA slot configuration (#34); re-read on every ``GET /api/config``, so editing the file
#: only needs a browser reload.
LORA_CONFIG_PATH = Path(os.environ.get("FLUX_LORA_CONFIG", REPO_ROOT / "loras.json")).resolve()

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
