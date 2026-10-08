/** One segment of a word diff: consecutive words of the same kind, joined by single spaces. */
export interface WordSegment {
  kind: 'same' | 'added' | 'removed';
  text: string;
}

/**
 * Word diff of two prompts (issue #19), for the "Bild" column.
 *
 * - Words = `text.split(/\s+/)` without empty strings (so leading/trailing/multiple spaces and
 *   newlines do not matter). Comparison is exact (case-sensitive, punctuation stays attached:
 *   `car,` and `car` are different words).
 * - `before === null` (first image, no predecessor): every word of `after` is `same`.
 * - Otherwise use the longest common subsequence (LCS) of the two word lists:
 *   `dp[i][j]` = LCS length of `a.slice(i)` and `b.slice(j)` (fill from the end). Walk with
 *   `i = 0, j = 0`: if `a[i] === b[j]` -> `same` (i++, j++); else if `dp[i + 1][j] >= dp[i][j + 1]`
 *   -> `removed a[i]` (i++); else -> `added b[j]` (j++). Then the rest of `a` as `removed`, the
 *   rest of `b` as `added`. (This order puts a removed word before the added word that replaces it.)
 * - Merge consecutive words of the same kind into one segment (`text` joined with `' '`).
 * - Both empty -> `[]`.
 *
 * Example: `diffWords('a red car', 'a green car at night')` ->
 * `[{same 'a'}, {removed 'red'}, {added 'green'}, {same 'car'}, {added 'at night'}]`.
 */
export function diffWords(before: string | null, after: string): WordSegment[] {
  throw new Error('not implemented');
}
