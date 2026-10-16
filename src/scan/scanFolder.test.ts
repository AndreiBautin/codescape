import { describe, expect, it } from 'vitest';
import { countLines } from './scanFolder';

describe('countLines', () => {
  it('does not count a trailing newline as an extra line', () => {
    expect(countLines('')).toBe(0);
    expect(countLines('a')).toBe(1);
    expect(countLines('a\n')).toBe(1);
    expect(countLines('a\nb')).toBe(2);
    expect(countLines('a\r\nb\r\n')).toBe(2);
  });
});
