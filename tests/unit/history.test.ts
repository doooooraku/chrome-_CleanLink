import { describe, expect, test, beforeEach } from 'vitest';
import { appendHistory, getHistory, clearHistory } from '../../src/libs/history';

describe('history storage', () => {
  beforeEach(async () => {
    await clearHistory();
  });

  test('appends history entries and retrieves in reverse order', async () => {
    const now = Date.now();
    await appendHistory([
      {
        id: 'id-1',
        time: now,
        original: 'https://example.com/?utm=1',
        cleaned: 'https://example.com/',
        final: 'https://example.com/',
        expanded: false,
        notes: 'removed-utm',
        site: 'example.com'
      }
    ]);
    const history = await getHistory(10);
    expect(history).toHaveLength(1);
    expect(history[0].original).toBe('https://example.com/?utm=1');
    expect(history[0].notes).toBe('removed-utm');
  });

  test('limits history to 1000 entries', async () => {
    const entries = Array.from({ length: 1005 }).map((_, index) => ({
      id: `id-${index}`,
      time: Date.now(),
      original: `https://example.com/${index}`,
      cleaned: `https://example.com/${index}`,
      final: `https://example.com/${index}`,
      expanded: false,
      notes: undefined,
      site: 'example.com'
    }));
    await appendHistory(entries);
    const history = await getHistory();
    expect(history).toHaveLength(1000);
  });
});
