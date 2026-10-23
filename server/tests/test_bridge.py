import json

import httpx
import pytest
import respx

from flux_workbench.bridge import BridgeClient, BridgeError, clean_payload

from .conftest import PNG

URL = "http://bridge.test/generate"


def test_clean_payload_drops_none_only() -> None:
    request = {"prompt": "p", "seed": None, "hand_fix": False, "steps": 0, "negative": ""}
    assert clean_payload(request) == {"prompt": "p", "hand_fix": False, "steps": 0, "negative": ""}
    assert request["seed"] is None  # input unchanged


@pytest.fixture
def client() -> BridgeClient:
    return BridgeClient(URL, timeout=5)


@respx.mock
async def test_render_success(client: BridgeClient) -> None:
    effective = {"prompt": "p", "seed": 42}
    route = respx.post(URL).mock(
        return_value=httpx.Response(
            200, content=PNG, headers={"X-Render-Settings": json.dumps(effective)}
        )
    )
    result = await client.render({"prompt": "p", "seed": None})
    assert result.png == PNG
    assert result.effective == effective
    assert json.loads(route.calls[0].request.content) == {"prompt": "p"}


@respx.mock
@pytest.mark.parametrize("header", [None, "not json", "[1]"])
async def test_render_bad_or_missing_header(client: BridgeClient, header: str | None) -> None:
    headers = {"X-Render-Settings": header} if header else {}
    respx.post(URL).mock(return_value=httpx.Response(200, content=PNG, headers=headers))
    result = await client.render({"prompt": "p"})
    assert result.effective is None


@respx.mock
async def test_render_400_contains_reason(client: BridgeClient) -> None:
    respx.post(URL).mock(return_value=httpx.Response(400, text="steps must be <= 100"))
    with pytest.raises(BridgeError, match=r"HTTP 400: steps must be <= 100"):
        await client.render({"prompt": "p"})


@respx.mock
async def test_render_not_png(client: BridgeClient) -> None:
    respx.post(URL).mock(
        return_value=httpx.Response(200, text="oops", headers={"content-type": "text/plain"})
    )
    with pytest.raises(BridgeError, match="no PNG"):
        await client.render({"prompt": "p"})


@respx.mock
async def test_render_timeout(client: BridgeClient) -> None:
    respx.post(URL).mock(side_effect=httpx.ReadTimeout("slow"))
    with pytest.raises(BridgeError, match="Timeout"):
        await client.render({"prompt": "p"})


@respx.mock
async def test_render_connection_error(client: BridgeClient) -> None:
    respx.post(URL).mock(side_effect=httpx.ConnectError("refused"))
    with pytest.raises(BridgeError, match="not reachable"):
        await client.render({"prompt": "p"})


@respx.mock
async def test_connection_error_names_the_url_and_the_env_var(client: BridgeClient) -> None:
    """#45: a wrong FLUX_BRIDGE_URL must be diagnosable from the error text."""
    respx.post(URL).mock(side_effect=httpx.ConnectError("All connection attempts failed"))

    with pytest.raises(BridgeError) as excinfo:
        await client.render({"prompt": "p"})

    message = str(excinfo.value)
    assert URL in message
    assert "FLUX_BRIDGE_URL" in message
    assert "All connection attempts failed" in message
