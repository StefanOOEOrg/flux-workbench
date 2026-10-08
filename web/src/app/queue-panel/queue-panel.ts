import { Component, computed, inject } from '@angular/core';

import { projectLabel } from '../format';
import { Job } from '../models';
import { WorkbenchStore } from '../workbench.store';

/**
 * Render queue (bottom of the left column, issue #11 / mockup). Logic unchanged, new look.
 *
 * Template (`queue-panel.html`):
 * - `<h2>Queue</h2>`.
 * - For each job in `visibleJobs()` (track `job.id`): card `<div data-testid="job"
 *   [class]="'job ' + job.status">` with a row `<span>{{ title(job) }}</span><span
 *   class="badge">{{ statusLabel(job) }}</span>`, below `<div class="p">` with the first 60
 *   chars of `job.request['prompt']` (if it is a string), for `error` `<div class="err">
 *   {{ job.error }}</div>`. `queued` jobs get `<button type="button" data-testid="cancel"
 *   class="ghost">Entfernen</button>` -> `store.cancelJob(job.id)`.
 * - No visible jobs: `<p class="hint">Queue leer</p>`.
 *
 * CSS (`queue-panel.css`): cards with 3px left border coloured by status (queued muted,
 * running `--warn`, done `--ok`, error `--err`), badge colours like the mockup.
 * `:host { display: block; }` (the height limit of 40 % lives in `app.css`).
 */
@Component({
  selector: 'app-queue-panel',
  templateUrl: './queue-panel.html',
  styleUrl: './queue-panel.css',
})
export class QueuePanel {
  protected readonly store = inject(WorkbenchStore);

  /**
   * Jobs to show, newest first: all `queued`/`running`/`error` jobs plus the last 5 `done`
   * jobs (by submit order); `cancelled` jobs are hidden.
   */
  readonly visibleJobs = computed<Job[]>(() => {
    const jobs = this.store.jobs();
    const shown = jobs
      .filter((j) => j.status === 'queued' || j.status === 'running' || j.status === 'error')
      .reverse();
    const done = jobs
      .filter((j) => j.status === 'done')
      .slice(-5)
      .reverse();
    return [...shown, ...done];
  });

  /** queued -> `Wartet`, running -> `Läuft`, done -> `Fertig (#<image_n>)`, error -> `Fehler`,
   *  cancelled -> `Entfernt`. */
  statusLabel(job: Job): string {
    switch (job.status) {
      case 'queued':
        return 'Wartet';
      case 'running':
        return 'Läuft';
      case 'done':
        return `Fertig (#${job.image_n})`;
      case 'error':
        return 'Fehler';
      case 'cancelled':
        return 'Entfernt';
    }
  }

  /**
   * Card title: project name via `projectLabel(job.project_id).name`, prefixed with
   * `#<image_n> · ` when `image_n` is a number. E.g. `'#6 · Gruenes_Auto'` or `'Portrait'`.
   */
  title(job: Job): string {
    throw new Error('not implemented');
  }
}
