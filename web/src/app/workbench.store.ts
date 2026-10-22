import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { ApiService } from './api.service';
import {
  DEFAULT_REQUEST,
  DiffEntry,
  ImageSettings,
  Job,
  LoraEntry,
  ProjectInfo,
  RenderRequest,
} from './models';
import { diffSettings, effectiveOrRequest } from './settings-diff';
import { WordSegment, diffWords } from './word-diff';

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

  readonly projects = signal<ProjectInfo[]>([]);
  /** Text of the project filter field (case-insensitive substring match on the id). */
  readonly projectFilter = signal('');
  readonly selectedProject = signal<string | null>(null);
  readonly images = signal<number[]>([]);
  readonly selectedImage = signal<number | null>(null);
  /** Settings of the selected image (null if none selected). */
  readonly settings = signal<ImageSettings | null>(null);
  /** Diff selected image vs. its predecessor in `images` ([] for the first image).
   *  Since #19 WITHOUT the paths `prompt` and `negative` (they get their own word diff). */
  readonly diff = signal<DiffEntry[]>([]);
  /** Settings of the predecessor of the selected image (null: first image or not loadable). */
  readonly previousSettings = signal<ImageSettings | null>(null);
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
  /** Injected for tests; asks before unrendered form changes are discarded. */
  confirmFn: (message: string) => boolean = (m) => window.confirm(m);
  readonly jobs = signal<Job[]>([]);
  readonly error = signal<string | null>(null);
  /** Incremented after every reload of `images`; used as cache buster for thumbnails. */
  readonly imagesVersion = signal(0);

  /** Jobs that are `queued` or `running`. */
  readonly pendingJobs = computed(() =>
    this.jobs().filter((j) => j.status === 'queued' || j.status === 'running'),
  );

  /**
   * `projects()` filtered by `projectFilter()`: keep entries whose `id` contains the trimmed
   * filter text, case-insensitive (`toLowerCase`). Empty/blank filter -> all projects.
   * Order unchanged (newest first).
   */
  readonly filteredProjects = computed<ProjectInfo[]>(() => {
    const needle = this.projectFilter().trim().toLowerCase();
    if (needle === '') {
      return this.projects();
    }
    return this.projects().filter((p) => p.id.toLowerCase().includes(needle));
  });

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
    const project = this.selectedProject();
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
    const images = this.images();
    const base = images.length === 0 ? 1 : Math.max(...images) + 1;
    return base + this.projectPendingJobs().length;
  });

  /**
   * `true` if an image is selected (`settings()` not null) AND `form().prompt` differs from
   * `settings().request['prompt']` (a missing/non-string request prompt counts as `''`).
   * `false` without settings.
   */
  readonly promptModified = computed<boolean>(() => {
    const settings = this.settings();
    if (settings === null) {
      return false;
    }
    const prompt = settings.request['prompt'];
    const baseline = typeof prompt === 'string' ? prompt : '';
    return this.form().prompt !== baseline;
  });

  /**
   * `true` if the form has unrendered changes:
   * `diffSettings(formBaseline() as Record, form() as Record).length > 0` (reuse the existing
   * settings diff; cast via `as unknown as Record<string, unknown>`).
   */
  readonly formDirty = computed<boolean>(() => {
    return (
      diffSettings(
        this.formBaseline() as unknown as Record<string, unknown>,
        this.form() as unknown as Record<string, unknown>,
      ).length > 0
    );
  });

  /**
   * `request[key]` of `s` as a string: a missing / non-string value counts as `''`.
   * `null` when `s` is null (caller passes `null` as "no predecessor").
   */
  private requestText(s: ImageSettings | null, key: string): string | null {
    if (s === null) {
      return null;
    }
    const v = s.request[key];
    return typeof v === 'string' ? v : '';
  }

  /**
   * Word diff of the prompt for the "Image" column:
   * `diffWords(prev, current)` with `current` = `settings().request['prompt']` and
   * `prev` = `previousSettings().request['prompt']`; a missing / non-string value counts as `''`.
   * `prev` is `null` (-> all words `same`) when `previousSettings()` is null.
   * `[]` without `settings()`.
   */
  readonly promptDiff = computed<WordSegment[]>(() => {
    const settings = this.settings();
    if (settings === null) {
      return [];
    }
    const prev = this.requestText(this.previousSettings(), 'prompt');
    return diffWords(prev, this.requestText(settings, 'prompt') ?? '');
  });

  /** Same as `promptDiff`, for `request['negative']`. */
  readonly negativeDiff = computed<WordSegment[]>(() => {
    const settings = this.settings();
    if (settings === null) {
      return [];
    }
    const prev = this.requestText(this.previousSettings(), 'negative');
    return diffWords(prev, this.requestText(settings, 'negative') ?? '');
  });

  /**
   * `true` if no unrendered changes are lost: `!formDirty()`, otherwise the answer of
   * `confirmFn('Discard unrendered changes?')` (exactly this text).
   */
  private confirmDiscard(): boolean {
    if (!this.formDirty()) {
      return true;
    }
    return this.confirmFn('Discard unrendered changes?') ?? true;
  }

  /**
   * Put `request` into the form AND the baseline (two separate deep copies, `structuredClone`):
   * exactly the request as it was sent with "Rendern", NOT merged with `DEFAULT_REQUEST`.
   * If `prompt` is missing or not a string, set it to `''`. Never copies `comment` or
   * `render_seconds` (they are not part of `request`).
   */
  private loadForm(request: Record<string, unknown>): void {
    const form = structuredClone(request) as unknown as RenderRequest;
    if (typeof form.prompt !== 'string') {
      form.prompt = '';
    }
    this.form.set(form);
    this.formBaseline.set(structuredClone(form));
  }

  /**
   * Default form state: a deep copy of `DEFAULT_REQUEST` plus one entry per configured LoRA
   * (#34) - `form[lora.key] = lora.default` for every entry of `loras()`, so a fresh form has the
   * configured strengths. Never mutates `DEFAULT_REQUEST`.
   */
  defaultForm(): RenderRequest {
    const form = structuredClone(DEFAULT_REQUEST);
    for (const lora of this.loras()) {
      form[lora.key] = lora.default;
    }
    return form;
  }

  /**
   * Load the LoRA slots once at startup (#34); `App` calls this before `loadProjects()`.
   *
   * - `const config = await firstValueFrom(api.getConfig())`. On error `error = errorMessage(err)`,
   *   leave `loras()` empty and return.
   * - `loras.set(config.loras)`; `warning`: if it is a string, `error.set(warning)`, otherwise
   *   `error.set(null)`.
   * - Then, only if NO image is selected (`selectedImage() === null`), put a fresh
   *   `defaultForm()` into `form` AND `formBaseline`. A form that belongs to an image must not be
   *   touched.
   */
  async loadConfig(): Promise<void> {
    let config;
    try {
      config = await firstValueFrom(this.api.getConfig());
    } catch (err) {
      this.error.set(errorMessage(err));
      return;
    }
    this.loras.set(config.loras);
    this.error.set(typeof config.warning === 'string' ? config.warning : null);
    if (this.selectedImage() === null) {
      this.form.set(this.defaultForm());
      this.formBaseline.set(this.defaultForm());
    }
  }

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
   * Create a project, reload the list, then select it.
   * Blank `name` (after trim) -> set `error = 'Projektname fehlt'`, no HTTP call.
   * Asks BEFORE the HTTP call: if `!confirmDiscard()` return (no project is created).
   * After creating, open it with `loadProject(id)` (not `selectProject`, so the
   * question does not come twice).
   */
  async createProject(name: string): Promise<void> {
    if (name.trim() === '') {
      this.error.set('Projektname fehlt');
      return;
    }
    if (!this.confirmDiscard()) {
      return;
    }
    try {
      const { id } = await firstValueFrom(this.api.createProject(name));
      await this.loadProjects();
      await this.loadProject(id);
      this.error.set(null);
    } catch (err) {
      this.error.set(errorMessage(err));
    }
  }

  /**
   * Delete the project (the component asks for confirmation before), reload the list.
   * If it was the selected project: `selectedProject`, `selectedImage`, `settings` -> null,
   * `images` and `diff` -> [], `form` -> fresh copy of `DEFAULT_REQUEST`, `previousSettings` ->
   * null and `formBaseline` -> fresh copy of `DEFAULT_REQUEST` (no discard question - deleting
   * was already confirmed).
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
        this.form.set(this.defaultForm());
        this.previousSettings.set(null);
        this.formBaseline.set(this.defaultForm());
      }
      this.error.set(null);
    } catch (err) {
      this.error.set(errorMessage(err));
    }
  }

  /**
   * Delete image `n` of the selected project (#25). NO confirmation - Stefan decided
   * against a dialog; the right-click + menu entry is the only gate.
   *
   * - No selected project: return, no HTTP call.
   * - 1. `await firstValueFrom(api.deleteImage(project, n))`. On error: `error =
   *      errorMessage(err)`, nothing else changes, return.
   * - 2. `await loadProjects()` (refreshes `image_count` of the project list).
   * - 3. Reload `images` (`listImages`), `images.set(list)`, `imagesVersion.update(v => v + 1)`.
   *      On error: `error` set, return.
   * - 4. Selection, compared with `selectedImage()` as it was BEFORE the delete:
   *      - nothing selected: done (`settings`, `previousSettings`, `diff`, `form` and
   *        `formBaseline` stay untouched).
   *      - the deleted image was NOT the selected one: keep `selectedImage`, `settings` and
   *        the form (`form`/`formBaseline`) untouched, but refresh the predecessor view with
   *        `await showImage(selected)`, so `diff`/`previousSettings` refer to the NEW
   *        predecessor (a deleted predecessor must not leave a stale diff). The form is NOT
   *        reloaded - unrendered changes stay. If the selected image is no longer in `list`,
   *        clear the selection like in the last bullet.
   *      - the deleted image WAS the selected one: successor = the first number in `list`
   *        greater than `n`, otherwise the last number in `list` lower than `n`.
   *        * successor found: `if (await showImage(successor)) loadForm(settings()!.request)`
   *          - deliberately WITHOUT `confirmDiscard()` (the delete was the user's consent).
   *        * no successor (no image left): `selectedImage`, `settings` and `previousSettings`
   *          -> null, `diff` -> []; `form` and `formBaseline` stay untouched (the user may
   *          want to render the same settings again).
   * - 5. On success `error` is null (step 2 already resets it).
   */
  async deleteImage(n: number): Promise<void> {
    const project = this.selectedProject();
    if (project === null) {
      return;
    }
    try {
      await firstValueFrom(this.api.deleteImage(project, n));
    } catch (err) {
      this.error.set(errorMessage(err));
      return;
    }
    await this.loadProjects();
    let list: number[];
    try {
      list = await firstValueFrom(this.api.listImages(project));
    } catch (err) {
      this.error.set(errorMessage(err));
      return;
    }
    this.images.set(list);
    this.imagesVersion.update((v) => v + 1);

    const selected = this.selectedImage();
    if (selected === null) {
      return;
    }
    if (selected === n) {
      // Successor: the next higher number, otherwise the highest lower one.
      const successor = list.find((x) => x > n) ?? list.filter((x) => x < n).pop() ?? null;
      if (successor !== null) {
        if (await this.showImage(successor)) {
          this.loadForm(this.settings()!.request);
        }
        return;
      }
    } else if (list.includes(selected)) {
      // Selected image survived: refresh only the predecessor view, keep the form.
      await this.showImage(selected);
      return;
    }
    // No image left to show: clear the image column, form and baseline stay untouched.
    this.selectedImage.set(null);
    this.settings.set(null);
    this.previousSettings.set(null);
    this.diff.set([]);
  }

  /**
   * User selects project `id` (click in the project list). If `!confirmDiscard()`: return
   * without any change. Otherwise `await loadProject(id)`.
   */
  async selectProject(id: string): Promise<void> {
    if (!this.confirmDiscard()) {
      return;
    }
    await this.loadProject(id);
  }

  /**
   * Load project `id` WITHOUT asking: set `selectedProject`, load `images` (increment
   * `imagesVersion`).
   * - No images: `selectedImage`/`settings`/`previousSettings` -> null, `diff` -> [],
   *   `loadForm(DEFAULT_REQUEST)` (form and baseline = defaults), `error` -> null.
   * - Otherwise: `if (await showImage(last image)) loadForm(settings()!.request)`, so the form
   *   continues from the newest render.
   * Errors like everywhere else.
   */
  private async loadProject(id: string): Promise<void> {
    try {
      this.selectedProject.set(id);
      const list = await firstValueFrom(this.api.listImages(id));
      this.images.set(list);
      this.imagesVersion.update((v) => v + 1);
      if (list.length === 0) {
        this.selectedImage.set(null);
        this.settings.set(null);
        this.previousSettings.set(null);
        this.diff.set([]);
        this.loadForm(this.defaultForm());
        this.error.set(null);
        return;
      }
      if (await this.showImage(list[list.length - 1])) {
        this.loadForm(this.settings()!.request);
      }
    } catch (err) {
      this.error.set(errorMessage(err));
    }
  }

  /**
   * User clicks thumbnail `n`: restore the state of the moment "Rendern" was clicked for it.
   * No-op without a selected project. If `!confirmDiscard()`: return without any change
   * (selection, settings and form stay). Otherwise
   * `if (await showImage(n)) loadForm(settings()!.request)`.
   * Clicking the already selected image also reloads the form (after the same question).
   */
  async selectImage(n: number): Promise<void> {
    if (this.selectedProject() === null) {
      return;
    }
    if (!this.confirmDiscard()) {
      return;
    }
    if (await this.showImage(n)) {
      this.loadForm(this.settings()!.request);
    }
  }

  /**
   * Show image `n` in the "Image" column WITHOUT touching `form` / `formBaseline`.
   * Returns `true` on success, `false` on error or without a selected project.
   * Load its settings into `settings`, set `selectedImage = n`, `error = null`.
   * Predecessor = the element before `n` in `images()` (not necessarily `n - 1`):
   * - none: `previousSettings = null`, `diff = []`;
   * - load OK: `previousSettings = prev`, `diff = diffSettings(effectiveOrRequest(prev),
   *   effectiveOrRequest(current))` WITHOUT the entries with path `prompt` or `negative`;
   * - load fails (e.g. 404): `previousSettings = null`, `diff = []`, no error, still `true`.
   * If the settings of `n` cannot be loaded: `error` set, return `false`, nothing else changes.
   */
  private async showImage(n: number): Promise<boolean> {
    const project = this.selectedProject();
    if (project === null) {
      return false;
    }
    let settings: ImageSettings;
    try {
      settings = await firstValueFrom(this.api.getSettings(project, n));
    } catch (err) {
      this.error.set(errorMessage(err));
      return false;
    }
    this.settings.set(settings);
    this.selectedImage.set(n);
    this.error.set(null);
    const images = this.images();
    const idx = images.indexOf(n);
    const prev = idx > 0 ? images[idx - 1] : null;
    if (prev === null) {
      this.previousSettings.set(null);
      this.diff.set([]);
      return true;
    }
    try {
      const prevSettings = await firstValueFrom(this.api.getSettings(project, prev));
      this.previousSettings.set(prevSettings);
      this.diff.set(
        diffSettings(effectiveOrRequest(prevSettings), effectiveOrRequest(settings)).filter(
          (e) => e.path !== 'prompt' && e.path !== 'negative',
        ),
      );
    } catch {
      this.previousSettings.set(null);
      this.diff.set([]);
    }
    return true;
  }

  /**
   * "Use seed": if `settings()?.effective?.['seed']` is a number, set `form.seed` to it
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
   * No selected project -> `error = 'No project selected'`, no HTTP call.
   * Empty prompt (after trim) -> `error = 'Prompt fehlt'`, no HTTP call.
   * After a SUCCESSFUL `submitJob` (before `refreshJobs`) set
   * `formBaseline = structuredClone(form())` - the form now counts as rendered. Not on errors.
   */
  async submit(): Promise<void> {
    const project = this.selectedProject();
    if (project === null) {
      this.error.set('No project selected');
      return;
    }
    if (this.form().prompt.trim() === '') {
      this.error.set('Prompt fehlt');
      return;
    }
    try {
      await firstValueFrom(this.api.submitJob(project, this.form()));
      this.error.set(null);
      this.formBaseline.set(structuredClone(this.form()));
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
    try {
      await firstValueFrom(this.api.clearQueue());
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
   * `imagesVersion`) and show the image of the newest such job.
   * This automatic selection must NEVER ask (`confirmFn`) and must NOT overwrite unrendered
   * changes: instead of `selectImage(job.image_n)` call `showImage(job.image_n)`, and only if
   * that returned `true` AND `!formDirty()` also `loadForm(settings()!.request)`. With a dirty
   * form, form and baseline stay untouched.
   * Errors: set `error` like everywhere else. EXCEPTION to the class rule: a successful poll must
   * NOT reset `error` to null (it runs every 2 s and would hide every message within 2 s).
   */
  async refreshJobs(): Promise<void> {
    const project = this.selectedProject();
    try {
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
      this.images.set(list);
      this.imagesVersion.update((v) => v + 1);
      for (let i = newlyDone.length - 1; i >= 0; i--) {
        const job = newlyDone[i];
        if (job.image_n !== null) {
          if ((await this.showImage(job.image_n)) && !this.formDirty()) {
            this.loadForm(this.settings()!.request);
          }
          break;
        }
      }
    } catch (err) {
      this.error.set(errorMessage(err));
    }
  }

  /**
   * Save `comment` for the selected image: `api.saveComment(project, n, comment)`, then set
   * `settings` to a NEW object with `comment` replaced (`settings.update(s => ({...s, comment}))`).
   * No-op (no HTTP call) without selected project/image or if `comment === settings().comment`.
   * Errors like everywhere else (`error` set, `settings` unchanged).
   */
  async saveComment(comment: string): Promise<void> {
    const project = this.selectedProject();
    const image = this.selectedImage();
    const settings = this.settings();
    if (project === null || image === null || settings === null) {
      return;
    }
    if (comment === settings.comment) {
      return;
    }
    try {
      await firstValueFrom(this.api.saveComment(project, image, comment));
      this.settings.update((s) => (s === null ? s : { ...s, comment }));
      this.error.set(null);
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
 * - `HttpErrorResponse` with `status === 0` -> `'Server not reachable'`.
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
      return 'Server not reachable';
    }
    return `HTTP ${err.status}: ${err.statusText}`;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}
