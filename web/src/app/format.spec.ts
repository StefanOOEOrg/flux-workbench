import { formatDuration, imageCountLabel, projectLabel, summary } from './format';

describe('projectLabel', () => {
  it('splits date and name', () => {
    expect(projectLabel('20261008-Gruenes_Auto')).toEqual({
      name: 'Gruenes_Auto',
      date: '08.10.2026',
    });
    expect(projectLabel('20260101-a-b-c')).toEqual({ name: 'a-b-c', date: '01.01.2026' });
  });

  it('falls back to the raw id', () => {
    expect(projectLabel('kein-datum')).toEqual({ name: 'kein-datum', date: '' });
    expect(projectLabel('2026100-x')).toEqual({ name: '2026100-x', date: '' });
    expect(projectLabel('20261008-')).toEqual({ name: '20261008-', date: '' });
  });
});

describe('summary', () => {
  it('joins non-empty parts', () => {
    expect(summary(['flux-lora', undefined, '', null, '1024×1024'])).toBe('flux-lora · 1024×1024');
  });

  it('uses the fallback when everything is empty', () => {
    expect(summary([undefined, ''])).toBe('Defaults');
    expect(summary([], 'aus')).toBe('aus');
  });
});

describe('imageCountLabel', () => {
  it('uses singular only for one', () => {
    expect(imageCountLabel(0)).toBe('0 Bilder');
    expect(imageCountLabel(1)).toBe('1 Bild');
    expect(imageCountLabel(12)).toBe('12 Bilder');
  });
});

describe('formatDuration', () => {
  it('formats seconds and minutes', () => {
    expect(formatDuration(null)).toBe('–');
    expect(formatDuration(0)).toBe('0 s');
    expect(formatDuration(48.2)).toBe('48 s');
    expect(formatDuration(59.4)).toBe('59 s');
    expect(formatDuration(59.6)).toBe('1:00 min');
    expect(formatDuration(60)).toBe('1:00 min');
    expect(formatDuration(161.4)).toBe('2:41 min');
    expect(formatDuration(3725)).toBe('62:05 min');
  });
});
