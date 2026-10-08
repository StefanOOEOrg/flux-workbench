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
    throw new Error('not implemented');
  }

  /**
   * Create a project, reload the list, then `selectProject(newId)`.
   * Blank `name` (after trim) -> set `error = 'Projektname fehlt'`, no HTTP call.
   */
  async createProject(name: string): Promise<void> {
    throw new Error('not implemented');
  }

  /**
   * Delete the project (the component asks for confirmation before), reload the list.
   * If it was the selected project: `selectedProject`, `selectedImage`, `settings` -> null,
   * `images` and `diff` -> [], `form` -> fresh copy of `DEFAULT_REQUEST`.
   */
  async deleteProject(id: string): Promise<void> {
    throw new Error('not implemented');
  }

  /**
   * Select project `id`: set `selectedProject`, load `images` (increment `imagesVersion`).
   * - No images: `selectedImage`/`settings` -> null, `diff` -> [],
   *   `form` -> `structuredClone(DEFAULT_REQUEST)`.
   * - Otherwise: `await selectImage(last image)` and then `cloneSelected()`, so the form
   *   continues from the newest render.
   */
  async selectProject(id: string): Promise<void> {
    throw new Error('not implemented');
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
    throw new Error('not implemented');
  }

  /**
   * "Klonen": `form = structuredClone(settings().request) as RenderRequest` - exactly the
   * request of the selected image, NOT merged with `DEFAULT_REQUEST`. If `prompt` is missing
   * or not a string, set it to `''`. No-op if `settings()` is null.
   */
  cloneSelected(): void {
    throw new Error('not implemented');
  }

  /**
   * "Seed übernehmen": if `settings()?.effective?.['seed']` is a number, set `form.seed` to it
   * (new object via `form.update`). Otherwise no-op.
   */
  adoptSeed(): void {
    throw new Error('not implemented');
  }

  /**
   * Submit `form()` for the selected project, then `refreshJobs()`.
   * No selected project -> `error = 'Kein Projekt ausgewählt'`, no HTTP call.
   * Empty prompt (after trim) -> `error = 'Prompt fehlt'`, no HTTP call.
   */
  async submit(): Promise<void> {
    throw new Error('not implemented');
  }

  /** Cancel a queued job, then `refreshJobs()`. */
  async cancelJob(jobId: string): Promise<void> {
    throw new Error('not implemented');
  }

  /**
   * Poll target (called every 2 s by `App`): `jobs.set(await listJobs())`.
   * If a job of the selected project changed to `done` since the previous poll (job id was
   * not `done` in the old `jobs()` list, or was not in it), reload `images` (increment
   * `imagesVersion`) and `await selectImage(job.image_n)` of the newest such job.
   * Errors: set `error` like everywhere else.
   */
  async refreshJobs(): Promise<void> {
    throw new Error('not implemented');
  }

  /** Open image `n` of the selected project in the system viewer (no-op without project). */
  async openImage(n: number): Promise<void> {
    throw new Error('not implemented');
  }

  /** `api.imageUrl(selectedProject, n, imagesVersion())`; `''` without a selected project. */
  imageUrl(n: number): string {
    throw new Error('not implemented');
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
  throw new Error('not implemented');
}
