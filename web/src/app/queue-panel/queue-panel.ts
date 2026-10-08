import { Component, computed, inject } from '@angular/core';

import { Job } from '../models';
import { WorkbenchStore } from '../workbench.store';

/**
 * Render queue overview.
 *
 * Template (`queue-panel.html`):
 * - Heading `Queue ({{ store.pendingJobs().length }} offen)`.
 * - For each job in `visibleJobs()`: `<li data-testid="job">` with CSS class = `job.status`,
 *   text `statusLabel(job)`, the project id, the first 60 chars of `job.request['prompt']`,
 *   and for `error` the `job.error` text.
 *   `queued` jobs get `<button data-testid="cancel">Entfernen</button>` -> `store.cancelJob(job.id)`.
 * - No visible jobs: `<p>Queue leer</p>`.
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
    throw new Error('not implemented');
  });

  /** queued -> `Wartet`, running -> `Läuft`, done -> `Fertig (#<image_n>)`, error -> `Fehler`,
   *  cancelled -> `Entfernt`. */
  statusLabel(job: Job): string {
    throw new Error('not implemented');
  }
}
