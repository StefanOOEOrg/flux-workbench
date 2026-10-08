import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';

import { ApiService } from './api.service';
import { DEFAULT_REQUEST, ImageSettings, Job, RenderRequest } from './models';
import { WorkbenchStore, errorMessage } from './workbench.store';

const PID = '20261007-x';

/** In-memory fake of the server. */
class FakeApi {
  projects: string[] = [PID];
  images: Record<string, number[]> = { [PID]: [] };
  settings: Record<string, ImageSettings> = {};
  jobs: Job[] = [];
  calls: string[] = [];
  opened: [string, number][] = [];
  submitted: [string, RenderRequest][] = [];

  listProjects(): Observable<string[]> {
    this.calls.push('listProjects');
    return of([...this.projects]);
  }
  createProject(name: string): Observable<{ id: string }> {
    this.calls.push('createProject');
    const id = `20261007-${name}`;
    this.projects.unshift(id);
    this.images[id] = [];
    return of({ id });
  }
  deleteProject(id: string): Observable<void> {
    this.projects = this.projects.filter((p) => p !== id);
    return of(undefined);
  }
  listImages(id: string): Observable<number[]> {
    return of([...(this.images[id] ?? [])]);
  }
  getSettings(id: string, n: number): Observable<ImageSettings> {
    const s = this.settings[`${id}/${n}`];
    return s
      ? of(structuredClone(s))
      : throwError(() => new HttpErrorResponse({ status: 404, error: { detail: 'not found' } }));
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

function makeJob(id: string, status: Job['status'], image_n: number | null): Job {
  return { id, project_id: PID, request: {}, status, created_at: '', image_n, error: null };
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
    expect(store.projects()[0]).toBe('20261007-Neu');
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
    api.settings[`${PID}/1`] = { request: { prompt: 'a', steps: 1 }, effective: null };
    api.settings[`${PID}/2`] = { request: { prompt: 'b', steps: 2 }, effective: { seed: 9 } };
    await store.selectProject(PID);
    expect(store.images()).toEqual([1, 2]);
    expect(store.selectedImage()).toBe(2);
    expect(store.form()).toEqual({ prompt: 'b', steps: 2 });
  });

  it('diffs against the predecessor in the list, not n-1', async () => {
    const { store, api } = setup();
    api.images[PID] = [1, 3];
    api.settings[`${PID}/1`] = { request: {}, effective: { steps: 32, hires: { denoise: 0.4 } } };
    api.settings[`${PID}/3`] = { request: {}, effective: { steps: 40, hires: { denoise: 0.5 } } };
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
    api.settings[`${PID}/1`] = { request: { prompt: 'p', seed: null }, effective: { seed: 77 } };
    await store.selectProject(PID);
    store.form.set({ prompt: 'edited' });
    await store.selectImage(1);
    expect(store.form()).toEqual({ prompt: 'edited' });
    store.cloneSelected();
    expect(store.form()).toEqual({ prompt: 'p', seed: null });
    store.adoptSeed();
    expect(store.form().seed).toBe(77);
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
    api.settings[`${PID}/1`] = { request: { prompt: 'p' }, effective: null };
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
    api.settings[`${PID}/1`] = { request: { prompt: 'p' }, effective: null };
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
