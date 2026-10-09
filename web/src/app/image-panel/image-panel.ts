import { Component, HostListener, computed, inject, signal } from '@angular/core';

import { formatDuration } from '../format';
import { effectiveOrRequest, flattenSettings } from '../settings-diff';
import { WorkbenchStore } from '../workbench.store';

/**
 * Column "Bild" (issue #11, mockup `docs/ui-mockup.html`, first card under the thumbnails):
 * selected image info, diff chips, comment, collapsed table of all settings.
 *
 * CHANGES FOR #19 (WP2 implements template, CSS and the stubs below; the rest stays as it is):
 * - Head: REMOVE the "Klonen" button (`data-testid="clone"`) - clicking a thumbnail now loads
 *   the form. After the seed span add `<span class="hint" data-testid="render-time">·
 *   {{ renderTime() }}</span>` (always shown, `–` without a measurement).
 * - Directly under the head row: `<img data-testid="preview" class="preview"
 *   [src]="store.imageUrl(store.selectedImage()!)" [alt]="'Bild ' + store.selectedImage()"
 *   title="Klicken für große Ansicht" (click)="openLightbox()">`.
 *   CSS: `display: block; max-width: 100%; max-height: 160px; object-fit: contain;
 *   border-radius: 8px; cursor: zoom-in; margin: 10px 0;`.
 * - Before the diff chips: `<h2>Prompt</h2>` + `<p data-testid="prompt-diff" class="words">`
 *   with one `<span [class]="seg.kind">{{ seg.text }}</span>` per segment of
 *   `store.promptDiff()` (track `$index`), separated by a single space (put `{{ ' ' }}` between
 *   the spans or use CSS `gap` - the test reads `textContent` of each span only). Then the same
 *   for "Negative Prompt" with `data-testid="negative-diff"` and `store.negativeDiff()`; if that
 *   list is empty show `<p class="hint" data-testid="negative-diff">leer</p>` instead.
 *   CSS: `.words { font-family: var(--mono); font-size: 12px; line-height: 1.6; white-space:
 *   normal; }` `.added { color: var(--add); }` `.removed { color: var(--rem);
 *   text-decoration: line-through; }`.
 * - Diff chips no longer contain `prompt`/`negative` (the store filters them).
 * - Lightbox, rendered at the END of the template, only while `lightboxOpen()`:
 *   `<div data-testid="lightbox" class="lightbox" (click)="closeLightbox()">` containing
 *   `<img [src]="store.imageUrl(store.selectedImage()!)" [alt]="'Bild ' + store.selectedImage()"
 *   (click)="$event.stopPropagation()">` and `<button type="button" data-testid="lightbox-close"
 *   class="close" title="Schließen (Esc)" (click)="closeLightbox()">×</button>`.
 *   CSS: `.lightbox { position: fixed; inset: 0; z-index: 100; background: color-mix(in srgb,
 *   var(--bg) 88%, transparent); display: flex; align-items: center; justify-content: center;
 *   padding: 32px; cursor: zoom-out; }` `.lightbox img { max-width: 100%; max-height: 100%;
 *   object-fit: contain; border-radius: 10px; cursor: default; }` `.close { position: absolute;
 *   top: 16px; right: 16px; font-size: 22px; }`.
 *
 * Template (`image-panel.html`) - required markup (tests use the `data-testid`s):
 * - No `store.settings()`: only `<p class="empty">Bild auswählen</p>`.
 * - Head row: `<h3>Bild {{ store.selectedImage() }}` plus, if `seed()` is a number,
 *   `<span class="hint">· Seed {{ seed() }}</span>`; on the right
 *   `<button type="button" data-testid="adopt-seed" class="ghost">Seed übernehmen</button>` ->
 *   `store.adoptSeed()` (disabled when `seed()` is null).
 * - `<h2>Änderungen zu Bild {{ previous() }}</h2>` (only if `previous()` is not null) and
 *   `<section data-testid="diff">`: if `store.diff()` is empty show
 *   `<p class="hint">Erstes Bild</p>` when `previous()` is null, else
 *   `<p class="hint">Keine Änderungen zum Vorgänger</p>`. Otherwise one chip per entry:
 *   `<div data-testid="diff-entry" [class]="'chip ' + entry.kind" [title]="formatDiff(entry)">`
 *   with `<b data-testid="diff-path">{{ entry.path }}</b>`; for `changed`/`removed`
 *   `<span class="old" data-testid="diff-before">{{ formatValue(entry.before) }}</span>`;
 *   for `changed` `<span class="arrow">→</span>`; for `changed`/`added`
 *   `<span data-testid="diff-after">{{ formatValue(entry.after) }}</span>`.
 * - `<h2>Kommentar <span data-testid="comment-state">{{ commentState() }}</span></h2>`, below
 *   `<textarea data-testid="comment" class="comment" placeholder="Notiz zu diesem Bild …">`
 *   with `[value]="store.settings()!.comment"`, `(input)` -> `onCommentInput()`,
 *   `(blur)` -> `onCommentBlur($any($event.target).value)`.
 * - `<details class="all">` (NOT open) with `<summary>Alle Einstellungen</summary>` and a
 *   `<table>` of `rows()` (`<td>path</td><td>formatValue(value)</td>`); rows whose path is in
 *   `changedPaths()` get class `changed`. The former "Gesendeter Request" block is removed.
 * - Every `<button>` has `type="button"`.
 *
 * CSS (`image-panel.css`): rewrite in the mockup style (`.chip` with coloured left border per
 * kind: changed `--chg`, added `--add`, removed `--rem`; `.old` struck-through and muted;
 * monospace 12px; table rows `tr.changed` tinted; `.comment` width 100%, min-height 90px).
 * Only CSS variables from `styles.css`, no hard-coded light colours.
 */
@Component({
  selector: 'app-image-panel',
  templateUrl: './image-panel.html',
  styleUrl: './image-panel.css',
})
export class ImagePanel {
  protected readonly store = inject(WorkbenchStore);

  /** `true` while the comment textarea has unsaved typing (set by `onCommentInput`). */
  readonly commentDirty = signal(false);

  /** Whether the large view (lightbox) is shown. */
  readonly lightboxOpen = signal(false);

  /** `formatDuration(store.settings()?.render_seconds ?? null)`. */
  readonly renderTime = computed<string>(() => {
    return formatDuration(this.store.settings()?.render_seconds ?? null);
  });

  /** Show the lightbox (`lightboxOpen.set(true)`); no-op without a selected image. */
  openLightbox(): void {
    if (this.store.selectedImage() === null) {
      return;
    }
    this.lightboxOpen.set(true);
  }

  /** Hide the lightbox (`lightboxOpen.set(false)`). */
  closeLightbox(): void {
    this.lightboxOpen.set(false);
  }

  /** Esc anywhere on the page closes the lightbox (calls `closeLightbox()`). */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeLightbox();
  }

  /** `flattenSettings(effectiveOrRequest(settings))`, or `[]` without settings. */
  readonly rows = computed<[string, unknown][]>(() => {
    const settings = this.store.settings();
    if (settings === null) {
      return [];
    }
    return flattenSettings(effectiveOrRequest(settings));
  });

  /** Set of `path`s from `store.diff()`. */
  readonly changedPaths = computed<Set<string>>(() => {
    return new Set(this.store.diff().map((e) => e.path));
  });

  /** `store.settings()?.effective?.['seed']` if it is a number, else `null`. */
  readonly seed = computed<number | null>(() => {
    const seed = this.store.settings()?.effective?.['seed'];
    return typeof seed === 'number' ? seed : null;
  });

  /**
   * Image number before the selected one in `store.images()` (not necessarily n-1),
   * or `null` if nothing is selected or it is the first image.
   */
  readonly previous = computed<number | null>(() => {
    const selected = this.store.selectedImage();
    if (selected === null) {
      return null;
    }
    const idx = this.store.images().indexOf(selected);
    return idx > 0 ? this.store.images()[idx - 1] : null;
  });

  /**
   * Text for `comment-state`: `'· ungespeichert'` while `commentDirty()`; otherwise
   * `'· gespeichert'` if the stored comment (`store.settings()?.comment`) is non-empty, else `''`.
   */
  readonly commentState = computed<string>(() => {
    if (this.commentDirty()) {
      return '· ungespeichert';
    }
    return this.store.settings()?.comment ? '· gespeichert' : '';
  });

  /** Mark the comment as having unsaved changes (`commentDirty.set(true)`). */
  onCommentInput(): void {
    this.commentDirty.set(true);
  }

  /**
   * `await store.saveComment(value)`; afterwards set `commentDirty` to `false` only if
   * `store.error()` is null (on error the text stays marked as unsaved).
   */
  async onCommentBlur(value: string): Promise<void> {
    await this.store.saveComment(value);
    if (this.store.error() === null) {
      this.commentDirty.set(false);
    }
  }

  /**
   * Tooltip text for one diff chip:
   * - changed: `` `${path}: ${formatValue(before)} → ${formatValue(after)}` ``
   * - added:   `` `${path}: neu ${formatValue(after)}` ``
   * - removed: `` `${path}: entfernt (war ${formatValue(before)})` ``
   */
  formatDiff(entry: { path: string; kind: string; before?: unknown; after?: unknown }): string {
    if (entry.kind === 'added') {
      return `${entry.path}: neu ${this.formatValue(entry.after)}`;
    }
    if (entry.kind === 'removed') {
      return `${entry.path}: entfernt (war ${this.formatValue(entry.before)})`;
    }
    return `${entry.path}: ${this.formatValue(entry.before)} → ${this.formatValue(entry.after)}`;
  }

  /** Strings as-is (no quotes), everything else `JSON.stringify(value)`; `undefined` -> `'–'`. */
  formatValue(value: unknown): string {
    if (value === undefined) {
      return '–';
    }
    if (typeof value === 'string') {
      return value;
    }
    return JSON.stringify(value);
  }
}
