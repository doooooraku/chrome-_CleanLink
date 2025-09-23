import { create } from 'zustand';
import type { LinkScanResult } from '../../types/messages';
import type { CleanLinkResponse } from '../../types/messages';

interface PopupState {
  loading: boolean;
  error: string | null;
  links: LinkScanResult[];
  openHistory: () => Promise<void>;
  autoClean: boolean;
  previewOnly: boolean;
  expandShort: boolean;
  proActive: boolean;
  lastUpdated: number | null;
  setSettings: (settings: Partial<Pick<PopupState, 'autoClean' | 'previewOnly' | 'expandShort'>>) => void;
  scan: () => Promise<void>;
  clean: () => Promise<void>;
  bulk: () => Promise<void>;
  toggleExpandShort: (value: boolean) => Promise<void>;
}

async function sendMessage<T>(kind: string, payload?: unknown): Promise<CleanLinkResponse<T>> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ kind, payload }, (response: CleanLinkResponse<T>) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, errorCode: 'NETWORK', message: chrome.runtime.lastError.message });
        return;
      }
      resolve(response);
    });
  });
}

async function requestOptionalPermissions(): Promise<boolean> {
  return chrome.permissions.request({ origins: ['https://*/*', 'http://*/*'] });
}

export const usePopupStore = create<PopupState>((set, _get) => ({
  loading: false,
  error: null,
  links: [],
  autoClean: false,
  previewOnly: false,
  expandShort: false,
  proActive: false,
  lastUpdated: null,
  setSettings: (settings) => {
    set(settings);
    void sendMessage('UPDATE_SETTINGS', settings);
  },
  scan: async () => {
    set({ loading: true, error: null });
    const response = await sendMessage<LinkScanResult[]>('SCAN_LINKS');
    if (!response.ok) {
      set({ loading: false, error: response.message ?? 'Failed to scan links.' });
      return;
    }
    set({ links: response.data ?? [], loading: false, lastUpdated: Date.now() });
  },
  clean: async () => {
    set({ loading: true, error: null });
    const response = await sendMessage<LinkScanResult[]>('CLEAN_LINKS');
    if (!response.ok) {
      set({ loading: false, error: response.message ?? 'Failed to clean links.' });
      return;
    }
    set({ links: response.data ?? [], loading: false, lastUpdated: Date.now() });
    if (response.data && response.data.length > 0 && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(response.data[0].cleaned);
    }
  },
  openHistory: async () => {
    const url = chrome.runtime.getURL('src/ui/history/index.html');
    await chrome.tabs.create({ url });
  },
  bulk: async () => {
    set({ loading: true, error: null });
    const response = await sendMessage<LinkScanResult[]>('BULK_CLEAN');
    if (!response.ok) {
      set({ loading: false, error: response.message ?? 'Failed to bulk clean.' });
      return;
    }
    set({ links: response.data ?? [], loading: false, lastUpdated: Date.now() });
  },
  toggleExpandShort: async (value) => {
    if (value) {
      const granted = await requestOptionalPermissions();
      if (!granted) {
        set({ error: 'Permission required to expand short URLs.' });
        return;
      }
    }
    set({ expandShort: value });
    void sendMessage('UPDATE_SETTINGS', { expandShort: value });
  }
}));

export async function bootstrapStore(): Promise<void> {
  const snapshot = await chrome.storage.local.get(['settings', 'license']);
  usePopupStore.setState((prev) => ({
    ...prev,
    autoClean: snapshot.settings?.autoClean ?? false,
    previewOnly: snapshot.settings?.previewOnly ?? false,
    expandShort: snapshot.settings?.expandShort ?? false,
    proActive: snapshot.license?.status === 'valid'
  }));
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') {
    return;
  }
  if (changes.settings) {
    usePopupStore.setState((prev) => ({
      ...prev,
      autoClean: changes.settings.newValue?.autoClean ?? prev.autoClean,
      previewOnly: changes.settings.newValue?.previewOnly ?? prev.previewOnly,
      expandShort: changes.settings.newValue?.expandShort ?? prev.expandShort
    }));
  }
  if (changes.license) {
    usePopupStore.setState((prev) => ({
      ...prev,
      proActive: changes.license.newValue?.status === 'valid'
    }));
  }
});
