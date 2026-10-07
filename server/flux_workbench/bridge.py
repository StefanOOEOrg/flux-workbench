"""Client for the GX10 render bridge (POST JSON -> PNG + ``X-Render-Settings`` header).

Pattern taken from ``mcp-rendering/src/renderer.py``.
"""

from dataclasses import dataclass
from typing import Any

import httpx

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


class BridgeError(RuntimeError):
    """Render failed; the message is shown to the user as the job error."""


@dataclass(frozen=True)
class RenderResult:
    """A finished render."""

    png: bytes
    #: Parsed ``X-Render-Settings`` header; ``None`` if missing or not a JSON object.
    effective: dict[str, Any] | None


def clean_payload(request: dict[str, Any]) -> dict[str, Any]:
    """Return a shallow copy of ``request`` without top-level keys whose value is ``None``.

    The bridge treats a missing key as "use preset default"; ``None`` must not be sent
    (e.g. ``seed: None`` -> key removed, bridge rolls a seed). ``False``, ``0`` and ``""``
    are kept. The input dict must not be modified.
    """
    raise NotImplementedError


class BridgeClient:
    """Sends one render request at a time (the queue guarantees sequential use)."""

    def __init__(self, url: str, timeout: float, client: httpx.AsyncClient | None = None) -> None:
        """Keep ``url`` and ``timeout``; use ``client`` or create ``httpx.AsyncClient()``."""
        self.url = url
        self.timeout = timeout
        self.client = client or httpx.AsyncClient()

    async def render(self, request: dict[str, Any]) -> RenderResult:
        """POST ``clean_payload(request)`` as JSON to ``self.url`` and return the result.

        Use ``timeout=httpx.Timeout(self.timeout, connect=10)``.

        Error handling (always raise ``BridgeError``, never let httpx errors escape):
        - ``httpx.TimeoutException`` -> ``BridgeError(f"Timeout nach {self.timeout:.0f} s")``
        - other ``httpx.HTTPError`` -> ``BridgeError(f"Bridge nicht erreichbar: {exc}")``
        - status != 200 -> ``BridgeError(f"HTTP {status}: {resp.text[:500]}")``
          (a 400 body contains the bridge's reason - it must appear in the message)
        - body does not start with ``PNG_SIGNATURE`` ->
          ``BridgeError(f"Bridge lieferte kein PNG ({content-type header})")``

        ``effective``: ``json.loads`` of header ``X-Render-Settings``; ``None`` if the header is
        missing, not valid JSON, or not a JSON object.
        """
        raise NotImplementedError

    async def aclose(self) -> None:
        """Close the underlying httpx client."""
        await self.client.aclose()
