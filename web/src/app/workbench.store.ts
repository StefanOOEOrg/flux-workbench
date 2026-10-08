import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { ApiService } from './api.service';
import { DEFAULT_REQUEST, DiffEntry, ImageSettings, Job, RenderRequest } from './models';
import { diffSettings, effectiveOrRequest } from './settings-diff';

/**
 * All UI state as signals plus the actions the components call.
 * Components only read signals and call methods; they never call `ApiService` directly.
 *
 * Error handling for every async method: catch errors, put `errorMessage(err)` into
 * `this.error` and return normally (never rethrow). A successful action sets `error` to `null`.
 */
@Injectable({ providedIn: 'root' })
export class WorkbenchStore {
  private readonly api = inject(ApiService);

  readonly projects = signal<string[]>([]);
  readonly selectedProject = signal<string | null>(null);
  readonly images = signal<number[]>([]);
  readonly selectedImage = signal<number | null>(null);
  /** Settings of the selected image (null if none selected). */
  readonly settings = signal<ImageSettings | null>(null);
  /** Diff selected image vs. its predecessor in `images` ([] for the first image). */
  readonly diff = signal<DiffEntry[]>([]);
  /** Current content of the parameter form. */
  readonly form = signal<RenderRequest>(structuredClone(DEFAULT_REQUEST));
  readonly jobs = signal<Job[]>([]);
  readonly error = signal<string | null>(null);
  /** Incremented after every reload of `images`; used as cache buster for thumbnails. */
  readonly imagesVersion = signal(0);

  /** Jobs that are `queued` or `running`. */
  readonly pendingJobs = computed(() =>
    this.jobs().filter((j) => j.status === 'queued' || j.status === 'running'),
  );

  /** `projects.set(await listProjects())`. */
  async loadProjects(): Promise<void> {
    try {
      this.projects.set(await firstValueFrom(this.api.listProjects()));
      this.error.set(null);
    } catch (err) {
      this.error.set(errorMessage(err));
    }
  }

  /**
   * Create a project, reload the list, then `selectProject(newId)`.
   * Blank `name` (after trim) -> set `error = 'Projektname fehlt'`, no HTTP call.
   */
  async createProject(name: string): Promise<void> {
    if (name.trim() === '') {
      this.error.set('Projektname fehlt');
      return;
    }
    try {
      const { id } = await firstValueFrom(this.api.createProject(name));
      await this.loadProjects();
      await this.selectProject(id);
      this.error.set(null);
    } catch (err) {
      this.error.set(errorMessage(err));
    }
  }

  /**
   * Delete the project (the component asks for confirmation before), reload the list.
   * If it was the selected project: `selectedProject`, `selectedImage`, `settings` -> null,
   * `images` and `diff` -> [], `form` -> fresh copy of `DEFAULT_REQUEST`.
   */
  async deleteProject(id: string): Promise<void> {
    try {
      await firstValueFrom(this.api.deleteProject(id));
      const wasSelected = this.selectedProject() === id;
      await this.loadProjects();
      if (wasSelected) {
        this.selectedProject.set(null);
        this.selectedImage.set(null);
        this.settings.set(null);
        this.images.set([]);
        this.diff.set([]);
        this.form.set(structuredClone(DEFAULT_REQUEST));
      }
      this.error.set(null);
    } catch (err) {
      this.error.set(errorMessage(err));
    }
  }

  /**
   * Select project `id`: set `selectedProject`, load `images` (increment `imagesVersion`).
   * - No images: `selectedImage`/`settings` -> null, `diff` -> [],
   *   `form` -> `structuredClone(DEFAULT_REQUEST)`.
   * - Otherwise: `await selectImage(last image)` and then `cloneSelected()`, so the form
   *   continues from the newest render.
   */
  async selectProject(id: string): Promise<void> {
    try {
      this.selectedProject.set(id);
      const list = await firstValueFrom(this.api.listImages(id));
      this.images.set(list);
      this.imagesVersion.update((v) => v + 1);
      if (list.length === 0) {
        this.selectedImage.set(null);
        this.settings.set(null);
        this.diff.set([]);
        this.form.set(structuredClone(DEFAULT_REQUEST));
        this.error.set(null);
        return;
      }
      await this.selectImage(list[list.length - 1]);
      this.cloneSelected();
    } catch (err) {
      this.error.set(errorMessage(err));
    }
  }

  /**
   * Select image `n` of the selected project (no-op without a selected project).
   * Load its settings into `settings`. Predecessor = the element before `n` in `images()`
   * (not necessarily `n - 1`). If there is one, load its settings too and set
   * `diff = diffSettings(effectiveOrRequest(prev), effectiveOrRequest(current))`, else `diff = []`.
   * If the predecessor's settings cannot be loaded (e.g. 404), use `diff = []` without error.
   * Does NOT change `form`.
   */
  async selectImage(n: number): Promise<void> {
    const project = this.selectedProject();
    if (project === null) {
      return;
    }
    try {
      const settings = await firstValueFrom(this.api.getSettings(project, n));
      this.settings.set(settings);
      this.selectedImage.set(n);
      this.error.set(null);
      const images = this.images();
      const idx = images.indexOf(n);
      const prev = idx > 0 ? images[idx - 1] : null;
      if (prev === null) {
        this.diff.set([]);
        return;
      }
      try {
        const prevSettings = await firstValueFrom(this.api.getSettings(project, prev));
        this.diff.set(diffSettings(effectiveOrRequest(prevSettings), effectiveOrRequest(settings)));
      } catch {
        this.diff.set([]);
      }
    } catch (err) {
      this.error.set(errorMessage(err));
    }
  }

  /**
   * "Klonen": `form = structuredClone(settings().request) as RenderRequest` - exactly the
   * request of the selected image, NOT merged with `DEFAULT_REQUEST`. If `prompt` is missing
   * or not a string, set it to `''`. No-op if `settings()` is null.
   */
  cloneSelected(): void {
    const settings = this.settings();
    if (settings === null) {
      return;
    }
    const request = structuredClone(settings.request) as unknown as RenderRequest;
    if (typeof request.prompt !== 'string') {
      request.prompt = '';
    }
    this.form.set(request);
  }

  /**
   * "Seed übernehmen": if `settings()?.effective?.['seed']` is a number, set `form.seed` to it
   * (new object via `form.update`). Otherwise no-op.
   */
  adoptSeed(): void {
    const seed = this.settings()?.effective?.['seed'];
    if (typeof seed !== 'number') {
      return;
    }
    this.form.update((f) => ({ ...f, seed }));
  }

  /**
   * Submit `form()` for the selected project, then `refreshJobs()`.
   * No selected project -> `error = 'Kein Projekt ausgewählt'`, no HTTP call.
   * Empty prompt (after trim) -> `error = 'Prompt fehlt'`, no HTTP call.
   */
  async submit(): Promise<void> {
    const project = this.selectedProject();
    if (project === null) {
      this.error.set('Kein Projekt ausgewählt');
      return;
    }
    if (this.form().prompt.trim() === '') {
      this.error.set('Prompt fehlt');
      return;
    }
    try {
      await firstValueFrom(this.api.submitJob(project, this.form()));
      this.error.set(null);
      await this.refreshJobs();
    } catch (err) {
      this.error.set(errorMessage(err));
    }
  }

  /** Cancel a queued job, then `refreshJobs()`. */
  async cancelJob(jobId: string): Promise<void> {
    try {
      await firstValueFrom(this.api.cancelJob(jobId));
      this.error.set(null);
      await this.refreshJobs();
    } catch (err) {
      this.error.set(errorMessage(err));
    }
  }

  /**
   * Poll target (called every 2 s by `App`): `jobs.set(await listJobs())`.
   * If a job of the selected project changed to `done` since the previous poll (job id was
   * not `done` in the old `jobs()` list, or was not in it), reload `images` (increment
   * `imagesVersion`) and `await selectImage(job.image_n)` of the newest such job.
   * Errors: set `error` like everywhere else.
   */
  async refreshJobs(): Promise<void> {
    const project = this.selectedProject();
    try {
      const jobs = await firstValueFrom(this.api.listJobs());
      const oldJobs = this.jobs();
      this.jobs.set(jobs);
      this.error.set(null);
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
      this.images.set(list);
      this.imagesVersion.update((v) => v + 1);
      for (let i = newlyDone.length - 1; i >= 0; i--) {
        const job = newlyDone[i];
        if (job.image_n !== null) {
          await this.selectImage(job.image_n);
          break;
        }
      }
    } catch (err) {
      this.error.set(errorMessage(err));
    }
  }

  /** Open image `n` of the selected project in the system viewer (no-op without project). */
  async openImage(n: number): Promise<void> {
    const project = this.selectedProject();
    if (project === null) {
      return;
    }
    try {
      await firstValueFrom(this.api.openImage(project, n));
      this.error.set(null);
    } catch (err) {
      this.error.set(errorMessage(err));
    }
  }

  /** `api.imageUrl(selectedProject, n, imagesVersion())`; `''` without a selected project. */
  imageUrl(n: number): string {
    const project = this.selectedProject();
    if (project === null) {
      return '';
    }
    return this.api.imageUrl(project, n, this.imagesVersion());
  }
}

/**
 * Human-readable message for any error.
 * - `HttpErrorResponse` with `error.detail` string (FastAPI) -> that string.
 * - `HttpErrorResponse` with `status === 0` -> `'Server nicht erreichbar'`.
 * - other `HttpErrorResponse` -> `` `HTTP ${status}: ${statusText}` ``.
 * - `Error` -> `message`; anything else -> `String(err)`.
 */
export function errorMessage(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    const detail = (err.error as { detail?: unknown } | null | undefined)?.detail;
    if (typeof detail === 'string') {
      return detail;
    }
    if (err.status === 0) {
      return 'Server nicht erreichbar';
    }
    return `HTTP ${err.status}: ${err.statusText}`;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}
