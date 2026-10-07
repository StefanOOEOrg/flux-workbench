import { Component, computed, inject } from '@angular/core';

import { effectiveOrRequest, flattenSettings } from '../settings-diff';
import { WorkbenchStore } from '../workbench.store';

/**
 * Settings of the selected image + diff to its predecessor.
 *
 * Template (`settings-panel.html`):
 * - No `store.settings()`: `<p>Bild auswählen</p>`.
 * - Heading `Bild {{ store.selectedImage() }}` and buttons
 *   `<button data-testid="clone">Klonen</button>` -> `store.cloneSelected()`,
 *   `<button data-testid="adopt-seed">Seed übernehmen</button>` -> `store.adoptSeed()`
 *   (disabled when `seed()` is null).
 * - Diff section `<section data-testid="diff">`: if `store.diff()` is empty show
 *   `Keine Änderungen zum Vorgänger` (or `Erstes Bild` when the selected image is the first
 *   in `store.images()`); else one `<li data-testid="diff-entry">` per entry with
 *   `formatDiff(entry)` text and CSS class = `entry.kind`.
 * - Table of `rows()` (`path` | `formatValue(value)`), rows whose path is in `changedPaths()`
 *   get class `changed`.
 * - Under the table, collapsed `<details>`: "Gesendeter Request" with
 *   `JSON.stringify(store.settings()!.request, null, 2)` in a `<pre>`.
 */
@Component({
  selector: 'app-settings-panel',
  templateUrl: './settings-panel.html',
  styleUrl: './settings-panel.css',
})
export class SettingsPanel {
  protected readonly store = inject(WorkbenchStore);

  /** `flattenSettings(effectiveOrRequest(settings))`, or `[]` without settings. */
  readonly rows = computed<[string, unknown][]>(() => {
    throw new Error('not implemented');
  });

  /** Set of `path`s from `store.diff()`. */
  readonly changedPaths = computed<Set<string>>(() => {
    throw new Error('not implemented');
  });

  /** `store.settings()?.effective?.['seed']` if it is a number, else `null`. */
  readonly seed = computed<number | null>(() => {
    throw new Error('not implemented');
  });

  /**
   * Text for one diff line:
   * - changed: `` `${path}: ${formatValue(before)} → ${formatValue(after)}` ``
   * - added:   `` `${path}: neu ${formatValue(after)}` ``
   * - removed: `` `${path}: entfernt (war ${formatValue(before)})` ``
   */
  formatDiff(entry: { path: string; kind: string; before?: unknown; after?: unknown }): string {
    throw new Error('not implemented');
  }

  /** Strings as-is (no quotes), everything else `JSON.stringify(value)`; `undefined` -> `'–'`. */
  formatValue(value: unknown): string {
    throw new Error('not implemented');
  }
}
