import json

import pytest

from flux_workbench.loras import (
    DEFAULT_LORAS,
    MAX_LORAS,
    Lora,
    LoraConfigError,
    load_loras,
    parse_loras,
)


def test_parse_loras_reads_key_label_default_and_toggle() -> None:
    data = {
        "loras": [
            {"key": "lora_strength", "label": "Detail", "default": 0.2},
            {"key": "lora2", "label": "Realism", "default": 1.35, "toggle": True},
        ]
    }
    assert parse_loras(data) == (
        Lora(key="lora_strength", label="Detail", default=0.2, toggle=False),
        Lora(key="lora2", label="Realism", default=1.35, toggle=True),
    )


def test_parse_loras_accepts_an_empty_list() -> None:
    assert parse_loras({"loras": []}) == ()


def test_parse_loras_allows_up_to_five_entries() -> None:
    entries = [
        {"key": f"lora{i}", "label": f"LoRA {i}", "default": 1.0} for i in range(1, MAX_LORAS + 1)
    ]
    assert len(parse_loras({"loras": entries})) == MAX_LORAS


@pytest.mark.parametrize(
    "data",
    [
        {},
        {"loras": "nope"},
        {"loras": [{"key": "", "label": "x", "default": 1.0}]},
        {"loras": [{"label": "x", "default": 1.0}]},
        {"loras": [{"key": "a", "label": "", "default": 1.0}]},
        {"loras": [{"key": "a", "label": "A"}]},
        {"loras": [{"key": "a", "label": "A", "default": True}]},
        {"loras": [{"key": "a", "label": "A", "default": 2.5}]},
        {"loras": [{"key": "a", "label": "A", "default": -0.5}]},
        {"loras": [{"key": "a", "label": "A", "default": 1.0, "toggle": "yes"}]},
        {"loras": [{"key": "a", "label": "A", "default": 1.0}, {"key": "a", "label": "B"}]},
        {"loras": [{"key": "a", "label": "A", "default": 1.0}, "nope"]},
        {
            "loras": [
                {"key": f"lora{i}", "label": "x", "default": 1.0} for i in range(1, MAX_LORAS + 2)
            ]
        },
    ],
)
def test_parse_loras_rejects_invalid_input(data: object) -> None:
    with pytest.raises(LoraConfigError):
        parse_loras(data)


def test_load_loras_reads_the_file(tmp_path) -> None:
    path = tmp_path / "loras.json"
    path.write_text(
        json.dumps({"loras": [{"key": "lora_strength", "label": "Detail", "default": 0.3}]}),
        encoding="utf-8",
    )

    config = load_loras(path)

    assert config.loras == (Lora(key="lora_strength", label="Detail", default=0.3, toggle=False),)
    assert config.warning is None


@pytest.mark.parametrize("content", [None, "not json", "[1, 2]", '{"loras": [{"key": ""}]}'])
def test_load_loras_falls_back_to_the_defaults_with_a_warning(tmp_path, content) -> None:
    path = tmp_path / "loras.json"
    if content is not None:
        path.write_text(content, encoding="utf-8")

    config = load_loras(path)

    assert config.loras == DEFAULT_LORAS
    assert config.warning is not None
    assert "loras.json" in config.warning
    assert config.warning.endswith("using defaults")
