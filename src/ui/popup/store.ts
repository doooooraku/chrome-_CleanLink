import { create } from 'zustand';
import type { LinkScanResult, LinkSummary, ScanLinksResponse } from '../../types/messages';
import type { CleanLinkResponse } from '../../types/messages';
import type { SiteOverrideState, Settings } from '../../libs/storage';

interface PopupState {
  loading: boolean;
  error: string | null;
  links: LinkScanResult[];
  summary: LinkSummary;
  proActive: boolean;
  expandShort: boolean;
  autoCleanDefault: boolean;
  autoCleanThisSite: boolean;
  siteHost: string | null;
  lastUpdated: number | null;
  scan: () => Promise<void>;
  clean: () => Promise<boolean>;
  copyCleaned: () => Promise<boolean>;
  cleanAndCopy: () => Promise<boolean>;
  toggleExpandShort: (value: boolean) => Promise<void>;
  toggleAutoCleanSite: (value: boolean) => Promise<void>;
  openHistory: () => Promise<void>;
  openOptions: () => Promise<void>;
}

interface UpdateSiteOverridePayload {
  domain: string;
  state: SiteOverrideState | null;
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

function computeSiteOverrideState(
  autoCleanDefault: boolean,
  override: SiteOverrideState | null | undefined
): boolean {
  if (override === 'always-clean') {
    return true;
  }
  if (override === 'skip') {
    return false;
  }
  return autoCleanDefault;
}

function mapToggleValue(
  desired: boolean,
  autoCleanDefault: boolean
): SiteOverrideState | null {
  if (desired === autoCleanDefault) {
    return null;
  }
  return desired ? 'always-clean' : 'skip';
}

function buildCopyPayload(links: LinkScanResult[]): string {
  return links
    .map((link) => link.final ?? link.cleaned)
    .filter((value, index, self) => value && self.indexOf(value) === index)
    .join('\n');
}

export const usePopupStore = create<PopupState>((set, get) => ({
  loading: false,
  error: null,
  links: [],
  summary: { detected: 0, changed: 0, ignored: 0 },
  proActive: false,
  expandShort: false,
  autoCleanDefault: false,
  autoCleanThisSite: false,
  siteHost: null,
  lastUpdated: null,
  async scan() {
    set({ loading: true, error: null });
    const response = await sendMessage<ScanLinksResponse>('SCAN_CURRENT');
    if (!response.ok) {
      set({ loading: false, error: response.message ?? 'Failed to scan links.' });
      return;
    }
    const data = response.data ?? { links: [], summary: { detected: 0, changed: 0, ignored: 0 } };
    set({
      links: data.links,
      summary: data.summary,
      loading: false,
      error: null,
      lastUpdated: Date.now()
    });
  },
  async clean() {
    set({ loading: true, error: null });
    const response = await sendMessage<ScanLinksResponse>('CLEAN_CURRENT');
    if (!response.ok) {
      set({ loading: false, error: response.message ?? 'Failed to clean links.' });
      return false;
    }
    const data = response.data ?? { links: [], summary: { detected: 0, changed: 0, ignored: 0 } };
    set({
      links: data.links,
      summary: data.summary,
      loading: false,
      error: null,
      lastUpdated: Date.now()
    });
    return true;
  },
  async copyCleaned() {
    const { links } = get();
    if (!links.length) {
      return false;
    }
    const text = buildCopyPayload(links);
    if (!text) {
      return false;
    }
    if (!navigator.clipboard?.writeText) {
      return false;
    }
    await navigator.clipboard.writeText(text);
    return true;
  },
  async cleanAndCopy() {
    const cleaned = await get().clean();
    if (!cleaned) {
      return false;
    }
    return get().copyCleaned();
  },
  async toggleExpandShort(value) {
    const { proActive } = get();
    if (value && !proActive) {
      set({ error: 'Pro license required to expand short URLs.' });
      return;
    }
    if (value) {
      const granted = await requestOptionalPermissions();
      if (!granted) {
        set({ error: 'Permission required to expand short URLs.' });
        return;
      }
    }
    set({ expandShort: value });
    await sendMessage<Settings>('UPDATE_SETTINGS', { expandShort: value });
  },
  async toggleAutoCleanSite(value) {
    const { siteHost, autoCleanDefault } = get();
    if (!siteHost) {
      return;
    }
    const state = mapToggleValue(value, autoCleanDefault);
    const payload: UpdateSiteOverridePayload = { domain: siteHost, state };
    await sendMessage<void>('UPDATE_SITE_OVERRIDE', payload);
    set({ autoCleanThisSite: value });
  },
  async openHistory() {
    const url = chrome.runtime.getURL('src/ui/history/index.html');
    await chrome.tabs.create({ url });
  },
  async openOptions() {
    const url = chrome.runtime.getURL('src/ui/options/index.html');
    await chrome.tabs.create({ url });
  }
}));

export async function bootstrapStore(): Promise<void> {
  const snapshot = await chrome.storage.local.get(['settings', 'license', 'siteOverrides']);
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const activeTab = tabs[0];
  let host: string | null = null;
  if (activeTab?.url) {
    try {
      host = new URL(activeTab.url).hostname;
    } catch (_error) {
      host = null;
    }
  }
  const settings = (snapshot.settings ?? { autoCleanDefault: false, expandShort: false }) as Settings;
  const siteOverrides = snapshot.siteOverrides ?? {};
  const override = host ? (siteOverrides[host] as SiteOverrideState | undefined) : null;
  usePopupStore.setState((prev) => ({
    ...prev,
    expandShort: settings.expandShort,
    autoCleanDefault: settings.autoCleanDefault,
    autoCleanThisSite: host ? computeSiteOverrideState(settings.autoCleanDefault, override ?? null) : prev.autoCleanThisSite,
    proActive: snapshot.license?.status === 'valid',
    siteHost: host
  }));
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') {
    return;
  }
  if (changes.settings) {
    usePopupStore.setState((prev) => {
      const settings = changes.settings.newValue as Settings | undefined;
      if (!settings) {
        return prev;
      }
      const next: Partial<PopupState> = {
        expandShort: settings.expandShort,
        autoCleanDefault: settings.autoCleanDefault
      };
      if (prev.siteHost) {
        const override = (changes.siteOverrides?.newValue ?? {})[prev.siteHost] as SiteOverrideState | undefined;
        next.autoCleanThisSite = computeSiteOverrideState(settings.autoCleanDefault, override ?? null);
      }
      return { ...prev, ...next };
    });
  }
  if (changes.license) {
    usePopupStore.setState((prev) => ({
      ...prev,
      proActive: changes.license.newValue?.status === 'valid'
    }));
  }
  if (changes.siteOverrides) {
    usePopupStore.setState((prev) => {
      if (!prev.siteHost) {
        return prev;
      }
      const override = (changes.siteOverrides.newValue ?? {})[prev.siteHost] as SiteOverrideState | undefined;
      return {
        ...prev,
        autoCleanThisSite: computeSiteOverrideState(prev.autoCleanDefault, override ?? null)
      };
    });
  }
});
