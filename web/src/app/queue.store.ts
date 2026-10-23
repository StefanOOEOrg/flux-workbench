import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ApiService } from './api.service';
import { ErrorState } from './error-state';
import { FormStore } from './form.store';
import { ImagesStore } from './images.store';
import { Job } from './models';
import { ProjectsStore } from './projects.store';

/**
 * Render queue: the job list, the derived counters and the four queue actions (#47).
 *
 * Depends on `ProjectsStore` (which project), `ImagesStore` (reload + show a finished image),
 * `FormStore` (submit reads the form, sets the baseline) and `ErrorState` (the HTTP funnel).
 * Nothing depends on the queue, so the direction stays acyclic.
 *
 * `WorkbenchStore` injects this store and exposes the signals as ALIASES
 * (`readonly jobs = this.queue_store.jobs;`), so components keep using `store.jobs()`.
 */
@Injectable({ providedIn: 'root' })
export class QueueStore {
  private readonly api = inject(ApiService);
  private readonly projects = inject(ProjectsStore);
  private readonly images = inject(ImagesStore);
  private readonly forms = inject(FormStore);
  private readonly errors = inject(ErrorState);

  readonly jobs = signal<Job[]>([]);

  /** Jobs that are `queued` or `running`. */
  readonly pendingJobs = computed(() =>
    this.jobs().filter((j) => j.status === 'queued' || j.status === 'running'),
  );

  /** Number of `running` jobs (all projects) - for the status badge in the header. */
  readonly runningCount = computed<number>(() => {
    return this.jobs().filter((j) => j.status === 'running').length;
  });

  /** Number of `queued` jobs (all projects) - for the status badge in the header. */
  readonly queuedCount = computed<number>(() => {
    return this.jobs().filter((j) => j.status === 'queued').length;
  });

  /**
   * Pending jobs (`queued` or `running`) of the selected project, oldest first.
   * `[]` without a selected project. Used for the placeholder tiles in the thumbnail strip.
   */
  readonly projectPendingJobs = computed<Job[]>(() => {
    const project = this.projects.selectedProject();
    if (project === null) {
      return [];
    }
    return this.jobs().filter(
      (j) => j.project_id === project && (j.status === 'queued' || j.status === 'running'),
    );
  });

  /**
   * Number the next render of the selected project will get, for the button
   * "Render · image N": `max(images()) + 1 + projectPendingJobs().length`; with no images
   * `1 + projectPendingJobs().length`. (Each pending job will take one number before it.)
   */
  readonly nextImageNumber = computed<number>(() => {
    const images = this.images.images();
    const base = images.length === 0 ? 1 : Math.max(...images) + 1;
    return base + this.projectPendingJobs().length;
  });

  /**
   * Submit `form()` for the selected project, then `refreshJobs()`.
   * No selected project -> `error = 'No project selected'`, no HTTP call.
   * Empty prompt (after trim) -> `error = 'Prompt fehlt'`, no HTTP call.
   * After a SUCCESSFUL `submitJob` (before `refreshJobs`) set
   * `formBaseline = structuredClone(form())` - the form now counts as rendered. Not on errors.
   *
   * Implementation (#47): the body runs through `ErrorState.attempt()`; project, form and
   * baseline come from the injected stores.
   */
  async submit(): Promise<void> {
    const project = this.projects.selectedProject();
    if (project === null) {
      this.errors.error.set('No project selected');
      return;
    }
    if (this.forms.form().prompt.trim() === '') {
      this.errors.error.set('Prompt fehlt');
      return;
    }
    await this.errors.attempt(async () => {
      await firstValueFrom(this.api.submitJob(project, this.forms.form()));
      this.errors.error.set(null);
      this.forms.formBaseline.set(structuredClone(this.forms.form()));
      await this.refreshJobs();
    });
  }

  /** Cancel a queued job, then `refreshJobs()`. */
  async cancelJob(jobId: string): Promise<void> {
    await this.errors.attempt(async () => {
      await firstValueFrom(this.api.cancelJob(jobId));
      this.errors.error.set(null);
      await this.refreshJobs();
    });
  }

  /**
   * Clear the render queue history (#30): remove the `done`/`error`/`cancelled` jobs.
   *
   * - `await firstValueFrom(api.clearQueue())`; on error `error = errorMessage(err)` and return
   *   (the job list stays unchanged).
   * - On success `error.set(null)` FIRST - `refreshJobs()` deliberately does not reset the error
   *   (it runs every 2 s), so this is the only place that clears an old message here - then
   *   `await refreshJobs()`.
   * - Selection, settings, form and the project list are not touched.
   */
  async clearQueue(): Promise<void> {
    await this.errors.attempt(async () => {
      await firstValueFrom(this.api.clearQueue());
      this.errors.error.set(null);
      await this.refreshJobs();
    });
  }

  /**
   * Poll target (called every 2 s by `App`): `jobs.set(await listJobs())`.
   * If a job of the selected project changed to `done` since the previous poll (job id was
   * not `done` in the old `jobs()` list, or was not in it), reload `images` (increment
   * `imagesVersion`) and show the image of the newest such job.
   * This automatic selection must NEVER ask (`confirmFn`) and must NOT overwrite unrendered
   * changes: instead of `selectImage(job.image_n)` call `showImage(job.image_n)`, and only if
   * that returned `true` AND `!formDirty()` also `loadForm(settings()!.request)`. With a dirty
   * form, form and baseline stay untouched.
   * Errors: set `error` like everywhere else. EXCEPTION to the class rule: a successful poll must
   * NOT reset `error` to null (it runs every 2 s and would hide every message within 2 s).
   *
   * Implementation (#47): the whole body runs inside one `ErrorState.attempt()` call; nothing in
   * here calls `error.set(null)`. `showImage` comes from `ImagesStore`, `form`/`formBaseline`/
   * `formDirty` from `FormStore`.
   */
  async refreshJobs(): Promise<void> {
    await this.errors.attempt(async () => {
      const project = this.projects.selectedProject();
      const jobs = await firstValueFrom(this.api.listJobs());
      const oldJobs = this.jobs();
      this.jobs.set(jobs);
      if (project === null) {
        return;
      }
      const newlyDone = jobs.filter((j) => {
        if (j.project_id !== project || j.status !== 'done') {
          return false;
        }
        const old = oldJobs.find((o) => o.id === j.id);
        return old === undefined || old.status !== 'done';
      });
      if (newlyDone.length === 0) {
        return;
      }
      const list = await firstValueFrom(this.api.listImages(project));
      this.images.images.set(list);
      this.images.imagesVersion.update((v) => v + 1);
      for (let i = newlyDone.length - 1; i >= 0; i--) {
        const job = newlyDone[i];
        if (job.image_n !== null) {
          if ((await this.images.showImage(job.image_n)) && !this.forms.dirty()) {
            this.forms.load(this.images.settings()!.request);
          }
          break;
        }
      }
    });
  }
}
