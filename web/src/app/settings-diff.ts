import { DiffEntry, ImageSettings } from './models';

/**
 * Compare the settings of the previous image (`before`) with the selected image (`after`).
 *
 * Rules:
 * - `before === null` (first image, nothing to compare) -> `[]`. `after === null` -> `[]`.
 * - Walk both objects recursively. A "plain object" is `typeof v === 'object' && v !== null &&
 *   !Array.isArray(v)`. If BOTH sides of a key are plain objects, recurse with path
 *   `parent.key`; otherwise compare the values as a whole.
 * - Equality of non-object values: `JSON.stringify(a) === JSON.stringify(b)`
 *   (so arrays compare by content; `1` vs `1.0` are equal).
 * - Key only in `after` -> `{ path, kind: 'added', after }`.
 *   Key only in `before` -> `{ path, kind: 'removed', before }`.
 *   Different values -> `{ path, kind: 'changed', before, after }`.
 *   A key whose value is `undefined` counts as absent.
 * - Type switch, e.g. `hires: true` -> `hires: {scale: 2}`: one `changed` entry for `hires`
 *   with both whole values (no recursion).
 * - Result sorted by `path` (`localeCompare`).
 * - Must not modify the inputs.
 *
 * Example: before `{steps: 32, hires: {denoise: 0.4, scale: 1.5}}`,
 * after `{steps: 40, hires: {denoise: 0.5, scale: 1.5}}` ->
 * `[{path: 'hires.denoise', kind: 'changed', before: 0.4, after: 0.5},
 *   {path: 'steps', kind: 'changed', before: 32, after: 40}]`.
 */
export function diffSettings(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): DiffEntry[] {
  throw new Error('not implemented');
}

/**
 * The values to show and diff for one image: `settings.effective` if it is not null,
 * otherwise `settings.request`. Returns the object itself (no copy).
 */
export function effectiveOrRequest(settings: ImageSettings): Record<string, unknown> {
  throw new Error('not implemented');
}

/**
 * Flatten a settings object for display as `[path, value]` rows, sorted by path.
 * Plain objects (see `diffSettings`) are flattened recursively with dotted paths
 * (`{hires: {scale: 1.5}}` -> `[['hires.scale', 1.5]]`); everything else is a leaf.
 * An empty nested object yields one row with the empty object as value.
 */
export function flattenSettings(obj: Record<string, unknown>): [string, unknown][] {
  throw new Error('not implemented');
}
