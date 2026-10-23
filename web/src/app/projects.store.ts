import { Injectable, computed, inject, signal } from '@angular/core';

import { ApiService } from './api.service';
import { ErrorState } from './error-state';
import { ProjectInfo } from './models';

/**
 * Project list, filter and selection (#47): the part of `WorkbenchStore` that only needs the API
 * and the error state.
 *
 * `WorkbenchStore` injects this store and exposes the signals as ALIASES
 * (`readonly projects = this.projects_store.projects;`), so components and the store keep using
 * `store.projects()` / `this.selectedProject.set(...)` - the very same signal object.
 */
@Injectable({ providedIn: 'root' })
export class ProjectsStore {
  private readonly api = inject(ApiService);
  private readonly errors = inject(ErrorState);

  readonly projects = signal<ProjectInfo[]>([]);
  /** Text of the project filter field (case-insensitive substring match on the id). */
  readonly projectFilter = signal('');
  readonly selectedProject = signal<string | null>(null);

  /**
   * `projects()` filtered by `projectFilter()`: keep entries whose `id` contains the trimmed
   * filter text, case-insensitive (`toLowerCase`). Empty/blank filter -> all projects.
   * Order unchanged (newest first).
   */
  readonly filteredProjects = computed<ProjectInfo[]>(() => {
    throw new Error('not implemented yet');
  });

  /**
   * `projects.set(await listProjects())`, then `error = null`.
   * Uses `ErrorState.attempt()` like everywhere else (#47); on failure only `error` changes.
   */
  async loadProjects(): Promise<void> {
    throw new Error('not implemented yet');
  }
}
