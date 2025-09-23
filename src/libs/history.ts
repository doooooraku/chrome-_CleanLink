import { openDB } from 'idb';
import type { HistoryRecord } from '../types/history';

const DB_NAME = 'cleanlink-db';
const DB_VERSION = 1;
const STORE_NAME = 'history';

async function getDb() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('ts', 'ts');
        store.createIndex('domain', 'domain');
      }
    }
  });
}

export async function saveHistory(record: HistoryRecord): Promise<void> {
  const db = await getDb();
  await db.put(STORE_NAME, record);
}

export async function fetchHistory(limit = 1000): Promise<HistoryRecord[]> {
  const db = await getDb();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  const index = store.index('ts');
  const results: HistoryRecord[] = [];
  let cursor = await index.openCursor(null, 'prev');
  while (cursor && results.length < limit) {
    results.push(cursor.value as HistoryRecord);
    cursor = await cursor.continue();
  }
  await tx.done;
  return results;
}

export async function trimHistory(maxRecords = 1000): Promise<void> {
  const records = await fetchHistory(maxRecords + 1);
  if (records.length <= maxRecords) {
    return;
  }
  const db = await getDb();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  for (let i = maxRecords; i < records.length; i += 1) {
    await store.delete(records[i].id);
  }
  await tx.done;
}
