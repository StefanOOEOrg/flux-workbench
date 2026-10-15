import { Component, inject } from '@angular/core';

import { WorkbenchStore } from '../workbench.store';

/**
 * Column "Prompt" (issue #11, right-most card): prompt over the full height, below it the
 * smaller negative prompt, at the very bottom the always-visible render button.
 *
 * Template (`prompt-panel.html`) - required markup:
 * - `<h2>Prompt` + `<span data-testid="prompt-modified" class="modified">· modified</span>`
 *   rendered ONLY when `store.promptModified()`.
 * - `<textarea data-testid="f-prompt" class="prompt">` `[value]="store.form().prompt"`,
 *   `(input)` -> `setPrompt($any($event.target).value)`.
 * - `<h2>Negative Prompt</h2>` and `<textarea data-testid="f-negative" class="negative"
 *   placeholder="empty = off (otherwise real CFG, ~1.5× time)">` `[value]="store.form().negative ?? ''"`,
 *   `(input)` -> `setNegative(...)`.
 * - `<button type="button" data-testid="submit" class="primary">▶ Render · image
 *   {{ store.nextImageNumber() }}</button>` -> `store.submit()`; disabled when
 *   `store.selectedProject()` is null.
 * - NO `<form>` element; every `<button>` has `type="button"`.
 *
 * CSS (`prompt-panel.css`) - this is the fix for the "Rendern not visible" bug:
 * `:host { display: grid; grid-template-rows: auto minmax(0, 1fr) auto 90px auto; gap: 10px;
 * height: 100%; min-height: 0; overflow: hidden; }`; both textareas `width: 100%; height: 100%;
 * resize: none`; prompt font-size 14px, line-height 1.5; button full width, padding 11px.
 */
@Component({
  selector: 'app-prompt-panel',
  templateUrl: './prompt-panel.html',
  styleUrl: './prompt-panel.css',
})
export class PromptPanel {
  protected readonly store = inject(WorkbenchStore);

  /** `store.form.update(f => ({ ...f, prompt: value }))` (value as-is, no trimming). */
  setPrompt(value: string): void {
    this.store.form.update((f) => ({ ...f, prompt: value }));
  }

  /** `store.form.update(f => ({ ...f, negative: value }))`; `''` is kept (= negative off). */
  setNegative(value: string): void {
    this.store.form.update((f) => ({ ...f, negative: value }));
  }
}
