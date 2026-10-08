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
   * Text for one diff line:
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

  /** `store.settings()!.request` serialized as pretty JSON for display in the `<details>`. */
  requestJson(): string {
    const settings = this.store.settings();
    if (settings === null) {
      return '';
    }
    return JSON.stringify(settings.request, null, 2);
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
