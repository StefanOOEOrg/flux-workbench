import { Component, computed, inject } from '@angular/core';

import { projectLabel } from '../format';
import { Job } from '../models';
import { WorkbenchStore } from '../workbench.store';

/**
 * Render queue (bottom of the left column, issue #11 / mockup). Logic unchanged, new look.
 *
 * Template (`queue-panel.html`):
 * - Header row `<div class="head"><h2>Queue</h2><button type="button" data-testid="clear"
 *   class="ghost" [disabled]="!canClear()" (click)="store.clearQueue()">Clear</button></div>`
 *   (#30). `canClear()` is false while nothing is finished, so the button is disabled.
 * - For each job in `visibleJobs()` (track `job.id`): card `<div data-testid="job"
 *   [class]="'job ' + job.status">` with a row `<span>{{ title(job) }}</span><span
 *   class="badge">{{ statusLabel(job) }}</span>`, below `<div class="p">` with the first 60
 *   chars of `job.request['prompt']` (if it is a string), for `error` `<div class="err">
 *   {{ job.error }}</div>`. `queued` jobs get `<button type="button" data-testid="cancel"
 *   class="ghost">Entfernen</button>` -> `store.cancelJob(job.id)`.
 * - No visible jobs: `<p class="hint">Queue empty</p>`.
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
   * `true` if any job is finished (`done`/`error`/`cancelled`), i.e. there is something for the
   * "Clear" button to remove (#30). `queued`/`running` jobs never count.
   */
  readonly canClear = computed<boolean>(() => {
    return this.store.jobs().some((j) => j.status !== 'queued' && j.status !== 'running');
  });

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

  /** queued -> `Queued`, running -> `Running`, done -> `Done (#<image_n>)`, error -> `Error`,
   *  cancelled -> `Removed`. */
  statusLabel(job: Job): string {
    switch (job.status) {
      case 'queued':
        return 'Queued';
      case 'running':
        return 'Running';
      case 'done':
        return `Done (#${job.image_n})`;
      case 'error':
        return 'Error';
      case 'cancelled':
        return 'Removed';
    }
  }

  /**
   * Card title: project name via `projectLabel(job.project_id).name`, prefixed with
   * `#<image_n> · ` when `image_n` is a number. E.g. `'#6 · Green_Car'` or `'Portrait'`.
   */
  title(job: Job): string {
    const name = projectLabel(job.project_id).name;
    return typeof job.image_n === 'number' ? `#${job.image_n} · ${name}` : name;
  }
}
