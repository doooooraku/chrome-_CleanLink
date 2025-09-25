import { promises as fs } from 'fs';
import path from 'path';
import type { Page } from '@playwright/test';
import type { CleanLinkMessage, CleanLinkResponse } from '../../src/types/messages';
import type { Settings, SiteOverrideState } from '../../src/libs/storage';

interface ChromeMockOptions {
  storage?: Partial<Record<string, unknown>>;
  tabUrl?: string;
  onMessage?: (kind: CleanLinkMessage['kind'], payload: CleanLinkMessage) => void;
  handlers?: Record<string, (payload: CleanLinkMessage) => Promise<CleanLinkResponse<unknown>> | CleanLinkResponse<unknown>>;
}

interface InitArgs {
  storageSnapshot: Record<string, unknown>;
  tabUrlInit: string;
}

const distRootDefault = path.resolve(process.cwd(), 'dist');

const mimeByExtension: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

function getContentType(filePath: string): string {
  const ext = path.extname(filePath);
  return mimeByExtension[ext] ?? 'application/octet-stream';
}

export async function serveDist(page: Page, distRoot = distRootDefault): Promise<void> {
  await page.route('http://cleanlink.local/**', async (route) => {
    const requestUrl = new URL(route.request().url);
    let filePath = path.join(distRoot, decodeURIComponent(requestUrl.pathname));
    try {
      let stat = await fs.stat(filePath);
      if (stat.isDirectory()) {
        filePath = path.join(filePath, 'index.html');
        stat = await fs.stat(filePath);
      }
      const body = await fs.readFile(filePath);
      route.fulfill({
        status: 200,
        body,
        headers: {
          'content-type': getContentType(filePath)
        }
      });
    } catch (error) {
      route.fulfill({ status: 404, body: 'not found' });
    }
  });
}

export async function setupChromeMocks(page: Page, options: ChromeMockOptions = {}): Promise<void> {
  const storage = {
    settings: { autoCleanDefault: false, expandShort: false } satisfies Settings,
    siteOverrides: {} as Record<string, SiteOverrideState>,
    license: null,
    diagnostics: [],
    ...options.storage
  };
  const tabUrl = options.tabUrl ?? 'https://example.com/';

  const handlers = options.handlers ?? {};

  await page.exposeFunction('__cleanlinkHandleMessage', async (payload: CleanLinkMessage) => {
    options.onMessage?.(payload.kind, payload);
    const handler = handlers[payload.kind];
    if (handler) {
      return handler(payload);
    }
    return { ok: true } satisfies CleanLinkResponse<unknown>;
  });

  await page.addInitScript(({ storageSnapshot, tabUrlInit }: InitArgs) => {
    const listeners: Array<(changes: Record<string, unknown>, areaName: string) => void> = [];
    const storageData: Record<string, unknown> = structuredClone(storageSnapshot);

    Object.defineProperty(window, '__cleanlinkMessages', {
      value: [],
      writable: true
    });

    Object.defineProperty(window, '__cleanlinkClipboard', {
      value: '',
      writable: true
    });

    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (text: string) => {
          (window as unknown as { __cleanlinkClipboard: string }).__cleanlinkClipboard = text;
          return Promise.resolve();
        }
      }
    });

    (window as unknown as Record<string, unknown>).__cleanlinkStorage = storageData;

    function snapshotFor(keys: unknown): Record<string, unknown> {
      if (!keys) {
        return { ...storageData };
      }
      if (Array.isArray(keys)) {
        return Object.fromEntries(keys.map((key) => [key, storageData[key as string]]));
      }
      if (typeof keys === 'string') {
        return { [keys]: storageData[keys] };
      }
      return Object.fromEntries(
        Object.keys(keys as Record<string, unknown>).map((key) => [key, storageData[key]])
      );
    }

    window.chrome = {
      runtime: {
        sendMessage(message: CleanLinkMessage, callback: (response: CleanLinkResponse<unknown>) => void) {
          (window as unknown as { __cleanlinkMessages: string[] }).__cleanlinkMessages.push(message.kind);
          Promise.resolve(
            (window as unknown as {
              __cleanlinkHandleMessage: (payload: CleanLinkMessage) => Promise<CleanLinkResponse<unknown>>;
            }).__cleanlinkHandleMessage(message)
          )
            .then((response) => {
              callback(response);
            })
            .catch((error: unknown) => {
              callback({ ok: false, errorCode: 'NETWORK', message: String(error) });
            });
        }
      },
      storage: {
        local: {
          async get(keys?: unknown) {
            return snapshotFor(keys ?? null);
          },
          async set(items: Record<string, unknown>) {
            const changes: Record<string, { oldValue: unknown; newValue: unknown }> = {};
            for (const [key, value] of Object.entries(items)) {
              const oldValue = structuredClone(storageData[key]);
              storageData[key] = value;
              changes[key] = { oldValue, newValue: value };
            }
            listeners.forEach((listener) => listener(changes, 'local'));
          }
        }
      },
      tabs: {
        async query() {
          return [{ id: 1, url: tabUrlInit }];
        },
        async create() {
          return;
        }
      },
      permissions: {
        async request() {
          return true;
        },
        async contains() {
          return true;
        }
      },
      downloads: {
        async download() {
          return 1;
        }
      }
    } as unknown as typeof chrome;
  }, { storageSnapshot: storage as Record<string, unknown>, tabUrlInit: tabUrl });
}
