import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ApiService } from './api.service';
import { ErrorState } from './error-state';
import { FormStore } from './form.store';
import { DiffEntry, ImageSettings } from './models';
import { ProjectsStore } from './projects.store';
import { diffSettings, effectiveOrRequest } from './settings-diff';
import { WordSegment, diffWords } from './word-diff';

/**
 * Image column: the list of image numbers, the selected image, its settings, the predecessor and
 * the two diffs (#47).
 *
 * Depends only on `ProjectsStore` (which project), `FormStore` (the prompt comparison) and
 * `ErrorState` (the HTTP funnel) - never on the queue.
 *
 * `WorkbenchStore` injects this store and exposes the signals as ALIASES
 * (`readonly images = this.images_store.images;`), so components keep using `store.images()`.
 */
@Injectable({ providedIn: 'root' })
export class ImagesStore {
  private readonly api = inject(ApiService);
  private readonly projects = inject(ProjectsStore);
  private readonly forms = inject(FormStore);
  private readonly errors = inject(ErrorState);

  readonly images = signal<number[]>([]);
  readonly selectedImage = signal<number | null>(null);
  /** Settings of the selected image (null if none selected). */
  readonly settings = signal<ImageSettings | null>(null);
  /** Diff selected image vs. its predecessor in `images` ([] for the first image).
   *  Since #19 WITHOUT the paths `prompt` and `negative` (they get their own word diff). */
  readonly diff = signal<DiffEntry[]>([]);
  /** Settings of the predecessor of the selected image (null: first image or not loadable). */
  readonly previousSettings = signal<ImageSettings | null>(null);
  /** Incremented after every reload of `images`; used as cache buster for thumbnails. */
  readonly imagesVersion = signal(0);

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
   * `true` if an image is selected (`settings()` not null) AND `form().prompt` differs from
   * `settings().request['prompt']` (a missing/non-string request prompt counts as `''`).
   * `false` without settings. Reads the form through `FormStore`.
   */
  readonly promptModified = computed<boolean>(() => {
    const settings = this.settings();
    if (settings === null) {
      return false;
    }
    const prompt = settings.request['prompt'];
    const baseline = typeof prompt === 'string' ? prompt : '';
    return this.forms.form().prompt !== baseline;
  });

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
   * Show image `n` in the "Image" column WITHOUT touching the form.
   * Returns `true` on success, `false` on error or without a selected project.
   * Load its settings into `settings`, set `selectedImage = n`, `error = null`.
   * Predecessor = the element before `n` in `images()` (not necessarily `n - 1`):
   * - none: `previousSettings = null`, `diff = []`;
   * - load OK: `previousSettings = prev`, `diff = diffSettings(effectiveOrRequest(prev),
   *   effectiveOrRequest(current))` WITHOUT the entries with path `prompt` or `negative`;
   * - load fails (e.g. 404): `previousSettings = null`, `diff = []`, no error, still `true`.
   * If the settings of `n` cannot be loaded: `error` set, return `false`, nothing else changes.
   *
   * Implementation (#47): loading the settings of `n` runs through `ErrorState.attempt()`
   * (failure -> `false`). The predecessor load keeps its own bare `catch {}`: a missing
   * predecessor is NOT an error (no `error`, still `true`).
   */
  async showImage(n: number): Promise<boolean> {
    const project = this.projects.selectedProject();
    if (project === null) {
      return false;
    }
    const loaded = await this.errors.attempt(() =>
      firstValueFrom(this.api.getSettings(project, n)),
    );
    if (!loaded.ok) {
      return false;
    }
    const settings = loaded.value;
    this.settings.set(settings);
    this.selectedImage.set(n);
    this.errors.error.set(null);
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
}
