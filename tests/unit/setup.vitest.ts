const { vi } = await import('vitest');

type StorageShape = Record<string, unknown>;

const storageData: StorageShape = {};

function resolveKeys(keys: string[] | StorageShape | null | undefined): StorageShape {
  if (!keys) {
    return { ...storageData };
  }
  if (Array.isArray(keys)) {
    return Object.fromEntries(keys.map((key) => [key, storageData[key]]));
  }
  if (typeof keys === 'string') {
    return { [keys]: storageData[keys] };
  }
  return Object.fromEntries(Object.keys(keys).map((key) => [key, storageData[key]]));
}

(globalThis as typeof globalThis & {
  chrome: typeof chrome;
}).chrome = {
  storage: {
    local: {
      get: vi.fn((keys) => Promise.resolve(resolveKeys(keys))),
      set: vi.fn(async (items: StorageShape) => {
        Object.assign(storageData, items);
      })
    },
    onChanged: {
      addListener: vi.fn(),
      removeListener: vi.fn()
    }
  },
  permissions: {
    request: vi.fn(async () => true),
    contains: vi.fn(async () => true)
  },
  runtime: {
    sendMessage: vi.fn()
  },
  downloads: {
    download: vi.fn()
  },
  tabs: {
    query: vi.fn(async () => []),
    create: vi.fn()
  },
  action: {
    onClicked: {
      addListener: vi.fn()
    }
  },
  commands: {
    onCommand: {
      addListener: vi.fn()
    }
  }
} as unknown as typeof chrome;
