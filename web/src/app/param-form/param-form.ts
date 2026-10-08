import { Component, inject } from '@angular/core';

import { DEFAULT_REQUEST, FaceFixOptions, HiresOptions, MODELS, PRESETS } from '../models';
import { WorkbenchStore } from '../workbench.store';

/** Keys of `RenderRequest` with a plain number value. */
export type NumberField = 'width' | 'height' | 'seed' | 'steps' | 'guidance' | 'lora_strength';

/** Keys of `RenderRequest` with a plain string value. */
export type TextField = 'prompt' | 'model' | 'preset' | 'sampler' | 'scheduler' | 'negative';

/**
 * Parameter form. Reads and writes ONLY `store.form()` (via the setters below); no local copy.
 *
 * Template (`param-form.html`), one control per field, each with a `<label>`;
 * every control gets `data-testid="f-<key>"` (nested: `f-hires-scale`, `f-face_fix-steps`):
 * - `prompt`, `negative`: `<textarea>`; `model`: `<select>` of `models`; `preset`: `<select>`
 *   of `presets` plus an empty option ("– Default –"); `sampler`, `scheduler`: text inputs.
 *   Text controls: `[value]="store.form().key ?? ''"`, `(input)` -> `setText(key, value)`.
 * - `width`, `height`, `seed`, `steps`, `guidance` (step 0.1), `lora_strength` (step 0.05,
 *   min 0, max 2): `<input type="number">`, `(input)` -> `setNumber(key, value)`.
 *   `seed` placeholder "zufällig".
 * - `hires`: checkbox `f-hires` (checked = `hires !== false && hires !== undefined`) ->
 *   `setHiresEnabled(checked)`; when it is an object show number inputs `scale`, `denoise`,
 *   `steps` -> `setHires(key, value)`.
 * - `face_fix`: same pattern (`steps`, `denoise`) -> `setFaceFixEnabled`, `setFaceFix`.
 * - `hand_fix`: checkbox -> `setHandFix(checked)`.
 * - `lora2`: number input (0–2, step 0.05) -> `setLora2(value)`.
 * - `<button data-testid="submit">Rendern</button>` -> `store.submit()`;
 *   disabled when no project is selected. Next to it `store.pendingJobs().length` "in Queue".
 * - `<button data-testid="reset">Defaults</button>` -> `resetToDefaults()`.
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

  /** Empty string -> remove the key (`seed`: set `null`); otherwise `Number(raw)`;
   *  `NaN` -> ignore (no change). */
  setNumber(key: NumberField, raw: string): void {
    throw new Error('not implemented');
  }

  /** Set the string. Exception: `preset` and `model` with `''` -> remove the key. */
  setText(key: TextField, value: string): void {
    throw new Error('not implemented');
  }

  /** `true` -> `hires` = previous object if it was one, else `{ scale: 1.5, denoise: 0.4,
   *  steps: 25 }`; `false` -> `hires: false`. */
  setHiresEnabled(enabled: boolean): void {
    throw new Error('not implemented');
  }

  /** Set one key of the `hires` object (only if `hires` is an object; `''`/`NaN` -> remove key). */
  setHires(key: keyof HiresOptions, raw: string): void {
    throw new Error('not implemented');
  }

  /** Like `setHiresEnabled`, default object `{ steps: 25, denoise: 0.4 }`. */
  setFaceFixEnabled(enabled: boolean): void {
    throw new Error('not implemented');
  }

  /** Like `setHires` for `face_fix`. */
  setFaceFix(key: keyof FaceFixOptions, raw: string): void {
    throw new Error('not implemented');
  }

  /** `hand_fix: enabled`. */
  setHandFix(enabled: boolean): void {
    throw new Error('not implemented');
  }

  /** `''` -> remove `lora2`; otherwise `Number(raw)` (`NaN` -> ignore). */
  setLora2(raw: string): void {
    throw new Error('not implemented');
  }

  /** `store.form.set(structuredClone(DEFAULT_REQUEST))`. */
  resetToDefaults(): void {
    throw new Error('not implemented');
  }

  /** Helper for the template: `typeof v === 'object' && v !== null`. */
  isObject(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null;
  }
}
