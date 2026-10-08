import { Component, DestroyRef, OnInit, inject } from '@angular/core';

import { ImagePanel } from './image-panel/image-panel';
import { ParamForm } from './param-form/param-form';
import { ProjectList } from './project-list/project-list';
import { PromptPanel } from './prompt-panel/prompt-panel';
import { QueuePanel } from './queue-panel/queue-panel';
import { ThumbnailStrip } from './thumbnail-strip/thumbnail-strip';
import { projectLabel } from './format';
import { WorkbenchStore } from './workbench.store';

/** Poll interval for the render queue in ms. */
export const POLL_MS = 2000;

/**
 * Shell layout (issue #11, mockup `docs/ui-mockup.html`). The page itself NEVER scrolls; every
 * column scrolls on its own. This is the fix for the hidden render button.
 *
 * Template (`app.html`):
 * - `<header class="topbar">`: `<div class="logo">Flux <span>Workbench</span></div>`,
 *   `<div class="crumb" data-testid="crumb">` = `'/ ' + projectLabel(selected).name` (empty
 *   without project), spacer, `<div class="pill" data-testid="status">` with a dot and
 *   `{{ store.runningCount() }} läuft · {{ store.queuedCount() }} wartet`; dot class `busy`
 *   when `runningCount() > 0`.
 * - If `store.error()` is set: `<div class="error" data-testid="error">` with the text and a
 *   `<button type="button" title="Schließen">×</button>` that sets `store.error` to null
 *   (rendered between header and main, takes its own grid row).
 * - `<main class="app">` grid `250px minmax(0, 1fr)`:
 *   - `<aside class="side">` grid rows `minmax(0, 1fr) auto`: `<app-project-list>` and
 *     `<app-queue-panel class="queue">` (queue `max-height: 40vh; overflow-y: auto;
 *     border-top`).
 *   - `<section class="work">` grid rows `auto minmax(0, 1fr)`: `<app-thumbnail-strip>` (full
 *     width, padding-right 14px so it runs to the window edge) and
 *     `<div class="cols" data-testid="cols">` grid
 *     `minmax(280px, 1fr) minmax(280px, 1fr) minmax(320px, 1.15fr)` with three cards
 *     `<app-image-panel class="card">`, `<app-param-form class="card">`,
 *     `<app-prompt-panel class="card">`.
 *
 * CSS (`app.css`): `:host { display: grid; grid-template-rows: 48px auto minmax(0, 1fr);
 * height: 100vh; overflow: hidden; }`; every grid child that may grow gets `min-height: 0`;
 * place the rows EXPLICITLY: `.topbar { grid-row: 1; }`, `.error { grid-row: 2; }`,
 * `.app { grid-row: 3; }` - the error bar only exists while `store.error()` is set, and without
 * explicit rows `<main>` would slide into the `auto` row 2 and lose the full height.
 * `.card { background: var(--panel); border: 1px solid var(--border); border-radius: 10px;
 * padding: 14px; min-height: 0; overflow: auto; }` (prompt card: `overflow: hidden`).
 * Header, pill, dot, error bar as in the mockup.
 */
@Component({
  selector: 'app-root',
  imports: [ProjectList, QueuePanel, ThumbnailStrip, ImagePanel, ParamForm, PromptPanel],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  protected readonly store = inject(WorkbenchStore);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly label = projectLabel;

  /**
   * Call `store.loadProjects()` and `store.refreshJobs()` once (do not await), then
   * `const id = setInterval(() => store.refreshJobs(), POLL_MS)`;
   * `destroyRef.onDestroy(() => clearInterval(id))`.
   */
  ngOnInit(): void {
    void this.store.loadProjects();
    void this.store.refreshJobs();
    const id = setInterval(() => this.store.refreshJobs(), POLL_MS);
    this.destroyRef.onDestroy(() => clearInterval(id));
  }
}
