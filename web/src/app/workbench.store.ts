import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ApiService } from './api.service';
import { ErrorState, AttemptResult } from './error-state';
import { FormStore } from './form.store';
import { ImagesStore } from './images.store';
import { RenderRequest } from './models';
import { ProjectsStore } from './projects.store';
import { QueueStore } from './queue.store';

/**
 * All UI state as signals plus the actions the components call.
 * Components only read signals and call methods; they never call `ApiService` directly.
 *
 * Error handling rule (#47): every async method runs its HTTP work through `attempt()`.
 * `attempt()` catches the error, puts `errorMessage(err)` into `this.error` and reports failure;
 * it never rethrows and never touches `error` on success - whether a success clears the message
 * is decided by the caller (`this.error.set(null)`), because `refreshJobs()` deliberately keeps it.
 */
@Injectable({ providedIn: 'root' })
export class WorkbenchStore {
  private readonly api = inject(ApiService);
  private readonly errors = inject(ErrorState);
  private readonly forms = inject(FormStore);
  private readonly projectsStore = inject(ProjectsStore);
  private readonly imagesStore = inject(ImagesStore);
  private readonly queueStore = inject(QueueStore);

  readonly projects = this.projectsStore.projects;
  /** Text of the project filter field (case-insensitive substring match on the id). */
  readonly projectFilter = this.projectsStore.projectFilter;
  readonly selectedProject = this.projectsStore.selectedProject;
  readonly images = this.imagesStore.images;
  readonly selectedImage = this.imagesStore.selectedImage;
  /** Settings of the selected image (null if none selected). */
  readonly settings = this.imagesStore.settings;
  /** Diff selected image vs. its predecessor in `images` ([] for the first image).
   *  Since #19 WITHOUT the paths `prompt` and `negative` (they get their own word diff). */
  readonly diff = this.imagesStore.diff;
  /** Settings of the predecessor of the selected image (null: first image or not loadable). */
  readonly previousSettings = this.imagesStore.previousSettings;
  /**
   * LoRA slots from `GET /api/config` (#34), in display order. Empty until `loadConfig()` ran;
   * with an empty list the parameter form shows no LoRA fields and `defaultForm()` is plain
   * `DEFAULT_REQUEST`.
   */
  readonly loras = this.forms.loras;
  /** Current content of the parameter form. */
  readonly form = this.forms.form;
  /**
   * Last "clean" form state: set together with `form` whenever the form is loaded from an image
   * or reset to the defaults, and to a copy of `form()` after a successful `submit()`.
   */
  readonly formBaseline = this.forms.formBaseline;
  /** Injected for tests; asks before unrendered form changes are discarded. */
  confirmFn: (message: string) => boolean = (m) => window.confirm(m);
  readonly jobs = this.queueStore.jobs;
  readonly error = this.errors.error;
  /** Incremented after every reload of `images`; used as cache buster for thumbnails. */
  readonly imagesVersion = this.imagesStore.imagesVersion;

  /** Jobs that are `queued` or `running`. */
  readonly pendingJobs = this.queueStore.pendingJobs;

  /**
   * `projects()` filtered by `projectFilter()`: keep entries whose `id` contains the trimmed
   * filter text, case-insensitive (`toLowerCase`). Empty/blank filter -> all projects.
   * Order unchanged (newest first).
   */
  readonly filteredProjects = this.projectsStore.filteredProjects;

  /** Number of `running` jobs (all projects) - for the status badge in the header. */
  readonly runningCount = this.queueStore.runningCount;

  /** Number of `queued` jobs (all projects) - for the status badge in the header. */
  readonly queuedCount = this.queueStore.queuedCount;

  /**
   * Pending jobs (`queued` or `running`) of the selected project, oldest first.
   * `[]` without a selected project. Used for the placeholder tiles in the thumbnail strip.
   */
  readonly projectPendingJobs = this.queueStore.projectPendingJobs;

  /**
   * Number the next render of the selected project will get, for the button
   * "Render · image N": `max(images()) + 1 + projectPendingJobs().length`; with no images
   * `1 + projectPendingJobs().length`. (Each pending job will take one number before it.)
   */
  readonly nextImageNumber = this.queueStore.nextImageNumber;

  /**
   * `true` if an image is selected (`settings()` not null) AND `form().prompt` differs from
   * `settings().request['prompt']` (a missing/non-string request prompt counts as `''`).
   * `false` without settings.
   */
  readonly promptModified = this.imagesStore.promptModified;

  /**
   * `true` if the form has unrendered changes:
   * `diffSettings(formBaseline() as Record, form() as Record).length > 0` (reuse the existing
   * settings diff; cast via `as unknown as Record<string, unknown>`).
   */
  readonly formDirty = this.forms.dirty;

  /**
   * Word diff of the prompt for the "Image" column:
   * `diffWords(prev, current)` with `current` = `settings().request['prompt']` and
   * `prev` = `previousSettings().request['prompt']`; a missing / non-string value counts as `''`.
   * `prev` is `null` (-> all words `same`) when `previousSettings()` is null.
   * `[]` without `settings()`.
   */
  readonly promptDiff = this.imagesStore.promptDiff;

  /** Same as `promptDiff`, for `request['negative']`. */
  readonly negativeDiff = this.imagesStore.negativeDiff;

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
    this.forms.load(request);
  }

  /**
   * Default form state: a deep copy of `DEFAULT_REQUEST` plus one entry per configured LoRA
   * (#34) - `form[lora.key] = lora.default` for every entry of `loras()`, so a fresh form has the
   * configured strengths. Never mutates `DEFAULT_REQUEST`.
   */
  defaultForm(): RenderRequest {
    return this.forms.defaultForm();
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
    const result = await this.attempt(() => firstValueFrom(this.api.getConfig()));
    if (!result.ok) {
      return;
    }
    const config = result.value;
    this.loras.set(config.loras);
    this.error.set(typeof config.warning === 'string' ? config.warning : null);
    if (this.selectedImage() === null) {
      this.forms.reset();
    }
  }

  /** `projects.set(await listProjects())`. */
  async loadProjects(): Promise<void> {
    await this.projectsStore.loadProjects();
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
    await this.attempt(async () => {
      const { id } = await firstValueFrom(this.api.createProject(name));
      await this.loadProjects();
      await this.loadProject(id);
      this.error.set(null);
    });
  }

  /**
   * Delete the project (the component asks for confirmation before), reload the list.
   * If it was the selected project: `selectedProject`, `selectedImage`, `settings` -> null,
   * `images` and `diff` -> [], `form` -> fresh copy of `DEFAULT_REQUEST`, `previousSettings` ->
   * null and `formBaseline` -> fresh copy of `DEFAULT_REQUEST` (no discard question - deleting
   * was already confirmed).
   */
  async deleteProject(id: string): Promise<void> {
    await this.attempt(async () => {
      await firstValueFrom(this.api.deleteProject(id));
      const wasSelected = this.selectedProject() === id;
      await this.loadProjects();
      if (wasSelected) {
        this.selectedProject.set(null);
        this.selectedImage.set(null);
        this.settings.set(null);
        this.images.set([]);
        this.diff.set([]);
        this.forms.reset();
        this.previousSettings.set(null);
      }
      this.error.set(null);
    });
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
   *
   * Implementation (#47): both HTTP calls run through `attempt()` (`deleteImage`, then
   * `listImages`); if either reports failure, return exactly at that point as described above.
   */
  async deleteImage(n: number): Promise<void> {
    const project = this.selectedProject();
    if (project === null) {
      return;
    }
    const deleted = await this.attempt(() => firstValueFrom(this.api.deleteImage(project, n)));
    if (!deleted.ok) {
      return;
    }
    await this.loadProjects();
    const listed = await this.attempt(() => firstValueFrom(this.api.listImages(project)));
    if (!listed.ok) {
      return;
    }
    const list = listed.value;
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
   *
   * Implementation (#47): the whole body runs inside one `attempt()` call.
   */
  private async loadProject(id: string): Promise<void> {
    await this.attempt(async () => {
      this.selectedProject.set(id);
      const list = await firstValueFrom(this.api.listImages(id));
      this.images.set(list);
      this.imagesVersion.update((v) => v + 1);
      if (list.length === 0) {
        this.selectedImage.set(null);
        this.settings.set(null);
        this.previousSettings.set(null);
        this.diff.set([]);
        this.forms.reset();
        this.error.set(null);
        return;
      }
      if (await this.showImage(list[list.length - 1])) {
        this.loadForm(this.settings()!.request);
      }
    });
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
   *
   * Implementation (#47): loading the settings of `n` runs through `attempt()` (failure ->
   * `false`). The predecessor load keeps its own bare `catch {}`: a missing predecessor is NOT
   * an error (no `error`, still `true`) and must not be funnelled through `attempt()`.
   */
  private async showImage(n: number): Promise<boolean> {
    return this.imagesStore.showImage(n);
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

  /** See {@link QueueStore.submit} (#47). */
  async submit(): Promise<void> {
    await this.queueStore.submit();
  }

  /** See {@link QueueStore.cancelJob} (#47). */
  async cancelJob(jobId: string): Promise<void> {
    await this.queueStore.cancelJob(jobId);
  }

  /** See {@link QueueStore.clearQueue} (#47). */
  async clearQueue(): Promise<void> {
    await this.queueStore.clearQueue();
  }

  /** See {@link QueueStore.refreshJobs} (#47). */
  async refreshJobs(): Promise<void> {
    await this.queueStore.refreshJobs();
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
    await this.attempt(async () => {
      await firstValueFrom(this.api.saveComment(project, image, comment));
      this.settings.update((s) => (s === null ? s : { ...s, comment }));
      this.error.set(null);
    });
  }

  /** Open image `n` of the selected project in the system viewer (no-op without project). */
  async openImage(n: number): Promise<void> {
    const project = this.selectedProject();
    if (project === null) {
      return;
    }
    await this.attempt(async () => {
      await firstValueFrom(this.api.openImage(project, n));
      this.error.set(null);
    });
  }

  /** `api.imageUrl(selectedProject, n, imagesVersion())`; `''` without a selected project. */
  imageUrl(n: number): string {
    const project = this.selectedProject();
    if (project === null) {
      return '';
    }
    return this.api.imageUrl(project, n, this.imagesVersion());
  }

  /**
   * Run one API action with the class-wide error handling (#47):
   *
   * - `try { return { ok: true, value: await action() }; }`
   * - `catch (err) { this.error.set(errorMessage(err)); return { ok: false }; }`
   *
   * Contract:
   * - NEVER rethrows; an API error must not escape a component callback.
   * - Does NOT touch `error` on success. Callers that want a success to clear an old message
   *   call `this.error.set(null)` themselves - `refreshJobs()` must keep the message.
   * - `T` may be `void` (actions like `deleteImage`); the `ok` flag, not the value, tells success
   *   from failure.
   */
  private async attempt<T>(action: () => Promise<T>): Promise<AttemptResult<T>> {
    return this.errors.attempt(action);
  }
}

export { errorMessage } from './error-message';
