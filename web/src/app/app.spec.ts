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
});
