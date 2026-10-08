/** Small pure display helpers. */

/**
 * Split a project id `YYYYMMDD-<name>` for display.
 * Returns `{ name, date }` with `date` as `TT.MM.JJJJ`, e.g.
 * `'20261008-Gruenes_Auto'` -> `{ name: 'Gruenes_Auto', date: '08.10.2026' }`.
 * The name is everything after the FIRST `-` (it may contain more `-`).
 * If the id does not match `/^(\d{4})(\d{2})(\d{2})-(.+)$/`: `{ name: id, date: '' }`.
 */
export function projectLabel(id: string): { name: string; date: string } {
  throw new Error('not implemented');
}

/**
 * One-line summary of a group of form values for a collapsed parameter group.
 * Join the non-empty `parts` with `' · '`; `null`, `undefined` and `''` parts are skipped.
 * Example: `summary(['flux-lora', undefined, '1024×1024'])` -> `'flux-lora · 1024×1024'`.
 * All parts empty -> `empty` (default `'Defaults'`).
 */
export function summary(parts: (string | null | undefined)[], empty = 'Defaults'): string {
  throw new Error('not implemented');
}

/** `1` -> `'1 Bild'`, every other number -> `'<n> Bilder'` (e.g. `'0 Bilder'`, `'12 Bilder'`). */
export function imageCountLabel(n: number): string {
  throw new Error('not implemented');
}
