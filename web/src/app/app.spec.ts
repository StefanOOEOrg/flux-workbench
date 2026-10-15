import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { App, POLL_MS } from './app';
import { WorkbenchStore } from './workbench.store';

describe('App', () => {
  afterEach(() => vi.useRealTimers());

  it('loads projects and polls the queue until destroyed', () => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ imports: [App] });
    const store = TestBed.inject(WorkbenchStore);
    const load = vi.spyOn(store, 'loadProjects').mockResolvedValue();
    const refresh = vi.spyOn(store, 'refreshJobs').mockResolvedValue();

    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    expect(load).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(POLL_MS * 2);
    expect(refresh).toHaveBeenCalledTimes(3);

    fixture.destroy();
    vi.advanceTimersByTime(POLL_MS * 2);
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it('shows and dismisses errors', () => {
    TestBed.configureTestingModule({ imports: [App] });
    const store = TestBed.inject(WorkbenchStore);
    vi.spyOn(store, 'loadProjects').mockResolvedValue();
    vi.spyOn(store, 'refreshJobs').mockResolvedValue();
    const fixture = TestBed.createComponent(App);
    store.error.set('kaputt');
    fixture.detectChanges();
    const box = fixture.nativeElement.querySelector('[data-testid="error"]') as HTMLElement;
    expect(box.textContent).toContain('kaputt');
    box.querySelector('button')!.click();
    expect(store.error()).toBeNull();
    fixture.destroy();
  });

  function shell() {
    TestBed.configureTestingModule({ imports: [App] });
    const store = TestBed.inject(WorkbenchStore);
    vi.spyOn(store, 'loadProjects').mockResolvedValue();
    vi.spyOn(store, 'refreshJobs').mockResolvedValue();
    const fixture = TestBed.createComponent(App);
    const el = fixture.nativeElement as HTMLElement;
    const one = (id: string) => el.querySelector(`[data-testid="${id}"]`) as HTMLElement;
    return { store, fixture, el, one };
  }

  it('shows project name and queue status in the top bar', () => {
    const { store, fixture, one } = shell();
    store.selectedProject.set('20261008-Green_Car');
    store.jobs.set([
      {
        id: 'r',
        project_id: 'x',
        request: {},
        status: 'running',
        created_at: '',
        image_n: null,
        error: null,
      },
      {
        id: 'q',
        project_id: 'x',
        request: {},
        status: 'queued',
        created_at: '',
        image_n: null,
        error: null,
      },
      {
        id: 'w',
        project_id: 'y',
        request: {},
        status: 'queued',
        created_at: '',
        image_n: null,
        error: null,
      },
    ]);
    fixture.detectChanges();
    expect(one('crumb').textContent).toContain('Green_Car');
    expect(one('crumb').textContent).not.toContain('20261008');
    expect(one('status').textContent!.replace(/\s+/g, ' ').trim()).toBe('1 running · 2 queued');
    fixture.destroy();
  });

  it('renders all panels and the page itself never scrolls (bug fix #11)', () => {
    const { fixture, el, one } = shell();
    fixture.detectChanges();
    for (const tag of [
      'app-project-list',
      'app-queue-panel',
      'app-thumbnail-strip',
      'app-image-panel',
      'app-param-form',
      'app-prompt-panel',
    ]) {
      expect(el.querySelector(tag), tag).not.toBeNull();
    }
    const cols = one('cols');
    expect(Array.from(cols.children).map((c) => c.tagName.toLowerCase())).toEqual([
      'app-image-panel',
      'app-param-form',
      'app-prompt-panel',
    ]);
    const host = getComputedStyle(el);
    expect(host.display).toBe('grid');
    expect(host.overflow).toBe('hidden');
    // jsdom resolves `100vh` to px (= window.innerHeight), so compare against that.
    expect(host.height).toBe(`${window.innerHeight}px`);
    // The error bar is optional (@if): main must be pinned to the 1fr row 3, otherwise it
    // slides into the `auto` row 2 and the columns collapse to their content height.
    const main = el.querySelector('main.app') as HTMLElement;
    expect(getComputedStyle(main).gridRow).toBe('3');
    fixture.destroy();
  });

  it('keeps main in row 3 when the error bar is shown', () => {
    const { store, fixture, el } = shell();
    store.error.set('kaputt');
    fixture.detectChanges();
    const error = el.querySelector('[data-testid="error"]') as HTMLElement;
    expect(getComputedStyle(error).gridRow).toBe('2');
    expect(getComputedStyle(el.querySelector('main.app') as HTMLElement).gridRow).toBe('3');
    fixture.destroy();
  });
});
