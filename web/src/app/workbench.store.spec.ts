import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';

import { ApiService } from './api.service';
import { DEFAULT_REQUEST, ImageSettings, Job, ProjectInfo, RenderRequest } from './models';
import { WorkbenchStore, errorMessage } from './workbench.store';

const PID = '20261007-x';

/** Settings with an empty comment (shorthand for the fixtures below). */
function s(request: Record<string, unknown>, effective: Record<string, unknown> | null) {
  return { request, effective, comment: '' } satisfies ImageSettings;
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
  failComment = false;

  listProjects(): Observable<ProjectInfo[]> {
    this.calls.push('listProjects');
    return of(structuredClone(this.projects));
  }
  createProject(name: string): Observable<{ id: string }> {
    this.calls.push('createProject');
    const id = `20261007-${name}`;
    this.projects.unshift({ id, image_count: 0 });
    this.images[id] = [];
    return of({ id });
  }
  deleteProject(id: string): Observable<void> {
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
    this.opened.push([id, n]);
    return of(undefined);
  }
  imageUrl(id: string, n: number, v?: number): string {
    return `/api/projects/${id}/images/${n}${v === undefined ? '' : `?v=${v}`}`;
  }
  listJobs(): Observable<Job[]> {
    return of(structuredClone(this.jobs));
  }
  submitJob(id: string, request: RenderRequest): Observable<Job> {
    this.submitted.push([id, structuredClone(request)]);
    const job = makeJob('j' + this.submitted.length, 'queued', null);
    this.jobs.push(job);
    return of(job);
  }
  cancelJob(): Observable<void> {
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

  it('selecting a project with images selects the last one and clones its request', async () => {
    const { store, api } = setup();
    api.images[PID] = [1, 2];
    api.settings[`${PID}/1`] = s({ prompt: 'a', steps: 1 }, null);
    api.settings[`${PID}/2`] = { ...s({ prompt: 'b', steps: 2 }, { seed: 9 }), comment: 'gut' };
    await store.selectProject(PID);
    expect(store.images()).toEqual([1, 2]);
    expect(store.selectedImage()).toBe(2);
    expect(store.form()).toEqual({ prompt: 'b', steps: 2 });
  });

  it('diffs against the predecessor in the list, not n-1', async () => {
    const { store, api } = setup();
    api.images[PID] = [1, 3];
    api.settings[`${PID}/1`] = s({}, { steps: 32, hires: { denoise: 0.4 } });
    api.settings[`${PID}/3`] = s({}, { steps: 40, hires: { denoise: 0.5 } });
    await store.selectProject(PID);
    await store.selectImage(3);
    expect(store.diff()).toEqual([
      { path: 'hires.denoise', kind: 'changed', before: 0.4, after: 0.5 },
      { path: 'steps', kind: 'changed', before: 32, after: 40 },
    ]);
    await store.selectImage(1);
    expect(store.diff()).toEqual([]);
  });

  it('selectImage does not change the form; clone and adoptSeed do', async () => {
    const { store, api } = setup();
    api.images[PID] = [1];
    api.settings[`${PID}/1`] = s({ prompt: 'p', seed: null }, { seed: 77 });
    await store.selectProject(PID);
    store.form.set({ prompt: 'edited' });
    await store.selectImage(1);
    expect(store.form()).toEqual({ prompt: 'edited' });
    store.cloneSelected();
    expect(store.form()).toEqual({ prompt: 'p', seed: null });
    store.adoptSeed();
    expect(store.form().seed).toBe(77);
  });

  it('cloning never copies the comment into the form', async () => {
    const { store, api } = setup();
    api.images[PID] = [3];
    api.settings[`${PID}/3`] = { ...s({ prompt: 'p' }, null), comment: 'Bus verwaschen' };
    await store.selectProject(PID);
    store.cloneSelected();
    expect(store.form()).toEqual({ prompt: 'p' });
    expect(JSON.stringify(store.form())).not.toContain('Bus verwaschen');
  });

  it('submit sends the form for the selected project and validates', async () => {
    const { store, api } = setup();
    await store.submit();
    expect(store.error()).toBe('Kein Projekt ausgewählt');
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
        { id: '20261008-Gruenes_Auto', image_count: 3 },
        { id: '20261006-Portrait', image_count: 1 },
        { id: '20261001-Auto_Rot', image_count: 0 },
      ]);
      expect(store.filteredProjects().length).toBe(3);
      store.projectFilter.set('  AUTO ');
      expect(store.filteredProjects().map((p) => p.id)).toEqual([
        '20261008-Gruenes_Auto',
        '20261001-Auto_Rot',
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
});

describe('errorMessage', () => {
  it('formats the different error kinds', () => {
    expect(errorMessage(new HttpErrorResponse({ status: 400, error: { detail: 'bad' } }))).toBe(
      'bad',
    );
    expect(errorMessage(new HttpErrorResponse({ status: 0 }))).toBe('Server nicht erreichbar');
    expect(
      errorMessage(new HttpErrorResponse({ status: 500, statusText: 'Server Error', error: 'x' })),
    ).toBe('HTTP 500: Server Error');
    expect(errorMessage(new Error('boom'))).toBe('boom');
    expect(errorMessage('plain')).toBe('plain');
  });
});
