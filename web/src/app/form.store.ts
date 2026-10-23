import { Injectable, computed, signal } from '@angular/core';

import { DEFAULT_REQUEST, LoraEntry, RenderRequest } from './models';

/**
 * Parameter form state plus the LoRA slots (#47): the part of `WorkbenchStore` that has no
 * dependency on projects, images or the queue.
 *
 * `WorkbenchStore` injects this store and exposes the signals as ALIASES
 * (`readonly form = this.forms.form;`), so components and the store itself keep calling
 * `this.form()` / `this.form.set(...)` - the very same signal object.
 */
@Injectable({ providedIn: 'root' })
export class FormStore {
  /**
   * LoRA slots from `GET /api/config` (#34), in display order. Empty until `loadConfig()` ran;
   * with an empty list the parameter form shows no LoRA fields and `defaultForm()` is plain
   * `DEFAULT_REQUEST`.
   */
  readonly loras = signal<LoraEntry[]>([]);

  /** Current content of the parameter form. */
  readonly form = signal<RenderRequest>(structuredClone(DEFAULT_REQUEST));

  /**
   * Last "clean" form state: set together with `form` whenever the form is loaded from an image
   * or reset to the defaults, and to a copy of `form()` after a successful `submit()`.
   */
  readonly formBaseline = signal<RenderRequest>(structuredClone(DEFAULT_REQUEST));

  /**
   * `true` if the form has unrendered changes:
   * `diffSettings(formBaseline() as Record, form() as Record).length > 0` (reuse the existing
   * settings diff; cast via `as unknown as Record<string, unknown>`).
   */
  readonly dirty = computed<boolean>(() => {
    throw new Error('not implemented yet');
  });

  /**
   * Default form state: a deep copy of `DEFAULT_REQUEST` plus one entry per configured LoRA
   * (#34) - `form[lora.key] = lora.default` for every entry of `loras()`, so a fresh form has the
   * configured strengths. Never mutates `DEFAULT_REQUEST`.
   */
  defaultForm(): RenderRequest {
    throw new Error('not implemented yet');
  }

  /**
   * Put `request` into the form AND the baseline (two separate deep copies, `structuredClone`):
   * exactly the request as it was sent with "Rendern", NOT merged with `DEFAULT_REQUEST`.
   * If `prompt` is missing or not a string, set it to `''`. Never copies `comment` or
   * `render_seconds` (they are not part of `request`).
   */
  load(request: Record<string, unknown>): void {
    void request;
    throw new Error('not implemented yet');
  }

  /**
   * Reset form AND baseline to a fresh `defaultForm()` (two separate copies). Used when a project
   * is opened without images, when the selected project is deleted, and by `loadConfig()` while
   * no image is selected.
   */
  reset(): void {
    throw new Error('not implemented yet');
  }
}
