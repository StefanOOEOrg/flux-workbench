import { Component, inject } from '@angular/core';

import { summary } from '../format';
import {
  FaceFixOptions,
  HiresOptions,
  LoraEntry,
  MODELS,
  PRESETS,
  RenderRequest,
  SAMPLERS,
  SCHEDULERS,
} from '../models';
import { WorkbenchStore } from '../workbench.store';

/** Keys of `RenderRequest` with a plain number value. */
export type NumberField = 'width' | 'height' | 'seed' | 'steps' | 'guidance';

/** Keys of `RenderRequest` with a plain string value. */
export type TextField = 'prompt' | 'model' | 'preset' | 'sampler' | 'scheduler' | 'negative';

/** The collapsible groups of the parameter column, in display order. */
export type ParamGroup = 'model' | 'sampling' | 'fixes' | 'lora';

/**
 * Column "Parameter" (issue #11, middle card). Reads and writes ONLY `store.form()` via the
 * setters below; no local copy. Prompt and negative prompt live in `PromptPanel` now, the
 * render button too.
 *
 * Template (`param-form.html`) - NO `<form>` element; every `<button>` has `type="button"`.
 * - Head row: `<h3>Parameter</h3>` and `<button type="button" data-testid="reset"
 *   class="ghost">↺ Defaults</button>` -> `resetToDefaults()`.
 * - Four groups, each `<details data-testid="group-<key>" class="group">` with
 *   `<summary>` = `<span class="t">title</span><span class="sum" data-testid="sum-<key>">
 *   {{ groupSummary(key) }}</span>`. Titles: model "Model & size", sampling "Sampling",
 *   fixes "Hires & Fixes", lora "LoRA". All groups start CLOSED (no `open` attribute).
 * - model: `<select data-testid="f-model">` of `models` and `<select data-testid="f-preset">`
 *   of `presets`, each with an empty option "– Default –"; number inputs `f-width`, `f-height`.
 * - sampling: number inputs `f-steps`, `f-guidance` (step 0.1), `f-seed` (class `wide`,
 *   placeholder "random"); `<select data-testid="f-sampler">` of `samplers` and
 *   `<select data-testid="f-scheduler">` of `schedulers`, each with "– Default –".
 *   If the form holds a sampler/scheduler that is NOT in the list, add it as an extra option
 *   so the value is not lost (`extraOption(...)`).
 * - fixes: switch `f-hires` (checkbox styled as switch, checked = `isOn(form.hires)`) ->
 *   `setHiresEnabled(checked)`; sub-fields `f-hires-scale`, `f-hires-denoise`, `f-hires-steps`
 *   rendered ONLY if `isObject(form.hires)`. Same for `f-face_fix` with `f-face_fix-steps`,
 *   `f-face_fix-denoise`. Switch `f-hand_fix` -> `setHandFix(checked)`.
 * - lora: rendered from `store.loras()` (#34), one ROW per config entry inside a
 *   `<table class="lora">` (#41 — the rows must not reflow when a slot is switched off).
 *   With an EMPTY list the group shows the hint
 *   `<p class="hint" data-testid="no-loras">No LoRAs configured</p>` instead of the table
 *   (a fresh clone has no `loras.json`). The `@for (lora of store.loras(); track lora.key)`
 *   renders `<tr [attr.data-testid]="'lora-row-' + lora.key">` with exactly two `<td>`:
 *   1. `<td class="name">`: only when `lora.toggle` a switch
 *      `[attr.data-testid]="'f-' + lora.key + '-on'"` (checked = `isOn(store.form()[lora.key])`,
 *      change -> `setLoraEnabled(lora, checked)`), then `{{ lora.label }}`.
 *   2. `<td class="val">`: the ALWAYS rendered number input
 *      `[attr.data-testid]="'f-' + lora.key"` (0–2, step 0.05,
 *      `[value]="store.form()[lora.key] ?? ''"`, input -> `setLoraStrength(lora.key, value)`,
 *      `[disabled]="lora.toggle && !isOn(store.form()[lora.key])"`).
 *   Nothing in a row is rendered conditionally, so a row never disappears or moves.
 *   Hint "only with model “flux-lora”" below the table. The old fixed fields
 *   `f-lora_strength` / `f-lora2` / `f-lora2-on` disappear.
 *   CSS: `.lora { width: 100%; border-collapse: collapse; }`,
 *   `.lora td { padding: 3px 0; vertical-align: middle; }`, `.lora .name { white-space: nowrap;
 *   display: flex; align-items: center; gap: 8px; }`, `.lora .val { text-align: right; }`,
 *   `.lora input[type='number'] { width: 84px; }`, `.lora input:disabled { opacity: 0.45; }`.
 *   The `.toggle` inline-flex rule stays untouched — "Hires & Fixes" still uses it.
 * - Number inputs: `<input type="number">`, `[value]="store.form().key ?? ''"`, `(input)` ->
 *   setter. Selects: do NOT bind `[value]` on `<select>` (applied before the `@for` options
 *   exist); bind `[selected]="v === store.form().key"` on each option, empty option
 *   `[selected]="store.form().key === undefined"`.
 *
 * CSS (`param-form.css`): mockup style - `.fields` flex-wrap with gap 10px 14px; number inputs
 * 84px wide, `.wide` 120px; selects min-width 120px; sub-fields indented 38px; collapsed group
 * shows `.sum` right-aligned, muted, monospace 11px; `:host { display: block; }`.
 *
 * All setters build a NEW object via `store.form.update(f => ({ ...f, ... }))`.
 */
@Component({
  selector: 'app-param-form',
  templateUrl: './param-form.html',
  styleUrl: './param-form.css',
})
export class ParamForm {
  protected readonly store = inject(WorkbenchStore);
  protected readonly models = MODELS;
  protected readonly presets = PRESETS;
  protected readonly samplers = SAMPLERS;
  protected readonly schedulers = SCHEDULERS;

  /** Empty string -> remove the key (`seed`: set `null`); otherwise `Number(raw)`;
   *  `NaN` -> ignore (no change). */
  setNumber(key: NumberField, raw: string): void {
    if (raw === '') {
      if (key === 'seed') {
        this.store.form.update((f) => ({ ...f, seed: null }));
      } else {
        this.store.form.update((f) => {
          const next: RenderRequest = { ...f };
          delete next[key];
          return next;
        });
      }
      return;
    }
    const value = Number(raw);
    if (Number.isNaN(value)) {
      return;
    }
    this.store.form.update((f) => ({ ...f, [key]: value }));
  }

  /** Set the string. Exception: `preset`, `model`, `sampler`, `scheduler` with `''` -> remove
   *  the key (= bridge default). */
  setText(key: TextField, value: string): void {
    if (
      value === '' &&
      (key === 'preset' || key === 'model' || key === 'sampler' || key === 'scheduler')
    ) {
      this.store.form.update((f) => {
        const next: RenderRequest = { ...f };
        delete next[key];
        return next;
      });
      return;
    }
    this.store.form.update((f) => ({ ...f, [key]: value }));
  }

  /** `true` -> `hires` = previous object if it was one, else `{ scale: 1.5, denoise: 0.4,
   *  steps: 25 }`; `false` -> `hires: false`. */
  setHiresEnabled(enabled: boolean): void {
    this.store.form.update((f) => {
      if (!enabled) {
        return { ...f, hires: false };
      }
      const hires = this.isObject(f.hires) ? f.hires : { scale: 1.5, denoise: 0.4, steps: 25 };
      return { ...f, hires };
    });
  }

  /** Set one key of the `hires` object (only if `hires` is an object; `''`/`NaN` -> remove key). */
  setHires(key: keyof HiresOptions, raw: string): void {
    this.store.form.update((f) => {
      if (!this.isObject(f.hires)) {
        return f;
      }
      if (raw === '') {
        const next: HiresOptions = { ...f.hires };
        delete next[key];
        return { ...f, hires: next };
      }
      const value = Number(raw);
      if (Number.isNaN(value)) {
        return f;
      }
      return { ...f, hires: { ...f.hires, [key]: value } };
    });
  }

  /** Like `setHiresEnabled`, default object `{ steps: 25, denoise: 0.4 }`. */
  setFaceFixEnabled(enabled: boolean): void {
    this.store.form.update((f) => {
      if (!enabled) {
        return { ...f, face_fix: false };
      }
      const face_fix = this.isObject(f.face_fix) ? f.face_fix : { steps: 25, denoise: 0.4 };
      return { ...f, face_fix };
    });
  }

  /** Like `setHires` for `face_fix`. */
  setFaceFix(key: keyof FaceFixOptions, raw: string): void {
    this.store.form.update((f) => {
      if (!this.isObject(f.face_fix)) {
        return f;
      }
      if (raw === '') {
        const next: FaceFixOptions = { ...f.face_fix };
        delete next[key];
        return { ...f, face_fix: next };
      }
      const value = Number(raw);
      if (Number.isNaN(value)) {
        return f;
      }
      return { ...f, face_fix: { ...f.face_fix, [key]: value } };
    });
  }

  /** `hand_fix: enabled`. */
  setHandFix(enabled: boolean): void {
    this.store.form.update((f) => ({ ...f, hand_fix: enabled }));
  }

  /**
   * Strength of a LoRA slot (#34): `''` removes the key from the form, otherwise `Number(raw)`
   * (`NaN` -> ignore, no change).
   */
  setLoraStrength(key: string, raw: string): void {
    if (raw === '') {
      this.store.form.update((f) => {
        const next: RenderRequest = { ...f };
        delete next[key];
        return next;
      });
      return;
    }
    const value = Number(raw);
    if (Number.isNaN(value)) {
      return;
    }
    this.store.form.update((f) => ({ ...f, [key]: value }));
  }

  /**
   * On/off switch of a `toggle` LoRA slot (#34): `false` -> `form[lora.key] = false`;
   * `true` -> keep the current number if the value already is one, otherwise `lora.default`.
   */
  setLoraEnabled(lora: LoraEntry, enabled: boolean): void {
    this.store.form.update((f) => {
      if (!enabled) {
        return { ...f, [lora.key]: false };
      }
      const value = typeof f[lora.key] === 'number' ? f[lora.key] : lora.default;
      return { ...f, [lora.key]: value };
    });
  }

  /**
   * "Switch is on" for `hires`, `face_fix`, `lora2`: `true` if the value is `true`, a number or
   * an object; `false` for `false`, `undefined`, `null`.
   */
  isOn(value: unknown): boolean {
    return value === true || typeof value === 'number' || this.isObject(value);
  }

  /**
   * Option value missing from a fixed list, so it can be shown as an extra option:
   * returns `value` if it is a non-empty string that is NOT in `list`, otherwise `null`.
   */
  extraOption(value: string | undefined, list: readonly string[]): string | null {
    if (typeof value !== 'string' || value === '') {
      return null;
    }
    return list.includes(value) ? null : value;
  }

  /**
   * Text for the collapsed group header (use `summary()` from `../format`), from `store.form()`.
   * Fallback when all parts are empty: model/sampling `'Defaults'` (the `summary` default),
   * fixes/lora `'aus'`:
   * - model:    `[model, preset, width && height ? `${width}×${height}` : undefined]`
   * - sampling: `[steps !== undefined ? `${steps} steps` : undefined,
   *               guidance !== undefined ? `g ${guidance}` : undefined,
   *               typeof seed === 'number' ? `Seed ${seed}` : 'Seed random', sampler, scheduler]`
   * - fixes:    `[isObject(hires) ? `Hires ${hires.scale ?? '?'}×` : hires === true ? 'Hires' :
   *               undefined, isOn(face_fix) ? 'Face' : undefined, hand_fix ? 'Hand' : undefined]`,
   *             empty fallback `'aus'`
   * - lora:     one part per entry of `store.loras()` (#34): `typeof form[lora.key] === 'number'`
   *             -> `` `${lora.label} ${value}` ``, everything else skipped;
   *             empty fallback `'aus'`
   */
  groupSummary(group: ParamGroup): string {
    const f = this.store.form();
    if (group === 'model') {
      return summary([
        f.model,
        f.preset,
        f.width !== undefined && f.height !== undefined ? `${f.width}×${f.height}` : undefined,
      ]);
    }
    if (group === 'sampling') {
      return summary([
        f.steps !== undefined ? `${f.steps} steps` : undefined,
        f.guidance !== undefined ? `g ${f.guidance}` : undefined,
        typeof f.seed === 'number' ? `Seed ${f.seed}` : 'Seed random',
        f.sampler,
        f.scheduler,
      ]);
    }
    if (group === 'fixes') {
      return summary(
        [
          this.isObject(f.hires)
            ? `Hires ${f.hires['scale'] ?? '?'}×`
            : f.hires === true
              ? 'Hires'
              : undefined,
          this.isOn(f.face_fix) ? 'Face' : undefined,
          f.hand_fix ? 'Hand' : undefined,
        ],
        'aus',
      );
    }
    return summary(
      this.store.loras().map((lora) => {
        const value = f[lora.key];
        return typeof value === 'number' ? `${lora.label} ${value}` : undefined;
      }),
      'aus',
    );
  }

  /** `store.form.set(store.defaultForm())` - defaults incl. the configured LoRA strengths (#34). */
  resetToDefaults(): void {
    this.store.form.set(this.store.defaultForm());
  }

  /** Helper for the template: `typeof v === 'object' && v !== null`. */
  isObject(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null;
  }

  /** Helper for the template: return the `key` value of `hires`/`face_fix` if it's an object. */
  nestedValue(field: 'hires' | 'face_fix', key: string): unknown {
    const v = this.store.form()[field];
    if (!this.isObject(v)) {
      return undefined;
    }
    return v[key];
  }
}
