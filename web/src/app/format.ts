/** Small pure display helpers. */

/**
 * Split a project id `YYYYMMDD-<name>` for display.
 * Returns `{ name, date }` with `date` as `TT.MM.JJJJ`, e.g.
 * `'20261008-Green_Car'` -> `{ name: 'Green_Car', date: '08.10.2026' }`.
 * The name is everything after the FIRST `-` (it may contain more `-`).
 * If the id does not match `/^(\d{4})(\d{2})(\d{2})-(.+)$/`: `{ name: id, date: '' }`.
 */
export function projectLabel(id: string): { name: string; date: string } {
  const m = id.match(/^(\d{4})(\d{2})(\d{2})-(.+)$/);
  if (m === null) {
    return { name: id, date: '' };
  }
  return { name: m[4], date: `${m[3]}.${m[2]}.${m[1]}` };
}

/**
 * One-line summary of a group of form values for a collapsed parameter group.
 * Join the non-empty `parts` with `' · '`; `null`, `undefined` and `''` parts are skipped.
 * Example: `summary(['flux-lora', undefined, '1024×1024'])` -> `'flux-lora · 1024×1024'`.
 * All parts empty -> `empty` (default `'Defaults'`).
 */
export function summary(parts: (string | null | undefined)[], empty = 'Defaults'): string {
  const nonEmpty = parts.filter((p) => p !== null && p !== undefined && p !== '');
  return nonEmpty.length === 0 ? empty : nonEmpty.join(' · ');
}

/** `1` -> `'1 image'`, every other number -> `'<n> images'` (e.g. `'0 images'`, `'12 images'`). */
export function imageCountLabel(n: number): string {
  return n === 1 ? '1 image' : `${n} images`;
}

/**
 * Render time for the image header (issue #19). `null` -> `'–'`.
 * Round to whole seconds FIRST (`Math.round`), then: below 60 -> `'<s> s'` (e.g. `'48 s'`,
 * `'0 s'`); from 60 on -> `'<m>:<ss> min'` with two-digit seconds (e.g. 161.4 -> `'2:41 min'`,
 * 60 -> `'1:00 min'`, 59.6 -> `'1:00 min'`, 3725 -> `'62:05 min'`).
 */
export function formatDuration(seconds: number | null): string {
  if (seconds === null) {
    return '–';
  }
  const total = Math.round(seconds);
  if (total < 60) {
    return `${total} s`;
  }
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')} min`;
}
