import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';

import { ApiService } from './api.service';
import {
  DEFAULT_REQUEST,
  ImageSettings,
  Job,
  ProjectInfo,
  RenderRequest,
  WorkbenchConfig,
} from './models';
import { WorkbenchStore, errorMessage } from './workbench.store';

const PID = '20261007-x';

/** Settings with an empty comment (shorthand for the fixtures below). */
function s(request: Record<string, unknown>, effective: Record<string, unknown> | null) {
  return { request, effective, comment: '', render_seconds: null } satisfies ImageSettings;
}

/** In-memory fake of the server. */
class FakeApi {
  projects: ProjectInfo[] = [{ id: PID, image_count: 0 }];
  images: Record<string, number[]> = { [PID]: [] };
  settings: Record<string, ImageSettings> = {};
  jobs: Job[] = [];
  calls: string[] = [];
  opened: [string, number][] = [];
  submitted: [string, RenderRequest][] = [];
  comments: [string, number, string][] = [];
  deleted: string[] = [];
  failComment = false;
  failDelete = false;
  failClear = false;
  failConfig = false;
  /** Name of the next API call that must fail once with HTTP 500 `boom` (#47). */
  failNext: string | null = null;
  config: WorkbenchConfig = {
    loras: [
      { key: 'lora_strength', label: 'LoRA 1', default: 0.2, toggle: false },
      { key: 'lora2', label: 'LoRA 2', default: 1.35, toggle: true },
    ],
    warning: null,
  };

  /** The one-shot failure for `name` when `failNext` asks for it, otherwise `null`. */
  private fail(name: string): Observable<never> | null {
    if (this.failNext !== name) {
      return null;
    }
    this.failNext = null;
    return throwError(() => new HttpErrorResponse({ status: 500, error: { detail: 'boom' } }));
  }

  getConfig(): Observable<WorkbenchConfig> {
    this.calls.push('getConfig');
    if (this.failConfig) {
      return throwError(() => new HttpErrorResponse({ status: 500, error: { detail: 'nope' } }));
    }
    return of(structuredClone(this.config));
  }

  listProjects(): Observable<ProjectInfo[]> {
    this.calls.push('listProjects');
    const failure = this.fail('listProjects');
    if (failure) {
      return failure;
    }
    return of(structuredClone(this.projects));
  }
  createProject(name: string): Observable<{ id: string }> {
    this.calls.push('createProject');
    const failure = this.fail('createProject');
    if (failure) {
      return failure;
    }
    const id = `20261007-${name}`;
    this.projects.unshift({ id, image_count: 0 });
    this.images[id] = [];
    return of({ id });
  }
  deleteProject(id: string): Observable<void> {
    const failure = this.fail('deleteProject');
    if (failure) {
      return failure;
    }
    this.projects = this.projects.filter((p) => p.id !== id);
    return of(undefined);
  }
  listImages(id: string): Observable<number[]> {
    return of([...(this.images[id] ?? [])]);
  }
  getSettings(id: string, n: number): Observable<ImageSettings> {
    const st = this.settings[`${id}/${n}`];
    return st
      ? of(structuredClone(st))
      : throwError(() => new HttpErrorResponse({ status: 404, error: { detail: 'not found' } }));
  }
  saveComment(id: string, n: number, comment: string): Observable<void> {
    this.calls.push('saveComment');
    if (this.failComment) {
      return throwError(() => new HttpErrorResponse({ status: 400, error: { detail: 'zu lang' } }));
    }
    this.comments.push([id, n, comment]);
    return of(undefined);
  }
  openImage(id: string, n: number): Observable<void> {
    const failure = this.fail('openImage');
    if (failure) {
      return failure;
    }
    this.opened.push([id, n]);
    return of(undefined);
  }
  deleteImage(id: string, n: number): Observable<void> {
    if (this.failDelete) {
      return throwError(
        () => new HttpErrorResponse({ status: 404, error: { detail: 'not found' } }),
      );
    }
    this.deleted.push(`${id}/${n}`);
    this.images[id] = (this.images[id] ?? []).filter((x) => x !== n);
    delete this.settings[`${id}/${n}`];
    this.projects = this.projects.map((p) =>
      p.id === id ? { ...p, image_count: this.images[id].length } : p,
    );
    return of(undefined);
  }
  imageUrl(id: string, n: number, v?: number): string {
    return `/api/projects/${id}/images/${n}${v === undefined ? '' : `?v=${v}`}`;
  }
  listJobs(): Observable<Job[]> {
    return of(structuredClone(this.jobs));
  }
  submitJob(id: string, request: RenderRequest): Observable<Job> {
    const failure = this.fail('submitJob');
    if (failure) {
      return failure;
    }
    this.submitted.push([id, structuredClone(request)]);
    const job = makeJob('j' + this.submitted.length, 'queued', null);
    this.jobs.push(job);
    return of(job);
  }
  cancelJob(): Observable<void> {
    const failure = this.fail('cancelJob');
    if (failure) {
      return failure;
    }
    return of(undefined);
  }
  clearQueue(): Observable<void> {
    this.calls.push('clearQueue');
    if (this.failClear) {
      return throwError(() => new HttpErrorResponse({ status: 500, error: { detail: 'boom' } }));
    }
    this.jobs = this.jobs.filter((j) => j.status === 'queued' || j.status === 'running');
    return of(undefined);
  }
}

function makeJob(id: string, status: Job['status'], image_n: number | null, project_id = PID): Job {
  return { id, project_id, request: {}, status, created_at: '', image_n, error: null };
}

function setup(): { store: WorkbenchStore; api: FakeApi } {
  const api = new FakeApi();
  TestBed.configureTestingModule({ providers: [{ provide: ApiService, useValue: api }] });
  return { store: TestBed.inject(WorkbenchStore), api };
}

describe('WorkbenchStore', () => {
  it('creates and selects a project; empty project gets the defaults', async () => {
    const { store } = setup();
    store.form.set({ prompt: 'changed' });
    await store.createProject('Neu');
    expect(store.selectedProject()).toBe('20261007-Neu');
    expect(store.projects()[0]).toEqual({ id: '20261007-Neu', image_count: 0 });
    expect(store.form()).toEqual(DEFAULT_REQUEST);
    expect(store.form()).not.toBe(DEFAULT_REQUEST);
  });

  it('rejects a blank project name without calling the server', async () => {
    const { store, api } = setup();
    await store.createProject('  ');
    expect(store.error()).toBe('Projektname fehlt');
    expect(api.calls).not.toContain('createProject');
  });

  it('selecting a project with images selects the last one and loads its request', async () => {
    const { store, api } = setup();
    api.images[PID] = [1, 2];
    api.settings[`${PID}/1`] = s({ prompt: 'a', steps: 1 }, null);
    api.settings[`${PID}/2`] = { ...s({ prompt: 'b', steps: 2 }, { seed: 9 }), comment: 'gut' };
    await store.selectProject(PID);
    expect(store.images()).toEqual([1, 2]);
    expect(store.selectedImage()).toBe(2);
    expect(store.form()).toEqual({ prompt: 'b', steps: 2 });
    expect(store.formDirty()).toBe(false);
  });

  it('diffs against the predecessor in the list, not n-1, without prompt/negative', async () => {
    const { store, api } = setup();
    api.images[PID] = [1, 3];
    api.settings[`${PID}/1`] = s(
      { prompt: 'a red car' },
      { prompt: 'a red car', negative: '', steps: 32, hires: { denoise: 0.4 } },
    );
    api.settings[`${PID}/3`] = s(
      { prompt: 'a green car' },
      { prompt: 'a green car', negative: 'blurry', steps: 40, hires: { denoise: 0.5 } },
    );
    await store.selectProject(PID);
    await store.selectImage(3);
    expect(store.diff()).toEqual([
      { path: 'hires.denoise', kind: 'changed', before: 0.4, after: 0.5 },
      { path: 'steps', kind: 'changed', before: 32, after: 40 },
    ]);
    expect(store.previousSettings()?.request).toEqual({ prompt: 'a red car' });
    await store.selectImage(1);
    expect(store.diff()).toEqual([]);
    expect(store.previousSettings()).toBeNull();
  });

  it('clicking a thumbnail restores the exact request of that image', async () => {
    const { store, api } = setup();
    api.images[PID] = [1, 2];
    const first = { prompt: 'red car', negative: 'blurry', seed: null, steps: 20, lora2: false };
    api.settings[`${PID}/1`] = { ...s(first, { seed: 77 }), comment: 'Notiz', render_seconds: 9 };
    api.settings[`${PID}/2`] = s({ prompt: 'b' }, null);
    await store.selectProject(PID);
    await store.selectImage(1);
    expect(store.form()).toEqual(first);
    expect(store.formBaseline()).toEqual(first);
    expect(store.form()).not.toBe(store.formBaseline());
    expect(JSON.stringify(store.form())).not.toContain('Notiz');
    store.adoptSeed();
    expect(store.form().seed).toBe(77);
  });

  it('a missing prompt in the stored request becomes an empty string', async () => {
    const { store, api } = setup();
    api.images[PID] = [1];
    api.settings[`${PID}/1`] = s({ steps: 3 }, null);
    await store.selectProject(PID);
    expect(store.form()).toEqual({ steps: 3, prompt: '' });
  });

  describe('unrendered changes', () => {
    async function dirtyStore() {
      const ctx = setup();
      ctx.api.images[PID] = [1, 2];
      ctx.api.settings[`${PID}/1`] = s({ prompt: 'one' }, null);
      ctx.api.settings[`${PID}/2`] = s({ prompt: 'two' }, null);
      await ctx.store.selectProject(PID);
      ctx.store.form.update((f) => ({ ...f, prompt: 'edited' }));
      return ctx;
    }

    it('form changes make the form dirty, an equal form is clean again', async () => {
      const { store } = await dirtyStore();
      expect(store.formDirty()).toBe(true);
      store.form.update((f) => ({ ...f, prompt: 'two' }));
      expect(store.formDirty()).toBe(false);
    });

    it('asks before another image is loaded; cancel keeps everything', async () => {
      const { store } = await dirtyStore();
      const asked: string[] = [];
      store.confirmFn = (m) => {
        asked.push(m);
        return false;
      };
      await store.selectImage(1);
      expect(asked).toEqual(['Discard unrendered changes?']);
      expect(store.selectedImage()).toBe(2);
      expect(store.form().prompt).toBe('edited');
    });

    it('OK discards the changes and loads the image', async () => {
      const { store } = await dirtyStore();
      store.confirmFn = () => true;
      await store.selectImage(1);
      expect(store.selectedImage()).toBe(1);
      expect(store.form()).toEqual({ prompt: 'one' });
      expect(store.formDirty()).toBe(false);
    });

    it('asks before switching or creating a project', async () => {
      const { store, api } = await dirtyStore();
      api.images['20261001-other'] = [];
      store.confirmFn = () => false;
      await store.selectProject('20261001-other');
      expect(store.selectedProject()).toBe(PID);
      await store.createProject('Neu');
      expect(api.calls).not.toContain('createProject');
    });

    it('creating a project asks only once', async () => {
      const { store } = await dirtyStore();
      let count = 0;
      store.confirmFn = () => {
        count++;
        return true;
      };
      await store.createProject('Neu');
      expect(count).toBe(1);
      expect(store.selectedProject()).toBe('20261007-Neu');
      expect(store.form()).toEqual(DEFAULT_REQUEST);
      expect(store.formDirty()).toBe(false);
    });

    it('never asks without changes', async () => {
      const { store, api } = setup();
      api.images[PID] = [1, 2];
      api.settings[`${PID}/1`] = s({ prompt: 'one' }, null);
      api.settings[`${PID}/2`] = s({ prompt: 'two' }, null);
      store.confirmFn = () => {
        throw new Error('must not ask');
      };
      await store.selectProject(PID);
      await store.selectImage(1);
      expect(store.form()).toEqual({ prompt: 'one' });
    });

    it('after Rendern the form counts as rendered', async () => {
      const { store } = await dirtyStore();
      await store.submit();
      expect(store.formDirty()).toBe(false);
      expect(store.formBaseline().prompt).toBe('edited');
    });

    it('a finished render shows the new image but keeps a dirty form, without asking', async () => {
      const { store, api } = await dirtyStore();
      store.confirmFn = () => {
        throw new Error('must not ask');
      };
      api.jobs = [makeJob('j1', 'running', null)];
      await store.refreshJobs();
      api.jobs = [makeJob('j1', 'done', 3)];
      api.images[PID] = [1, 2, 3];
      api.settings[`${PID}/3`] = s({ prompt: 'three' }, null);
      await store.refreshJobs();
      expect(store.selectedImage()).toBe(3);
      expect(store.form().prompt).toBe('edited');
      expect(store.formDirty()).toBe(true);
    });

    it('a finished render loads its request when the form is clean', async () => {
      const { store, api } = setup();
      await store.selectProject(PID);
      api.jobs = [makeJob('j1', 'running', null)];
      await store.refreshJobs();
      api.jobs = [makeJob('j1', 'done', 1)];
      api.images[PID] = [1];
      api.settings[`${PID}/1`] = s({ prompt: 'p', steps: 7 }, null);
      await store.refreshJobs();
      expect(store.form()).toEqual({ prompt: 'p', steps: 7 });
    });
  });

  describe('prompt word diff', () => {
    it('diffs prompt and negative against the predecessor', async () => {
      const { store, api } = setup();
      api.images[PID] = [1, 2];
      api.settings[`${PID}/1`] = s({ prompt: 'a red car' }, null);
      api.settings[`${PID}/2`] = s({ prompt: 'a green car', negative: 'blurry' }, null);
      await store.selectProject(PID);
      expect(store.promptDiff()).toEqual([
        { kind: 'same', text: 'a' },
        { kind: 'removed', text: 'red' },
        { kind: 'added', text: 'green' },
        { kind: 'same', text: 'car' },
      ]);
      expect(store.negativeDiff()).toEqual([{ kind: 'added', text: 'blurry' }]);
    });

    it('first image: plain text; nothing selected: empty', async () => {
      const { store, api } = setup();
      expect(store.promptDiff()).toEqual([]);
      api.images[PID] = [1];
      api.settings[`${PID}/1`] = s({ prompt: 'a car' }, null);
      await store.selectProject(PID);
      expect(store.promptDiff()).toEqual([{ kind: 'same', text: 'a car' }]);
      expect(store.negativeDiff()).toEqual([]);
    });
  });

  it('submit sends the form for the selected project and validates', async () => {
    const { store, api } = setup();
    await store.submit();
    expect(store.error()).toBe('No project selected');
    await store.selectProject(PID);
    store.form.set({ prompt: '  ' });
    await store.submit();
    expect(store.error()).toBe('Prompt fehlt');
    store.form.set({ prompt: 'car', steps: 5 });
    await store.submit();
    expect(api.submitted).toEqual([[PID, { prompt: 'car', steps: 5 }]]);
    expect(store.jobs().length).toBe(1);
    expect(store.pendingJobs().length).toBe(1);
    expect(store.error()).toBeNull();
  });

  it('refreshJobs reloads images and selects the new image when a job finished', async () => {
    const { store, api } = setup();
    await store.selectProject(PID);
    api.jobs = [makeJob('j1', 'running', null)];
    await store.refreshJobs();
    const version = store.imagesVersion();

    api.jobs = [makeJob('j1', 'done', 1)];
    api.images[PID] = [1];
    api.settings[`${PID}/1`] = s({ prompt: 'p' }, null);
    await store.refreshJobs();
    expect(store.images()).toEqual([1]);
    expect(store.selectedImage()).toBe(1);
    expect(store.imagesVersion()).toBeGreaterThan(version);
  });

  it('a successful poll keeps an existing error message visible', async () => {
    const { store } = setup();
    store.error.set('Prompt fehlt');
    await store.refreshJobs();
    expect(store.error()).toBe('Prompt fehlt');
  });

  it('deleting the selected project resets the selection', async () => {
    const { store, api } = setup();
    api.images[PID] = [1];
    api.settings[`${PID}/1`] = s({ prompt: 'p' }, null);
    await store.selectProject(PID);
    await store.deleteProject(PID);
    expect(store.selectedProject()).toBeNull();
    expect(store.selectedImage()).toBeNull();
    expect(store.images()).toEqual([]);
    expect(store.form()).toEqual(DEFAULT_REQUEST);
    expect(store.formBaseline()).toEqual(DEFAULT_REQUEST);
    expect(store.previousSettings()).toBeNull();
  });

  it('opens images and builds urls only with a selected project', async () => {
    const { store, api } = setup();
    expect(store.imageUrl(1)).toBe('');
    await store.openImage(1);
    expect(api.opened).toEqual([]);
    await store.selectProject(PID);
    await store.openImage(4);
    expect(api.opened).toEqual([[PID, 4]]);
    expect(store.imageUrl(4)).toBe(`/api/projects/${PID}/images/4?v=${store.imagesVersion()}`);
  });

  it('puts server errors into error instead of throwing', async () => {
    const { store, api } = setup();
    api.images[PID] = [1];
    await store.selectProject(PID); // settings for 1 missing -> 404
    expect(store.error()).toBe('not found');
  });

  describe('project filter', () => {
    it('filters case-insensitively by id and keeps the order', () => {
      const { store } = setup();
      store.projects.set([
        { id: '20261008-Green_Car', image_count: 3 },
        { id: '20261006-Portrait', image_count: 1 },
        { id: '20261001-Red_Car', image_count: 0 },
      ]);
      expect(store.filteredProjects().length).toBe(3);
      store.projectFilter.set('  CAR ');
      expect(store.filteredProjects().map((p) => p.id)).toEqual([
        '20261008-Green_Car',
        '20261001-Red_Car',
      ]);
      store.projectFilter.set('xyz');
      expect(store.filteredProjects()).toEqual([]);
      store.projectFilter.set('   ');
      expect(store.filteredProjects().length).toBe(3);
    });
  });

  describe('job counters and next image number', () => {
    it('counts running/queued over all projects and pending of the selected project', () => {
      const { store } = setup();
      store.jobs.set([
        makeJob('a', 'done', 1),
        makeJob('b', 'running', null),
        makeJob('c', 'queued', null),
        makeJob('d', 'queued', null, '20261001-other'),
        makeJob('e', 'error', null),
      ]);
      expect(store.runningCount()).toBe(1);
      expect(store.queuedCount()).toBe(2);
      expect(store.projectPendingJobs()).toEqual([]);
      store.selectedProject.set(PID);
      expect(store.projectPendingJobs().map((j) => j.id)).toEqual(['b', 'c']);
    });

    it('nextImageNumber counts existing images and pending jobs of the project', () => {
      const { store } = setup();
      store.selectedProject.set(PID);
      expect(store.nextImageNumber()).toBe(1);
      store.images.set([1, 2, 10]);
      expect(store.nextImageNumber()).toBe(11);
      store.jobs.set([makeJob('b', 'running', null), makeJob('c', 'queued', null)]);
      expect(store.nextImageNumber()).toBe(13);
    });
  });

  describe('promptModified', () => {
    it('is true only when the form prompt differs from the selected image', async () => {
      const { store, api } = setup();
      expect(store.promptModified()).toBe(false);
      api.images[PID] = [1];
      api.settings[`${PID}/1`] = s({ prompt: 'car' }, null);
      await store.selectProject(PID);
      expect(store.promptModified()).toBe(false);
      store.form.update((f) => ({ ...f, prompt: 'car in rain' }));
      expect(store.promptModified()).toBe(true);
      store.settings.set(s({}, null));
      store.form.update((f) => ({ ...f, prompt: '' }));
      expect(store.promptModified()).toBe(false);
    });
  });

  describe('saveComment', () => {
    it('saves the comment of the selected image and updates settings', async () => {
      const { store, api } = setup();
      api.images[PID] = [1, 2];
      api.settings[`${PID}/1`] = s({ prompt: 'a' }, null);
      api.settings[`${PID}/2`] = s({ prompt: 'b' }, null);
      await store.selectProject(PID);
      const before = store.settings();
      await store.saveComment('zu dunkel');
      expect(api.comments).toEqual([[PID, 2, 'zu dunkel']]);
      expect(store.settings()?.comment).toBe('zu dunkel');
      expect(store.settings()).not.toBe(before);
    });

    it('does nothing without image or when unchanged', async () => {
      const { store, api } = setup();
      await store.saveComment('x');
      expect(api.calls).not.toContain('saveComment');
      api.images[PID] = [1];
      api.settings[`${PID}/1`] = { ...s({ prompt: 'a' }, null), comment: 'same' };
      await store.selectProject(PID);
      await store.saveComment('same');
      expect(api.calls).not.toContain('saveComment');
    });

    it('reports errors and keeps the old comment', async () => {
      const { store, api } = setup();
      api.images[PID] = [1];
      api.settings[`${PID}/1`] = s({ prompt: 'a' }, null);
      await store.selectProject(PID);
      api.failComment = true;
      await store.saveComment('x');
      expect(store.error()).toBe('zu lang');
      expect(store.settings()?.comment).toBe('');
    });
  });

  describe('deleteImage', () => {
    /** Project with images 1, 2, 3 (selected: 3, the newest) and distinct settings. */
    async function threeImages() {
      const ctx = setup();
      ctx.api.images[PID] = [1, 2, 3];
      ctx.api.settings[`${PID}/1`] = s({ prompt: 'one', steps: 1 }, null);
      ctx.api.settings[`${PID}/2`] = s({ prompt: 'two', steps: 2 }, null);
      ctx.api.settings[`${PID}/3`] = s({ prompt: 'three', steps: 3 }, null);
      await ctx.store.selectProject(PID);
      return ctx;
    }

    it('deletes another image: selection, form and unrendered changes stay', async () => {
      const { store, api } = await threeImages();
      store.form.update((f) => ({ ...f, prompt: 'edited' }));
      const asked: string[] = [];
      store.confirmFn = (m) => {
        asked.push(m);
        return true;
      };
      const version = store.imagesVersion();

      await store.deleteImage(1);

      expect(api.deleted).toEqual([`${PID}/1`]);
      expect(store.images()).toEqual([2, 3]);
      expect(store.selectedImage()).toBe(3);
      expect(store.form().prompt).toBe('edited');
      expect(store.formDirty()).toBe(true);
      expect(store.imagesVersion()).toBe(version + 1);
      expect(store.projects()[0].image_count).toBe(2);
      expect(asked).toEqual([]);
      // predecessor of 3 is now 2, not the deleted image
      expect(store.previousSettings()?.request).toEqual({ prompt: 'two', steps: 2 });
      expect(store.diff()).toEqual([{ path: 'steps', kind: 'changed', before: 2, after: 3 }]);
    });

    it('recomputes the predecessor when a non-selected predecessor is deleted', async () => {
      const ctx = setup();
      ctx.api.images[PID] = [1, 3, 5];
      ctx.api.settings[`${PID}/1`] = s({ prompt: 'one', steps: 1 }, null);
      ctx.api.settings[`${PID}/3`] = s({ prompt: 'three', steps: 3 }, null);
      ctx.api.settings[`${PID}/5`] = s({ prompt: 'five', steps: 5 }, null);
      await ctx.store.selectProject(PID);
      ctx.store.form.update((f) => ({ ...f, prompt: 'edited' }));

      await ctx.store.deleteImage(3);

      expect(ctx.store.images()).toEqual([1, 5]);
      expect(ctx.store.selectedImage()).toBe(5);
      // the diff now refers to image 1, not to the deleted image 3
      expect(ctx.store.previousSettings()?.request).toEqual({ prompt: 'one', steps: 1 });
      expect(ctx.store.diff()).toEqual([{ path: 'steps', kind: 'changed', before: 1, after: 5 }]);
      expect(ctx.store.form().prompt).toBe('edited');
      expect(ctx.store.formDirty()).toBe(true);
    });

    it('selects the next image and loads its request when the selected one is deleted', async () => {
      const { store } = await threeImages();
      await store.selectImage(2);

      await store.deleteImage(2);

      expect(store.images()).toEqual([1, 3]);
      expect(store.selectedImage()).toBe(3);
      expect(store.form()).toEqual({ prompt: 'three', steps: 3 });
      expect(store.formBaseline()).toEqual({ prompt: 'three', steps: 3 });
    });

    it('loads the successor request without asking, even with unrendered changes', async () => {
      const { store } = await threeImages();
      await store.selectImage(2);
      store.form.update((f) => ({ ...f, prompt: 'edited' }));
      const asked: string[] = [];
      store.confirmFn = (m) => {
        asked.push(m);
        return false;
      };

      await store.deleteImage(2);

      expect(asked).toEqual([]);
      expect(store.selectedImage()).toBe(3);
      expect(store.form()).toEqual({ prompt: 'three', steps: 3 });
      expect(store.formBaseline()).toEqual({ prompt: 'three', steps: 3 });
    });

    it('falls back to the previous image when the last one is deleted', async () => {
      const { store } = await threeImages();

      await store.deleteImage(3);

      expect(store.images()).toEqual([1, 2]);
      expect(store.selectedImage()).toBe(2);
      expect(store.form()).toEqual({ prompt: 'two', steps: 2 });
    });

    it('clears the image column but keeps the form when the only image is deleted', async () => {
      const ctx = setup();
      ctx.api.images[PID] = [1];
      ctx.api.settings[`${PID}/1`] = s({ prompt: 'only' }, null);
      await ctx.store.selectProject(PID);
      ctx.store.form.update((f) => ({ ...f, prompt: 'edited' }));

      await ctx.store.deleteImage(1);

      expect(ctx.store.images()).toEqual([]);
      expect(ctx.store.selectedImage()).toBeNull();
      expect(ctx.store.settings()).toBeNull();
      expect(ctx.store.previousSettings()).toBeNull();
      expect(ctx.store.diff()).toEqual([]);
      expect(ctx.store.form().prompt).toBe('edited');
    });

    it('reports server errors and changes nothing', async () => {
      const { store, api } = await threeImages();
      api.failDelete = true;

      await store.deleteImage(1);

      expect(store.error()).toBe('not found');
      expect(store.images()).toEqual([1, 2, 3]);
      expect(store.selectedImage()).toBe(3);
      expect(store.settings()?.request).toEqual({ prompt: 'three', steps: 3 });
    });

    it('does nothing without a selected project', async () => {
      const { store, api } = setup();

      await store.deleteImage(1);

      expect(api.deleted).toEqual([]);
    });
  });

  describe('clearQueue', () => {
    it('removes the finished jobs, reloads the queue and clears an old error', async () => {
      const { store, api } = setup();
      api.jobs = [
        makeJob('d', 'done', 1),
        makeJob('e', 'error', null),
        makeJob('r', 'running', null),
        makeJob('q', 'queued', null),
      ];
      await store.refreshJobs();
      store.error.set('old message');

      await store.clearQueue();

      expect(api.calls).toContain('clearQueue');
      expect(store.jobs().map((j) => j.id)).toEqual(['r', 'q']);
      expect(store.error()).toBeNull();
    });

    it('reports errors and keeps the queue unchanged', async () => {
      const { store, api } = setup();
      api.jobs = [makeJob('d', 'done', 1), makeJob('r', 'running', null)];
      await store.refreshJobs();
      api.failClear = true;

      await store.clearQueue();

      expect(store.error()).toBe('boom');
      expect(store.jobs().map((j) => j.id)).toEqual(['d', 'r']);
    });
  });

  describe('error paths through attempt() (#47)', () => {
    it('loadProjects reports a failure and keeps the old list', async () => {
      const { store, api } = setup();
      await store.loadProjects();
      api.projects = [];
      api.failNext = 'listProjects';

      await store.loadProjects();

      expect(store.error()).toBe('boom');
      expect(store.projects()).toEqual([{ id: PID, image_count: 0 }]);
    });

    it('createProject reports a failure and selects nothing', async () => {
      const { store, api } = setup();
      api.failNext = 'createProject';

      await store.createProject('Neu');

      expect(store.error()).toBe('boom');
      expect(store.selectedProject()).toBeNull();
    });

    it('deleteProject reports a failure and keeps the selection', async () => {
      const { store, api } = setup();
      await store.loadProjects();
      await store.selectProject(PID);
      api.failNext = 'deleteProject';

      await store.deleteProject(PID);

      expect(store.error()).toBe('boom');
      expect(store.selectedProject()).toBe(PID);
      expect(store.projects().map((p) => p.id)).toEqual([PID]);
    });

    it('submit reports a failure and leaves the form counted as unrendered', async () => {
      const { store, api } = setup();
      await store.selectProject(PID);
      store.form.set({ prompt: 'a car' });
      api.failNext = 'submitJob';

      await store.submit();

      expect(store.error()).toBe('boom');
      expect(api.submitted).toEqual([]);
      expect(store.formBaseline()).toEqual(DEFAULT_REQUEST);
      expect(store.formDirty()).toBe(true);
    });

    it('cancelJob reports a failure', async () => {
      const { store, api } = setup();
      api.failNext = 'cancelJob';

      await store.cancelJob('j1');

      expect(store.error()).toBe('boom');
    });

    it('openImage reports a failure and opens nothing', async () => {
      const { store, api } = setup();
      await store.selectProject(PID);
      api.failNext = 'openImage';

      await store.openImage(1);

      expect(store.error()).toBe('boom');
      expect(api.opened).toEqual([]);
    });

    it('does not report an error when the predecessor settings are missing', async () => {
      const { store, api } = setup();
      api.images[PID] = [1, 2];
      api.settings[`${PID}/2`] = s({ prompt: 'b' }, null);

      await store.selectProject(PID);

      expect(store.selectedImage()).toBe(2);
      expect(store.previousSettings()).toBeNull();
      expect(store.diff()).toEqual([]);
      expect(store.error()).toBeNull();
    });
  });

  describe('loadConfig', () => {
    it('loads the LoRA slots and applies their defaults to the empty form', async () => {
      const { store, api } = setup();
      expect(store.form()).toEqual(DEFAULT_REQUEST);

      await store.loadConfig();

      expect(api.calls).toContain('getConfig');
      expect(store.loras().map((l) => l.key)).toEqual(['lora_strength', 'lora2']);
      expect(store.form()).toEqual({ ...DEFAULT_REQUEST, lora_strength: 0.2, lora2: 1.35 });
      expect(store.formBaseline()).toEqual(store.form());
      expect(store.formBaseline()).not.toBe(store.form());
      expect(store.error()).toBeNull();
    });

    it('shows the warning of the server as error', async () => {
      const { store, api } = setup();
      api.config = { loras: [], warning: 'LoRA config loras.json: broken - using defaults' };

      await store.loadConfig();

      expect(store.error()).toBe('LoRA config loras.json: broken - using defaults');
      expect(store.loras()).toEqual([]);
    });

    it('does not touch a form that belongs to an image', async () => {
      const { store, api } = setup();
      api.images[PID] = [1];
      api.settings[`${PID}/1`] = s({ prompt: 'stored' }, null);
      await store.selectProject(PID);
      const before = store.form();

      await store.loadConfig();

      expect(store.form()).toEqual(before);
      expect(store.formBaseline()).toEqual(before);
      expect(store.loras()).toHaveLength(2);
    });

    it('reports server errors and leaves the LoRA list empty', async () => {
      const { store, api } = setup();
      api.failConfig = true;

      await store.loadConfig();

      expect(store.error()).toBe('nope');
      expect(store.loras()).toEqual([]);
      expect(store.form()).toEqual(DEFAULT_REQUEST);
    });

    it('builds the defaults from the configured LoRAs without mutating DEFAULT_REQUEST', () => {
      const { store } = setup();
      store.loras.set([{ key: 'lora3', label: 'Detail', default: 0.7, toggle: false }]);

      expect(store.defaultForm()).toEqual({ ...DEFAULT_REQUEST, lora3: 0.7 });
      expect(DEFAULT_REQUEST).not.toHaveProperty('lora3');
      expect(store.defaultForm()).not.toBe(store.defaultForm());
    });
  });
});

describe('errorMessage', () => {
  it('formats the different error kinds', () => {
    expect(errorMessage(new HttpErrorResponse({ status: 400, error: { detail: 'bad' } }))).toBe(
      'bad',
    );
    expect(errorMessage(new HttpErrorResponse({ status: 0 }))).toBe('Server not reachable');
    expect(
      errorMessage(new HttpErrorResponse({ status: 500, statusText: 'Server Error', error: 'x' })),
    ).toBe('HTTP 500: Server Error');
    expect(errorMessage(new Error('boom'))).toBe('boom');
    expect(errorMessage('plain')).toBe('plain');
  });
});
