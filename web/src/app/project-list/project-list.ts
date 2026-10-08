import { Component, inject, signal } from '@angular/core';

import { imageCountLabel, projectLabel } from '../format';
import { WorkbenchStore } from '../workbench.store';

/**
 * Projects (top of the left column, issue #11 / mockup). Only the list scrolls; input, filter
 * and heading stay visible.
 *
 * Template (`project-list.html`) - required markup (tests use the `data-testid`s):
 * - `<h2>Projekte <span data-testid="project-count">{{ store.projects().length }}</span></h2>`.
 * - Row: `<input data-testid="new-name" placeholder="Neues Projekt …">` bound to `newName`
 *   (`[value]` + `(input)`), Enter = `create()`; `<button type="button" data-testid="create"
 *   title="Projekt anlegen">+</button>` -> `create()`.
 * - `<input data-testid="filter" class="search" placeholder="Projekte filtern …">`
 *   `[value]="store.projectFilter()"`, `(input)` -> `store.projectFilter.set(value)`.
 * - `<ul class="projects">`, for each `p` in `store.filteredProjects()` (track `p.id`):
 *   `<li data-testid="project">` with class `selected` when `p.id === store.selectedProject()`;
 *   click -> `store.selectProject(p.id)`. Content: `<div><span class="name">{{ label(p.id).name
 *   }}</span><small>{{ label(p.id).date }} · {{ count(p.image_count) }}</small></div>` (omit
 *   `date ·` if the date is empty) and `<button type="button" data-testid="delete" class="del"
 *   title="Löschen">✕</button>` -> `remove(p.id, $event)`.
 * - No projects at all: `<p class="hint">Noch keine Projekte</p>`; projects exist but the filter
 *   matches none: `<p class="hint">Kein Treffer</p>`.
 *
 * CSS (`project-list.css`): `:host { display: grid; grid-template-rows: auto auto auto
 * minmax(0, 1fr); min-height: 0; }`, `.projects { overflow-y: auto; min-height: 0; }`; row
 * style, `.selected`, hidden `.del` that appears on row hover - as in the mockup.
 */
@Component({
  selector: 'app-project-list',
  templateUrl: './project-list.html',
  styleUrl: './project-list.css',
})
export class ProjectList {
  protected readonly store = inject(WorkbenchStore);
  protected readonly newName = signal('');
  protected readonly label = projectLabel;
  protected readonly count = imageCountLabel;
  /** Injected for tests; defaults to `window.confirm`. */
  confirmFn: (message: string) => boolean = (m) => window.confirm(m);

  /** `await store.createProject(newName())`; clear `newName` if `store.error()` is null after. */
  async create(): Promise<void> {
    await this.store.createProject(this.newName());
    if (this.store.error() === null) {
      this.newName.set('');
    }
  }

  /**
   * `event.stopPropagation()` (so the row click does not select it), then ask
   * `confirmFn(`Projekt "${id}" mit allen Bildern löschen?`)`; only if true
   * `await store.deleteProject(id)`.
   */
  async remove(id: string, event: Event): Promise<void> {
    event.stopPropagation();
    if (this.confirmFn(`Projekt "${id}" mit allen Bildern löschen?`)) {
      await this.store.deleteProject(id);
    }
  }
}
