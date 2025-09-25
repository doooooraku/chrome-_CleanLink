import { describe, expect, test } from 'vitest';
import { cleanUrl, createCsv, needsExpansion, isSensitiveUrl } from '../../src/libs/rules';

describe('cleanUrl', () => {
  test('removes utm parameters', () => {
    const result = cleanUrl('https://example.com/?utm_source=test&id=42');
    expect(result.cleaned).toBe('https://example.com/?id=42');
    expect(result.removed.map((diff) => diff.key)).toContain('utm_source');
  });

  test('handles google redirect urls', () => {
    const url = 'https://www.google.com/url?q=https://example.com&sa=D&ved=XYZ';
    const result = cleanUrl(url);
    expect(result.cleaned).toBe('https://example.com/');
  });

  test('keeps safe parameters', () => {
    const result = cleanUrl('https://example.com/?id=123&ref=abc');
    expect(result.cleaned).toContain('id=123');
    expect(result.removed.map((diff) => diff.key)).toContain('ref');
  });
});

describe('createCsv', () => {
  test('wraps fields and escapes quotes', () => {
    const csv = createCsv([
      { original: 'https://a', cleaned: 'https://b', final: 'https://c' },
      { original: 'https://"quoted"', cleaned: 'https://d', final: 'https://e' }
    ]);
    expect(csv.split('\n')).toHaveLength(3);
    expect(csv).toContain('"https://""quoted"""');
  });
});

describe('needsExpansion', () => {
  test('detects bit.ly links', () => {
    expect(needsExpansion('https://bit.ly/123')).toBe(true);
    expect(needsExpansion('https://example.com')).toBe(false);
  });
});


describe('isSensitiveUrl', () => {
  test('marks login urls as sensitive', () => {
    expect(isSensitiveUrl('https://example.com/login?next=/home')).toBe(true);
  });

  test('ignores regular article urls', () => {
    expect(isSensitiveUrl('https://example.com/blog?id=1')).toBe(false);
  });
});
