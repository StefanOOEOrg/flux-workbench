import { diffWords } from './word-diff';

describe('diffWords', () => {
  it('marks replaced and appended words', () => {
    expect(diffWords('a red car', 'a green car at night')).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'removed', text: 'red' },
      { kind: 'added', text: 'green' },
      { kind: 'same', text: 'car' },
      { kind: 'added', text: 'at night' },
    ]);
  });

  it('first image: everything is the same', () => {
    expect(diffWords(null, 'a red  car')).toEqual([{ kind: 'same', text: 'a red car' }]);
  });

  it('identical text with different whitespace is one same segment', () => {
    expect(diffWords('a  red\ncar ', ' a red car')).toEqual([{ kind: 'same', text: 'a red car' }]);
  });

  it('handles empty sides', () => {
    expect(diffWords('', '')).toEqual([]);
    expect(diffWords(null, '')).toEqual([]);
    expect(diffWords('', 'blurry, watermark')).toEqual([
      { kind: 'added', text: 'blurry, watermark' },
    ]);
    expect(diffWords('blurry', '')).toEqual([{ kind: 'removed', text: 'blurry' }]);
  });

  it('is case-sensitive and keeps punctuation attached', () => {
    expect(diffWords('Car, red', 'car, red')).toEqual([
      { kind: 'removed', text: 'Car,' },
      { kind: 'added', text: 'car,' },
      { kind: 'same', text: 'red' },
    ]);
  });

  it('removed words in the middle', () => {
    expect(diffWords('photo of a big old house', 'photo of a house')).toEqual([
      { kind: 'same', text: 'photo of a' },
      { kind: 'removed', text: 'big old' },
      { kind: 'same', text: 'house' },
    ]);
  });
});
