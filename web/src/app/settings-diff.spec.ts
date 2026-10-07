import { diffSettings, effectiveOrRequest, flattenSettings } from './settings-diff';

describe('diffSettings', () => {
  it('returns [] when there is no previous image', () => {
    expect(diffSettings(null, { steps: 1 })).toEqual([]);
    expect(diffSettings({ steps: 1 }, null)).toEqual([]);
  });

  it('reports exactly the changed keys, also nested, sorted by path', () => {
    const before = { steps: 32, prompt: 'p', hires: { denoise: 0.4, scale: 1.5 } };
    const after = { steps: 40, prompt: 'p', hires: { denoise: 0.5, scale: 1.5 } };
    expect(diffSettings(before, after)).toEqual([
      { path: 'hires.denoise', kind: 'changed', before: 0.4, after: 0.5 },
      { path: 'steps', kind: 'changed', before: 32, after: 40 },
    ]);
  });

  it('reports added and removed keys; undefined counts as absent', () => {
    expect(diffSettings({ a: 1, u: undefined }, { b: 2 })).toEqual([
      { path: 'a', kind: 'removed', before: 1 },
      { path: 'b', kind: 'added', after: 2 },
    ]);
  });

  it('treats a type switch as one change without recursion', () => {
    expect(diffSettings({ hires: true }, { hires: { scale: 2 } })).toEqual([
      { path: 'hires', kind: 'changed', before: true, after: { scale: 2 } },
    ]);
  });

  it('compares arrays by content and finds no diff for equal objects', () => {
    expect(diffSettings({ x: [1, 2], n: null }, { x: [1, 2], n: null })).toEqual([]);
    expect(diffSettings({ x: [1, 2] }, { x: [2, 1] })).toHaveLength(1);
  });

  it('does not modify its inputs', () => {
    const before = { hires: { scale: 1 } };
    const after = { hires: { scale: 2 } };
    diffSettings(before, after);
    expect(before).toEqual({ hires: { scale: 1 } });
    expect(after).toEqual({ hires: { scale: 2 } });
  });
});

describe('effectiveOrRequest', () => {
  it('prefers effective and falls back to request', () => {
    expect(effectiveOrRequest({ request: { a: 1 }, effective: { a: 2 } })).toEqual({ a: 2 });
    expect(effectiveOrRequest({ request: { a: 1 }, effective: null })).toEqual({ a: 1 });
  });
});

describe('flattenSettings', () => {
  it('flattens nested objects with dotted paths, sorted', () => {
    expect(flattenSettings({ steps: 3, hires: { scale: 1.5, steps: 25 }, empty: {} })).toEqual([
      ['empty', {}],
      ['hires.scale', 1.5],
      ['hires.steps', 25],
      ['steps', 3],
    ]);
  });
});
