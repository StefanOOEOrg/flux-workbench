import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { Job } from './models';
import { ParamForm } from './param-form/param-form';
import { ProjectList } from './project-list/project-list';
import { QueuePanel } from './queue-panel/queue-panel';
import { SettingsPanel } from './settings-panel/settings-panel';
import { ThumbnailStrip } from './thumbnail-strip/thumbnail-strip';
import { WorkbenchStore } from './workbench.store';

/**
 * Component tests run against the real store with its async methods spied,
 * so they only check wiring + rendering, not server logic.
 */
function render<T>(component: Type<T>) {
  TestBed.configureTestingModule({ imports: [component] });
  const store = TestBed.inject(WorkbenchStore);
  const fixture = TestBed.createComponent(component);
  const el = fixture.nativeElement as HTMLElement;
  const all = (id: string) => Array.from(el.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`));
  const one = (id: string) => all(id)[0];
  return { store, fixture, el, all, one };
}

describe('ProjectList', () => {
  it('lists projects, selects, creates and deletes with confirmation', async () => {
    const { store, fixture, all, one } = render(ProjectList);
    const select = vi.spyOn(store, 'selectProject').mockResolvedValue();
    const create = vi.spyOn(store, 'createProject').mockResolvedValue();
    const del = vi.spyOn(store, 'deleteProject').mockResolvedValue();
    store.projects.set(['20261007-b', '20261006-a']);
    store.selectedProject.set('20261006-a');
    fixture.detectChanges();

    const rows = all('project');
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining('20261007-b'),
      expect.stringContaining('20261006-a'),
    ]);
    expect(rows[1].classList).toContain('selected');

    rows[0].click();
    expect(select).toHaveBeenCalledWith('20261007-b');

    const input = one('new-name') as HTMLInputElement;
    input.value = 'Neu';
    input.dispatchEvent(new Event('input'));
    one('create').click();
    await fixture.whenStable();
    expect(create).toHaveBeenCalledWith('Neu');

    fixture.componentInstance.confirmFn = () => false;
    all('delete')[0].click();
    await fixture.whenStable();
    expect(del).not.toHaveBeenCalled();
    expect(select).toHaveBeenCalledTimes(1); // delete click does not select

    fixture.componentInstance.confirmFn = () => true;
    all('delete')[0].click();
    await fixture.whenStable();
    expect(del).toHaveBeenCalledWith('20261007-b');
  });
});

describe('ThumbnailStrip', () => {
  it('shows thumbnails in order; click selects, double click opens', () => {
    const { store, fixture, all } = render(ThumbnailStrip);
    const select = vi.spyOn(store, 'selectImage').mockResolvedValue();
    const open = vi.spyOn(store, 'openImage').mockResolvedValue();
    store.selectedProject.set('20261007-x');
    store.images.set([1, 2, 10]);
    store.selectedImage.set(2);
    fixture.detectChanges();

    const thumbs = all('thumb');
    expect(thumbs.map((t) => t.querySelector('figcaption')!.textContent!.trim())).toEqual([
      '1',
      '2',
      '10',
    ]);
    expect(thumbs[0].querySelector('img')!.getAttribute('src')).toContain(
      '/api/projects/20261007-x/images/1',
    );
    expect(thumbs[1].classList).toContain('selected');

    thumbs[2].click();
    expect(select).toHaveBeenCalledWith(10);
    thumbs[0].dispatchEvent(new MouseEvent('dblclick'));
    expect(open).toHaveBeenCalledWith(1);
  });
});

describe('SettingsPanel', () => {
  it('shows settings, highlights and lists the diff, clone and seed buttons', () => {
    const { store, fixture, el, all, one } = render(SettingsPanel);
    const clone = vi.spyOn(store, 'cloneSelected');
    const seed = vi.spyOn(store, 'adoptSeed');
    store.images.set([1, 2]);
    store.selectedImage.set(2);
    store.settings.set({ request: { steps: 40 }, effective: { steps: 40, seed: 7, prompt: 'p' } });
    store.diff.set([{ path: 'steps', kind: 'changed', before: 32, after: 40 }]);
    fixture.detectChanges();

    expect(all('diff-entry').map((e) => e.textContent!.trim())).toEqual(['steps: 32 → 40']);
    expect(el.querySelector('tr.changed')!.textContent).toContain('steps');
    one('clone').click();
    one('adopt-seed').click();
    expect(clone).toHaveBeenCalled();
    expect(seed).toHaveBeenCalled();
  });

  it('formats diff lines', () => {
    const { fixture } = render(SettingsPanel);
    const panel = fixture.componentInstance;
    expect(panel.formatDiff({ path: 'a', kind: 'added', after: 'x' })).toBe('a: neu x');
    expect(panel.formatDiff({ path: 'h', kind: 'removed', before: { s: 1 } })).toBe(
      'h: entfernt (war {"s":1})',
    );
    expect(panel.formatValue(undefined)).toBe('–');
  });
});

describe('ParamForm', () => {
  it('edits the store form immutably', () => {
    const { store, fixture } = render(ParamForm);
    const form = fixture.componentInstance;
    store.form.set({ prompt: 'p', seed: 5, preset: 'fast', hires: true });
    const before = store.form();

    form.setNumber('steps', '20');
    form.setNumber('seed', '');
    form.setNumber('guidance', 'abc');
    form.setText('preset', '');
    form.setHiresEnabled(true);
    form.setHires('scale', '2');
    form.setFaceFixEnabled(false);
    form.setHandFix(false);
    form.setLora2('1.1');

    expect(store.form()).toEqual({
      prompt: 'p',
      seed: null,
      steps: 20,
      hires: { scale: 2, denoise: 0.4, steps: 25 },
      face_fix: false,
      hand_fix: false,
      lora2: 1.1,
    });
    expect(before).toEqual({ prompt: 'p', seed: 5, preset: 'fast', hires: true });
  });

  it('renders controls and submits', () => {
    const { store, fixture, one } = render(ParamForm);
    const submit = vi.spyOn(store, 'submit').mockResolvedValue();
    fixture.detectChanges();
    expect((one('submit') as HTMLButtonElement).disabled).toBe(true);
    expect((one('f-prompt') as HTMLTextAreaElement).value).toBe(
      'A green car on the road in London',
    );
    expect(one('f-hires-scale')).toBeTruthy();

    store.selectedProject.set('20261007-x');
    fixture.detectChanges();
    one('submit').click();
    expect(submit).toHaveBeenCalled();

    const steps = one('f-steps') as HTMLInputElement;
    steps.value = '12';
    steps.dispatchEvent(new Event('input'));
    expect(store.form().steps).toBe(12);
  });

  it('never triggers a native form submit (would reload the page)', () => {
    const { store, fixture, el } = render(ParamForm);
    vi.spyOn(store, 'submit').mockResolvedValue();
    store.selectedProject.set('20261007-x');
    fixture.detectChanges();
    const buttons = Array.from(el.querySelectorAll('button'));
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) {
      expect(button.type).toBe('button');
    }
  });

  it('selects show the current form values', () => {
    const { store, fixture, one } = render(ParamForm);
    fixture.detectChanges();
    expect((one('f-model') as HTMLSelectElement).value).toBe('flux-lora');
    expect((one('f-preset') as HTMLSelectElement).value).toBe('realistic');

    store.form.update((f) => ({ ...f, preset: 'fast', model: 'flux' }));
    fixture.detectChanges();
    expect((one('f-model') as HTMLSelectElement).value).toBe('flux');
    expect((one('f-preset') as HTMLSelectElement).value).toBe('fast');

    store.form.update((f) => {
      const next = { ...f };
      delete next.preset;
      return next;
    });
    fixture.detectChanges();
    expect((one('f-preset') as HTMLSelectElement).value).toBe('');
  });
});

describe('QueuePanel', () => {
  const job = (id: string, status: Job['status'], image_n: number | null = null): Job => ({
    id,
    project_id: '20261007-x',
    request: { prompt: 'car ' + id },
    status,
    created_at: '',
    image_n,
    error: status === 'error' ? 'HTTP 400: bad' : null,
  });

  it('shows newest first, hides cancelled, keeps 5 done, cancels queued', () => {
    const { store, fixture, all } = render(QueuePanel);
    const cancel = vi.spyOn(store, 'cancelJob').mockResolvedValue();
    const done = [1, 2, 3, 4, 5, 6].map((i) => job('d' + i, 'done', i));
    store.jobs.set([
      ...done,
      job('e', 'error'),
      job('c', 'cancelled'),
      job('r', 'running'),
      job('q', 'queued'),
    ]);
    fixture.detectChanges();

    const ids = fixture.componentInstance.visibleJobs().map((j) => j.id);
    expect(ids).toEqual(['q', 'r', 'e', 'd6', 'd5', 'd4', 'd3', 'd2']);
    const rows = all('job');
    expect(rows[0].textContent).toContain('Wartet');
    expect(rows[2].textContent).toContain('HTTP 400: bad');
    expect(rows[3].textContent).toContain('Fertig (#6)');
    expect(all('cancel')).toHaveLength(1);
    all('cancel')[0].click();
    expect(cancel).toHaveBeenCalledWith('q');
  });
});
