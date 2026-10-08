import { Component, inject } from '@angular/core';

import {
  DEFAULT_REQUEST,
  FaceFixOptions,
  HiresOptions,
  MODELS,
  PRESETS,
  RenderRequest,
} from '../models';
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

  /** Set the string. Exception: `preset` and `model` with `''` -> remove the key. */
  setText(key: TextField, value: string): void {
    if (value === '' && (key === 'preset' || key === 'model')) {
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

  /** `''` -> remove `lora2`; otherwise `Number(raw)` (`NaN` -> ignore). */
  setLora2(raw: string): void {
    if (raw === '') {
      this.store.form.update((f) => {
        const next: RenderRequest = { ...f };
        delete next.lora2;
        return next;
      });
      return;
    }
    const value = Number(raw);
    if (Number.isNaN(value)) {
      return;
    }
    this.store.form.update((f) => ({ ...f, lora2: value }));
  }

  /** `store.form.set(structuredClone(DEFAULT_REQUEST))`. */
  resetToDefaults(): void {
    this.store.form.set(structuredClone(DEFAULT_REQUEST));
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
