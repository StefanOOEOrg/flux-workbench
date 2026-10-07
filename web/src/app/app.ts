import { Component, DestroyRef, OnInit, inject } from '@angular/core';

import { ParamForm } from './param-form/param-form';
import { ProjectList } from './project-list/project-list';
import { QueuePanel } from './queue-panel/queue-panel';
import { SettingsPanel } from './settings-panel/settings-panel';
import { ThumbnailStrip } from './thumbnail-strip/thumbnail-strip';
import { WorkbenchStore } from './workbench.store';

/** Poll interval for the render queue in ms. */
export const POLL_MS = 2000;

/**
 * Shell layout (`app.html` / `app.css`), CSS grid:
 * - left column (~260px): `<app-project-list>` on top, `<app-queue-panel>` below;
 * - right column: `<app-thumbnail-strip>` on top (full width), below it two columns
 *   `<app-settings-panel>` | `<app-param-form>`.
 * - Above everything, if `store.error()` is set: `<div class="error" data-testid="error">`
 *   with the text and a "×" `<button>` that sets `store.error` to null.
 */
@Component({
  selector: 'app-root',
  imports: [ProjectList, QueuePanel, ThumbnailStrip, SettingsPanel, ParamForm],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  protected readonly store = inject(WorkbenchStore);
  private readonly destroyRef = inject(DestroyRef);

  /**
   * Call `store.loadProjects()` and `store.refreshJobs()` once (do not await), then
   * `const id = setInterval(() => store.refreshJobs(), POLL_MS)`;
   * `destroyRef.onDestroy(() => clearInterval(id))`.
   */
  ngOnInit(): void {
    throw new Error('not implemented');
  }
}
