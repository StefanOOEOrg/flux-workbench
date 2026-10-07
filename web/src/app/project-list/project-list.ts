import { Component, inject, signal } from '@angular/core';

import { WorkbenchStore } from '../workbench.store';

/**
 * Project list (top left): input + "Neu" button, list of projects, delete button per project.
 *
 * Template (`project-list.html`) - required markup (tests use the `data-testid`s):
 * - `<input data-testid="new-name">` bound to `newName` (`[value]` + `(input)`), Enter = `create()`.
 * - `<button data-testid="create">Neu</button>` -> `create()`.
 * - For each id in `store.projects()`: `<li data-testid="project">` showing the id; class
 *   `selected` when it equals `store.selectedProject()`; click -> `store.selectProject(id)`.
 *   Inside: `<button data-testid="delete">Löschen</button>` -> `remove(id, $event)`.
 * - Empty list: `<p>Noch keine Projekte</p>`.
 */
@Component({
  selector: 'app-project-list',
  templateUrl: './project-list.html',
  styleUrl: './project-list.css',
})
export class ProjectList {
  protected readonly store = inject(WorkbenchStore);
  protected readonly newName = signal('');
  /** Injected for tests; defaults to `window.confirm`. */
  confirmFn: (message: string) => boolean = (m) => window.confirm(m);

  /** `await store.createProject(newName())`; clear `newName` if `store.error()` is null after. */
  async create(): Promise<void> {
    throw new Error('not implemented');
  }

  /**
   * `event.stopPropagation()` (so the row click does not select it), then ask
   * `confirmFn(`Projekt "${id}" mit allen Bildern löschen?`)`; only if true
   * `await store.deleteProject(id)`.
   */
  async remove(id: string, event: Event): Promise<void> {
    throw new Error('not implemented');
  }
}
