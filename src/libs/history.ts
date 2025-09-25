import type { HistoryItem } from '../types/history';

const HISTORY_KEY = 'history';
const MAX_HISTORY = 1000;
const LEGACY_DB_NAME = 'cleanlink-db';
const LEGACY_STORE = 'history';

function normalize(items: unknown): HistoryItem[] {
  if (!Array.isArray(items)) {
    return [];
  }
  return items
    .filter((item): item is HistoryItem => {
      return (
        typeof item === 'object' &&
        item !== null &&
        typeof (item as HistoryItem).original === 'string' &&
        typeof (item as HistoryItem).cleaned === 'string'
      );
    })
    .map((item) => ({
      id: item.id,
      time: item.time,
      original: item.original,
      cleaned: item.cleaned,
      final: item.final ?? item.cleaned,
      expanded: Boolean(item.expanded),
      notes: item.notes,
      site: item.site
    }));
}

async function readStorageHistory(): Promise<HistoryItem[]> {
  const snapshot = await chrome.storage.local.get([HISTORY_KEY]);
  return normalize(snapshot[HISTORY_KEY]);
}

export async function getHistory(limit = MAX_HISTORY): Promise<HistoryItem[]> {
  const items = await readStorageHistory();
  return items.slice(-limit).reverse();
}

export async function appendHistory(items: HistoryItem[]): Promise<void> {
  if (items.length === 0) {
    return;
  }
  const current = await readStorageHistory();
  const merged = [...current, ...items].slice(-MAX_HISTORY);
  await chrome.storage.local.set({ [HISTORY_KEY]: merged });
}

export async function replaceHistory(items: HistoryItem[]): Promise<void> {
  await chrome.storage.local.set({ [HISTORY_KEY]: items.slice(-MAX_HISTORY) });
}

export async function clearHistory(): Promise<void> {
  await chrome.storage.local.set({ [HISTORY_KEY]: [] });
}

async function readLegacyHistory(): Promise<HistoryItem[]> {
  if (typeof indexedDB === 'undefined') {
    return [];
  }
  return new Promise((resolve) => {
    const request = indexedDB.open(LEGACY_DB_NAME);
    request.onerror = () => resolve([]);
    request.onupgradeneeded = () => {
      request.transaction?.abort();
      resolve([]);
    };
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(LEGACY_STORE)) {
        db.close();
        resolve([]);
        return;
      }
      const tx = db.transaction(LEGACY_STORE, 'readonly');
      const store = tx.objectStore(LEGACY_STORE);
      const items: HistoryItem[] = [];
      store.openCursor().onsuccess = (event) => {
        const cursor = event.target?.result as IDBCursorWithValue | undefined;
        if (!cursor) {
          return;
        }
        const value = cursor.value as {
          id: string;
          ts: number;
          original: string;
          cleaned: string;
          final: string;
          expanded: boolean;
          bulk?: boolean;
          domain?: string;
        };
        items.push({
          id: value.id,
          time: value.ts,
          original: value.original,
          cleaned: value.cleaned,
          final: value.final ?? value.cleaned,
          expanded: Boolean(value.expanded),
          notes: value.bulk ? 'bulk-clean' : undefined,
          site: value.domain
        });
        cursor.continue();
      };
      tx.oncomplete = () => {
        db.close();
        resolve(items);
      };
      tx.onerror = () => {
        db.close();
        resolve([]);
      };
    };
  });
}

async function deleteLegacyDatabase(): Promise<void> {
  if (typeof indexedDB === 'undefined') {
    return;
  }
  try {
    indexedDB.deleteDatabase(LEGACY_DB_NAME);
  } catch (_error) {
    // ignore
  }
}

export async function migrateLegacyHistoryIfNeeded(): Promise<void> {
  const existing = await readStorageHistory();
  if (existing.length > 0) {
    return;
  }
  const legacy = await readLegacyHistory();
  if (legacy.length === 0) {
    return;
  }
  await replaceHistory(legacy);
  await deleteLegacyDatabase();
}
