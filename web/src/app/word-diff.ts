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
  const words = (t: string): string[] => t.split(/\s+/).filter((w) => w !== '');
  const b = before === null ? [] : words(before);
  const a = words(after);
  if (a.length === 0 && b.length === 0) {
    return [];
  }
  if (before === null) {
    return [{ kind: 'same', text: a.join(' ') }];
  }
  const dp: number[][] = Array.from({ length: b.length + 1 }, () =>
    new Array<number>(a.length + 1).fill(0),
  );
  for (let i = b.length - 1; i >= 0; i--) {
    for (let j = a.length - 1; j >= 0; j--) {
      dp[i][j] = b[i] === a[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const segs: WordSegment[] = [];
  const push = (kind: WordSegment['kind'], word: string): void => {
    const last = segs[segs.length - 1];
    if (last !== undefined && last.kind === kind) {
      last.text += ` ${word}`;
    } else {
      segs.push({ kind, text: word });
    }
  };
  let i = 0;
  let j = 0;
  while (i < b.length && j < a.length) {
    if (b[i] === a[j]) {
      push('same', b[i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      push('removed', b[i]);
      i++;
    } else {
      push('added', a[j]);
      j++;
    }
  }
  for (; i < b.length; i++) {
    push('removed', b[i]);
  }
  for (; j < a.length; j++) {
    push('added', a[j]);
  }
  return segs;
}
