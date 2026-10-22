import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { ImagePanel } from './image-panel/image-panel';
import { DEFAULT_REQUEST, Job, SAMPLERS, SCHEDULERS } from './models';
import { ParamForm } from './param-form/param-form';
import { ProjectList } from './project-list/project-list';
import { PromptPanel } from './prompt-panel/prompt-panel';
import { QueuePanel } from './queue-panel/queue-panel';
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

function job(
  id: string,
  status: Job['status'],
  image_n: number | null = null,
  project_id = '20261007-x',
): Job {
  return {
    id,
    project_id,
    request: { prompt: 'car ' + id },
    status,
    created_at: '',
    image_n,
    error: status === 'error' ? 'HTTP 400: bad' : null,
  };
}

/** Every `<button>` must be `type="button"`, and there is no `<form>` (no page reload). */
function expectNoSubmitButtons(el: HTMLElement): void {
  for (const button of Array.from(el.querySelectorAll('button'))) {
    expect(button.type).toBe('button');
  }
  expect(el.querySelector('form')).toBeNull();
}

describe('ProjectList', () => {
  it('shows name, date, image count; selects, creates and deletes with confirmation', async () => {
    const { store, fixture, all, one } = render(ProjectList);
    const select = vi.spyOn(store, 'selectProject').mockResolvedValue();
    const create = vi.spyOn(store, 'createProject').mockResolvedValue();
    const del = vi.spyOn(store, 'deleteProject').mockResolvedValue();
    store.projects.set([
      { id: '20261007-Green_Car', image_count: 1 },
      { id: '20261006-Portrait', image_count: 12 },
    ]);
    store.selectedProject.set('20261006-Portrait');
    fixture.detectChanges();

    expect(one('project-count').textContent!.trim()).toBe('2');
    const rows = all('project');
    expect(rows[0].textContent).toContain('Green_Car');
    expect(rows[0].textContent).toContain('07.10.2026');
    expect(rows[0].textContent).toContain('1 image');
    expect(rows[0].textContent).not.toContain('20261007-');
    expect(rows[1].textContent).toContain('12 images');
    expect(rows[1].classList).toContain('selected');

    rows[0].click();
    expect(select).toHaveBeenCalledWith('20261007-Green_Car');

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
    expect(del).toHaveBeenCalledWith('20261007-Green_Car');
    expectNoSubmitButtons(fixture.nativeElement);
  });

  it('filters the list via the filter field', () => {
    const { store, fixture, all, one, el } = render(ProjectList);
    store.projects.set([
      { id: '20261008-Green_Car', image_count: 3 },
      { id: '20261006-Portrait', image_count: 1 },
    ]);
    fixture.detectChanges();
    const filter = one('filter') as HTMLInputElement;
    filter.value = 'car';
    filter.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(store.projectFilter()).toBe('car');
    expect(all('project')).toHaveLength(1);

    filter.value = 'xyz';
    filter.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(all('project')).toHaveLength(0);
    expect(el.textContent).toContain('No match');
  });

  it('only the list scrolls (heading, input and filter stay visible)', () => {
    const { store, fixture, el } = render(ProjectList);
    store.projects.set([{ id: '20261008-a', image_count: 0 }]);
    fixture.detectChanges();
    const list = el.querySelector('.projects') as HTMLElement;
    expect(getComputedStyle(list).overflowY).toBe('auto');
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

  it('adds placeholder tiles for pending jobs of the selected project', () => {
    const { store, fixture, all } = render(ThumbnailStrip);
    store.selectedProject.set('20261007-x');
    store.images.set([1]);
    store.jobs.set([
      job('r', 'running'),
      job('q', 'queued'),
      job('o', 'queued', null, '20261001-other'),
      job('d', 'done', 1),
    ]);
    fixture.detectChanges();
    const pending = all('pending');
    expect(pending).toHaveLength(2);
    expect(pending[0].textContent).toContain('running');
    expect(pending[1].textContent).toContain('queued');
  });

  it('right click opens a delete menu that deletes without confirmation', async () => {
    const { store, fixture, all, one } = render(ThumbnailStrip);
    const del = vi.spyOn(store, 'deleteImage').mockResolvedValue();
    store.selectedProject.set('20261007-x');
    store.images.set([1, 2]);
    store.selectedImage.set(1);
    fixture.detectChanges();
    expect(all('context-menu')).toHaveLength(0);

    const event = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 120,
      clientY: 40,
    });
    all('thumb')[1].dispatchEvent(event);
    fixture.detectChanges();

    expect(event.defaultPrevented).toBe(true);
    const menu = one('context-menu');
    expect(menu.style.left).toBe('120px');
    expect(menu.style.top).toBe('40px');
    expect(menu.textContent).toContain('Delete image');
    expect(store.selectedImage()).toBe(1); // a right click never changes the selection

    one('context-delete').click();
    await fixture.whenStable();
    expect(del).toHaveBeenCalledWith(2);
    fixture.detectChanges();
    expect(all('context-menu')).toHaveLength(0);
    expectNoSubmitButtons(fixture.nativeElement);
  });

  it('closes the delete menu with Esc and with a click outside', async () => {
    const { store, fixture, all, one } = render(ThumbnailStrip);
    store.selectedProject.set('20261007-x');
    store.images.set([1]);
    fixture.detectChanges();

    const openMenu = () => {
      all('thumb')[0].dispatchEvent(
        new MouseEvent('contextmenu', { bubbles: true, cancelable: true }),
      );
      fixture.detectChanges();
      expect(all('context-menu')).toHaveLength(1);
    };

    openMenu();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(all('context-menu')).toHaveLength(0);

    openMenu();
    one('context-backdrop').click();
    fixture.detectChanges();
    expect(all('context-menu')).toHaveLength(0);
  });
});

describe('ImagePanel', () => {
  function withImage() {
    const ctx = render(ImagePanel);
    ctx.store.selectedProject.set('20261007-x');
    ctx.store.images.set([1, 4, 5]);
    ctx.store.selectedImage.set(5);
    ctx.store.previousSettings.set({
      request: { prompt: 'a red car', negative: '' },
      effective: null,
      comment: '',
      render_seconds: null,
    });
    ctx.store.settings.set({
      request: { steps: 40, prompt: 'a green car', negative: 'blurry' },
      effective: { steps: 40, seed: 482913, prompt: 'a green car' },
      comment: 'zu dunkel',
      render_seconds: 161.4,
    });
    ctx.store.diff.set([
      { path: 'steps', kind: 'changed', before: 32, after: 40 },
      { path: 'hand_fix', kind: 'added', after: true },
      { path: 'lora2', kind: 'removed', before: 1.35 },
    ]);
    ctx.fixture.detectChanges();
    return ctx;
  }

  it('shows image, seed, render time, predecessor and diff chips', () => {
    const { el, all, one, fixture } = withImage();
    expect(el.textContent).toContain('Image 5');
    expect(el.textContent).toContain('Seed 482913');
    expect(one('render-time').textContent).toContain('2:41 min');
    expect(el.textContent).toContain('Changes from image 4');
    expect(fixture.componentInstance.previous()).toBe(4);

    const chips = all('diff-entry');
    expect(chips).toHaveLength(3);
    expect(chips[0].classList).toContain('changed');
    expect(chips[0].querySelector('[data-testid="diff-path"]')!.textContent).toBe('steps');
    expect(chips[0].querySelector('[data-testid="diff-before"]')!.textContent).toBe('32');
    expect(chips[0].querySelector('[data-testid="diff-after"]')!.textContent).toBe('40');
    expect(chips[0].getAttribute('title')).toBe('steps: 32 → 40');
    expect(chips[1].classList).toContain('added');
    expect(chips[1].querySelector('[data-testid="diff-before"]')).toBeNull();
    expect(chips[2].classList).toContain('removed');
    expect(chips[2].querySelector('[data-testid="diff-after"]')).toBeNull();
  });

  it('shows "–" when the render time was not measured', () => {
    const { store, one, fixture } = withImage();
    store.settings.update((st) => ({ ...st!, render_seconds: null }));
    fixture.detectChanges();
    expect(one('render-time').textContent).toContain('–');
  });

  it('shows the prompt and negative prompt as word diff', () => {
    const { one } = withImage();
    const words = (id: string) =>
      Array.from(one(id).querySelectorAll('span')).map((s) => [s.className, s.textContent!.trim()]);
    expect(words('prompt-diff')).toEqual([
      ['same', 'a'],
      ['removed', 'red'],
      ['added', 'green'],
      ['same', 'car'],
    ]);
    expect(words('negative-diff')).toEqual([['added', 'blurry']]);
  });

  it('shows "empty" for an empty negative prompt', () => {
    const { store, one, fixture } = withImage();
    store.settings.update((st) => ({ ...st!, request: { prompt: 'a car', negative: '' } }));
    store.previousSettings.set(null);
    fixture.detectChanges();
    expect(one('negative-diff').textContent!.trim()).toBe('empty');
  });

  it('has no clone button any more; seed button calls the store', () => {
    const { store, one, fixture } = withImage();
    expect(one('clone')).toBeUndefined();
    const seed = vi.spyOn(store, 'adoptSeed');
    one('adopt-seed').click();
    expect(seed).toHaveBeenCalled();
    expectNoSubmitButtons(fixture.nativeElement);
  });

  it('opens the large view from the preview and closes it with Esc, backdrop or button', () => {
    const { one, fixture } = withImage();
    const preview = one('preview') as HTMLImageElement;
    expect(preview.getAttribute('src')).toContain('/api/projects/20261007-x/images/5');
    expect(one('lightbox')).toBeUndefined();

    preview.click();
    fixture.detectChanges();
    const box = one('lightbox');
    expect(box.querySelector('img')!.getAttribute('src')).toContain('/images/5');

    box.querySelector('img')!.click(); // click on the image itself keeps it open
    fixture.detectChanges();
    expect(one('lightbox')).toBeTruthy();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(one('lightbox')).toBeUndefined();

    one('preview').click();
    fixture.detectChanges();
    one('lightbox').click();
    fixture.detectChanges();
    expect(one('lightbox')).toBeUndefined();

    one('preview').click();
    fixture.detectChanges();
    one('lightbox-close').click();
    fixture.detectChanges();
    expect(one('lightbox')).toBeUndefined();
    expectNoSubmitButtons(fixture.nativeElement);
  });

  it('the large view covers the whole window', () => {
    const { one, fixture } = withImage();
    one('preview').click();
    fixture.detectChanges();
    const style = getComputedStyle(one('lightbox'));
    expect(style.position).toBe('fixed');
  });

  it('first image shows "First image" and no predecessor heading', () => {
    const { store, fixture, el } = withImage();
    store.selectedImage.set(1);
    store.diff.set([]);
    fixture.detectChanges();
    expect(fixture.componentInstance.previous()).toBeNull();
    expect(el.textContent).toContain('First image');
    expect(el.textContent).not.toContain('Changes from image');
  });

  it('edits and saves the comment on blur', async () => {
    const { store, one, fixture } = withImage();
    const save = vi.spyOn(store, 'saveComment').mockResolvedValue();
    const area = one('comment') as HTMLTextAreaElement;
    expect(area.value).toBe('zu dunkel');
    expect(one('comment-state').textContent!.trim()).toBe('· saved');

    area.value = 'heller machen';
    area.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(one('comment-state').textContent!.trim()).toBe('· ungespeichert');

    area.dispatchEvent(new Event('blur'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(save).toHaveBeenCalledWith('heller machen');
    expect(fixture.componentInstance.commentDirty()).toBe(false);
  });

  it('keeps the comment marked unsaved when saving fails', async () => {
    const { store, one, fixture } = withImage();
    vi.spyOn(store, 'saveComment').mockImplementation(async () => {
      store.error.set('zu lang');
    });
    const area = one('comment') as HTMLTextAreaElement;
    area.dispatchEvent(new Event('input'));
    area.dispatchEvent(new Event('blur'));
    await fixture.whenStable();
    expect(fixture.componentInstance.commentDirty()).toBe(true);
  });

  it('settings table is collapsed by default and marks changed rows', () => {
    const { el } = withImage();
    const details = el.querySelector('details.all') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(el.querySelector('tr.changed')!.textContent).toContain('steps');
  });

  it('formats diff lines', () => {
    const { fixture } = render(ImagePanel);
    const panel = fixture.componentInstance;
    expect(panel.formatDiff({ path: 'a', kind: 'added', after: 'x' })).toBe('a: new x');
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

  it('removes sampler/scheduler on empty selection', () => {
    const { store, fixture } = render(ParamForm);
    const form = fixture.componentInstance;
    form.setText('sampler', '');
    form.setText('scheduler', '');
    expect('sampler' in store.form()).toBe(false);
    expect('scheduler' in store.form()).toBe(false);
    form.setText('sampler', 'euler');
    expect(store.form().sampler).toBe('euler');
  });

  it('switches lora2 on and off', () => {
    const { store, fixture } = render(ParamForm);
    const form = fixture.componentInstance;
    form.setLora2Enabled(false);
    expect(store.form().lora2).toBe(false);
    form.setLora2Enabled(true);
    expect(store.form().lora2).toBe(1.35);
    form.setLora2('0.8');
    form.setLora2Enabled(true);
    expect(store.form().lora2).toBe(0.8);
  });

  it('helpers isOn and extraOption', () => {
    const { fixture } = render(ParamForm);
    const form = fixture.componentInstance;
    expect([true, 1.2, 0, { a: 1 }].map((v) => form.isOn(v))).toEqual([true, true, true, true]);
    expect([false, undefined, null].map((v) => form.isOn(v))).toEqual([false, false, false]);
    expect(form.extraOption('my_sampler', SAMPLERS)).toBe('my_sampler');
    expect(form.extraOption('euler', SAMPLERS)).toBeNull();
    expect(form.extraOption('', SAMPLERS)).toBeNull();
    expect(form.extraOption(undefined, SCHEDULERS)).toBeNull();
  });

  it('summarises every group', () => {
    const { store, fixture } = render(ParamForm);
    const form = fixture.componentInstance;
    store.form.set(structuredClone(DEFAULT_REQUEST));
    expect(form.groupSummary('model')).toBe('flux-lora · realistic · 1024×1024');
    expect(form.groupSummary('sampling')).toBe('32 steps · g 1.8 · Seed random · dpmpp_2m · beta');
    expect(form.groupSummary('fixes')).toBe('Hires 1.5× · Face · Hand');
    expect(form.groupSummary('lora')).toBe('LoRA 1 0.2 · LoRA 2 1.35');

    store.form.set({
      prompt: 'p',
      seed: 7,
      hires: false,
      face_fix: false,
      hand_fix: false,
      lora2: false,
    });
    expect(form.groupSummary('model')).toBe('Defaults');
    expect(form.groupSummary('sampling')).toBe('Seed 7');
    expect(form.groupSummary('fixes')).toBe('aus');
    expect(form.groupSummary('lora')).toBe('aus');
  });

  it('renders closed groups with summaries and selects for sampler/scheduler', () => {
    const { store, fixture, el, one } = render(ParamForm);
    fixture.detectChanges();
    const groups = Array.from(el.querySelectorAll<HTMLDetailsElement>('details.group'));
    expect(groups.map((g) => g.dataset['testid'])).toEqual([
      'group-model',
      'group-sampling',
      'group-fixes',
      'group-lora',
    ]);
    expect(groups.every((g) => !g.open)).toBe(true);
    expect(one('sum-model').textContent).toContain('flux-lora');

    const sampler = one('f-sampler') as HTMLSelectElement;
    expect(sampler.tagName).toBe('SELECT');
    expect(sampler.value).toBe('dpmpp_2m');
    expect(sampler.options.length).toBe(SAMPLERS.length + 1);
    expect((one('f-scheduler') as HTMLSelectElement).value).toBe('beta');

    store.form.update((f) => ({ ...f, sampler: 'my_sampler' }));
    fixture.detectChanges();
    expect((one('f-sampler') as HTMLSelectElement).value).toBe('my_sampler');
  });

  it('selects show the current model and preset', () => {
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

  it('shows sub-fields only when the switch is on', () => {
    const { store, fixture, one } = render(ParamForm);
    fixture.detectChanges();
    expect(one('f-hires-scale')).toBeTruthy();
    expect(one('f-lora2')).toBeTruthy();

    store.form.update((f) => ({ ...f, hires: false, lora2: false }));
    fixture.detectChanges();
    expect(one('f-hires-scale')).toBeUndefined();
    expect(one('f-lora2')).toBeUndefined();
    expect((one('f-hires') as HTMLInputElement).checked).toBe(false);
    expect((one('f-lora2-on') as HTMLInputElement).checked).toBe(false);

    const steps = one('f-steps') as HTMLInputElement;
    steps.value = '12';
    steps.dispatchEvent(new Event('input'));
    expect(store.form().steps).toBe(12);
  });

  it('has no prompt fields, no render button and no submit buttons', () => {
    const { fixture, one } = render(ParamForm);
    fixture.detectChanges();
    expect(one('f-prompt')).toBeUndefined();
    expect(one('f-negative')).toBeUndefined();
    expect(one('submit')).toBeUndefined();
    expectNoSubmitButtons(fixture.nativeElement);
  });
});

describe('PromptPanel', () => {
  it('edits prompt and negative prompt', () => {
    const { store, fixture, one } = render(PromptPanel);
    fixture.detectChanges();
    const prompt = one('f-prompt') as HTMLTextAreaElement;
    expect(prompt.value).toBe(DEFAULT_REQUEST.prompt);
    prompt.value = 'A red bus';
    prompt.dispatchEvent(new Event('input'));
    expect(store.form().prompt).toBe('A red bus');

    const neg = one('f-negative') as HTMLTextAreaElement;
    neg.value = 'blurry';
    neg.dispatchEvent(new Event('input'));
    expect(store.form().negative).toBe('blurry');
    neg.value = '';
    neg.dispatchEvent(new Event('input'));
    expect(store.form().negative).toBe('');
  });

  it('render button shows the next number, is disabled without project and submits', () => {
    const { store, fixture, one } = render(PromptPanel);
    const submit = vi.spyOn(store, 'submit').mockResolvedValue();
    fixture.detectChanges();
    expect((one('submit') as HTMLButtonElement).disabled).toBe(true);

    store.selectedProject.set('20261007-x');
    store.images.set([1, 2]);
    fixture.detectChanges();
    expect(one('submit').textContent).toContain('image 3');
    one('submit').click();
    expect(submit).toHaveBeenCalled();
    expectNoSubmitButtons(fixture.nativeElement);
  });

  it('shows "modified" only when the prompt differs from the selected image', () => {
    const { store, fixture, one } = render(PromptPanel);
    store.settings.set({
      request: { prompt: 'car' },
      effective: null,
      comment: '',
      render_seconds: null,
    });
    store.form.set({ prompt: 'car' });
    fixture.detectChanges();
    expect(one('prompt-modified')).toBeUndefined();

    store.form.set({ prompt: 'car in rain' });
    fixture.detectChanges();
    expect(one('prompt-modified')).toBeTruthy();
  });

  it('layout keeps the render button inside the card (bug fix #11)', () => {
    const { fixture } = render(PromptPanel);
    fixture.detectChanges();
    const host = getComputedStyle(fixture.nativeElement as HTMLElement);
    expect(host.display).toBe('grid');
    expect(host.overflow).toBe('hidden');
    expect(host.gridTemplateRows).toContain('minmax(0, 1fr)');
  });
});

describe('QueuePanel', () => {
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
    expect(rows[0].classList).toContain('queued');
    expect(rows[0].textContent).toContain('Queued');
    expect(rows[2].textContent).toContain('HTTP 400: bad');
    expect(rows[3].textContent).toContain('Done (#6)');
    expect(all('cancel')).toHaveLength(1);
    all('cancel')[0].click();
    expect(cancel).toHaveBeenCalledWith('q');
    expectNoSubmitButtons(fixture.nativeElement);
  });

  it('builds a readable title', () => {
    const { fixture } = render(QueuePanel);
    const panel = fixture.componentInstance;
    expect(panel.title(job('a', 'done', 6, '20261008-Green_Car'))).toBe('#6 · Green_Car');
    expect(panel.title(job('b', 'queued', null, '20261006-Portrait'))).toBe('Portrait');
  });

  it('clears the finished jobs with the Clear button, disabled while nothing is finished', async () => {
    const { store, fixture, one } = render(QueuePanel);
    const clear = vi.spyOn(store, 'clearQueue').mockResolvedValue();
    store.jobs.set([job('e', 'error'), job('r', 'running')]);
    fixture.detectChanges();

    const button = one('clear') as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    expect(button.textContent).toContain('Clear');
    button.click();
    await fixture.whenStable();
    expect(clear).toHaveBeenCalledTimes(1);

    store.jobs.set([job('r', 'running'), job('q', 'queued')]);
    fixture.detectChanges();
    const disabled = one('clear') as HTMLButtonElement;
    expect(disabled.disabled).toBe(true);
    disabled.click();
    await fixture.whenStable();
    expect(clear).toHaveBeenCalledTimes(1);
    expectNoSubmitButtons(fixture.nativeElement);
  });
});
