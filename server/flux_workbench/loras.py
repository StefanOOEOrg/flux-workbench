"""LoRA slots for the parameter form, read from ``loras.json`` (#34).

The render bridge on the GX10 owns the LoRA files and the request keys they are
addressed with (today ``lora_strength`` and ``lora2``). This module only describes
those slots for the UI: display label, default strength and whether the form shows
an on/off switch. Nothing here talks to the bridge.
"""

import json
from dataclasses import dataclass
from pathlib import Path

#: Hard limit for configurable LoRA slots (Stefan: "maximal 5 einträge").
MAX_LORAS = 5

#: Strength range the bridge accepts (see the render.py example).
MIN_STRENGTH = 0.0
MAX_STRENGTH = 2.0


class LoraConfigError(ValueError):
    """``loras.json`` is structurally invalid. ``load_loras`` falls back to the defaults."""


@dataclass(frozen=True)
class Lora:
    """One LoRA slot: request ``key``, form ``label``, default strength, switch or plain field."""

    key: str
    label: str
    default: float
    toggle: bool


@dataclass(frozen=True)
class LoraConfig:
    """Result of ``load_loras``: the slots used and a warning when the file was not usable."""

    loras: tuple[Lora, ...]
    warning: str | None = None


#: Used when the config file is missing or invalid - the values that were hardcoded before #34.
DEFAULT_LORAS: tuple[Lora, ...] = (
    Lora(key="lora_strength", label="LoRA 1", default=0.2, toggle=False),
    Lora(key="lora2", label="LoRA 2", default=1.35, toggle=True),
)


def parse_loras(data: object) -> tuple[Lora, ...]:
    """Turn parsed JSON into the slot tuple. Returns ``()`` for an empty list.

    ``data`` must be a dict with a ``"loras"`` list holding 0..``MAX_LORAS`` entries
    (in display order). Each entry must be a dict with:
    - ``"key"``: non-empty string, unique within the list (the request key the bridge knows).
    - ``"label"``: non-empty string (shown in the form).
    - ``"default"``: ``int`` or ``float`` (a ``bool`` counts as invalid) with
      ``MIN_STRENGTH <= default <= MAX_STRENGTH``; stored as ``float``.
    - ``"toggle"``: optional ``bool``, missing -> ``False``.

    Raises:
        LoraConfigError: with a short English message ("Missing 'loras' list",
            "More than 5 LoRAs", "Lora 2: 'key' must be a non-empty string",
            "Lora 3: duplicate key 'lora2'",
            "Lora 1: 'default' must be a number between 0 and 2", ...).
    """
    entries = data.get("loras") if isinstance(data, dict) else None
    if not isinstance(entries, list):
        raise LoraConfigError("Missing 'loras' list")
    if len(entries) > MAX_LORAS:
        raise LoraConfigError(f"More than {MAX_LORAS} LoRAs")

    loras: list[Lora] = []
    seen: set[str] = set()
    for index, entry in enumerate(entries, start=1):
        if not isinstance(entry, dict):
            raise LoraConfigError(f"Lora {index}: must be an object")
        key = entry.get("key")
        if not isinstance(key, str) or not key:
            raise LoraConfigError(f"Lora {index}: 'key' must be a non-empty string")
        if key in seen:
            raise LoraConfigError(f"Lora {index}: duplicate key {key!r}")
        seen.add(key)
        label = entry.get("label")
        if not isinstance(label, str) or not label:
            raise LoraConfigError(f"Lora {index}: 'label' must be a non-empty string")
        default = entry.get("default")
        if (
            isinstance(default, bool)
            or not isinstance(default, int | float)
            or not MIN_STRENGTH <= default <= MAX_STRENGTH
        ):
            raise LoraConfigError(
                f"Lora {index}: 'default' must be a number between "
                f"{MIN_STRENGTH:g} and {MAX_STRENGTH:g}"
            )
        toggle = entry.get("toggle", False)
        if not isinstance(toggle, bool):
            raise LoraConfigError(f"Lora {index}: 'toggle' must be a boolean")
        loras.append(Lora(key=key, label=label, default=float(default), toggle=toggle))
    return tuple(loras)


def load_loras(path: Path) -> LoraConfig:
    """Read ``path`` and return the configured slots.

    - File missing -> ``LoraConfig(DEFAULT_LORAS, "LoRA config <name> not found - using
      defaults")``.
    - ``OSError`` / JSON error / not a JSON object / ``LoraConfigError`` ->
      ``LoraConfig(DEFAULT_LORAS, "<short reason> - using defaults")``; the reason must contain
      the file name, so the user sees which file is broken.
    - Valid file -> ``LoraConfig(parse_loras(data), None)``.

    Never raises: a broken config must not stop the workbench from starting.
    """
    name = path.name
    try:
        text = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return LoraConfig(DEFAULT_LORAS, f"LoRA config {name} not found - using defaults")
    except OSError as exc:
        return LoraConfig(
            DEFAULT_LORAS, f"LoRA config {name} unreadable ({exc.strerror}) - using defaults"
        )
    try:
        data = json.loads(text)
    except ValueError:
        return LoraConfig(DEFAULT_LORAS, f"LoRA config {name} is not valid JSON - using defaults")
    if not isinstance(data, dict):
        return LoraConfig(
            DEFAULT_LORAS, f"LoRA config {name} must hold a JSON object - using defaults"
        )
    try:
        return LoraConfig(parse_loras(data), None)
    except LoraConfigError as exc:
        return LoraConfig(DEFAULT_LORAS, f"LoRA config {name}: {exc} - using defaults")
