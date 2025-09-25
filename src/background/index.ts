import { createCsv, needsExpansion } from '../libs/rules';
import { appendHistory, clearHistory, getHistory } from '../libs/history';
import { appendDiagnostic, loadStorage, saveLicense, saveSettings, updateSiteOverride } from '../libs/storage';
import { makeId } from '../libs/utils';
import { verifyLicense } from '../libs/license';
import type {
  CleanLinkMessage,
  CleanLinkResponse,
  LinkScanResult,
  LinkSummary,
  ScanLinksResponse
} from '../types/messages';
import type { HistoryItem } from '../types/history';
import type { Settings, SiteOverrideState } from '../libs/storage';

const LICENSE_PUBLIC_KEY = (import.meta.env?.VITE_LICENSE_PUBLIC_KEY as string | undefined) ?? '';
const SHORT_EXPANSION_TIMEOUT_MS = 2500;
const MAX_REDIRECT_HOPS = 5;

async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

function isUnsupportedUrl(url: string | undefined): boolean {
  if (!url) {
    return true;
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return true;
    }
    const unsupportedSchemes = ['chrome:', 'edge:', 'about:'];
    if (unsupportedSchemes.includes(parsed.protocol)) {
      return true;
    }
    if (url.startsWith('chrome-extension://')) {
      return true;
    }
    return false;
  } catch (_error) {
    return true;
  }
}

async function forwardToContent<T>(tabId: number, message: CleanLinkMessage): Promise<CleanLinkResponse<T>> {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response: CleanLinkResponse<T>) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, errorCode: 'NETWORK', message: chrome.runtime.lastError.message });
        return;
      }
      resolve(response);
    });
  });
}

function summarizeLinks(links: LinkScanResult[]): LinkSummary {
  const detected = links.length;
  let changed = 0;
  let ignored = 0;
  links.forEach((link) => {
    if (link.notes) {
      ignored += 1;
    }
    if (link.cleaned !== link.original || (link.final && link.final !== link.original)) {
      changed += 1;
    }
  });
  return { detected, changed, ignored };
}

function combineNotes(existing: string | undefined, note: string): string {
  if (!existing) {
    return note;
  }
  const parts = new Set(existing.split(',').map((part) => part.trim()).filter(Boolean));
  parts.add(note);
  return Array.from(parts).join(',');
}

async function resolveUrlOnce(url: string, signal: AbortSignal): Promise<Response> {
  return fetch(url, {
    method: 'HEAD',
    redirect: 'manual',
    signal
  });
}

async function resolveUrl(url: string, timeoutMs: number): Promise<{ final?: string; reason?: 'timeout' | 'error' }>
{
  let current = url;
  for (let hop = 0; hop < MAX_REDIRECT_HOPS; hop += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await resolveUrlOnce(current, controller.signal);
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (location) {
          current = new URL(location, current).toString();
          clearTimeout(timer);
          continue;
        }
      }
      if (response.status === 405) {
        const fallbackResponse = await fetch(current, {
          method: 'GET',
          redirect: 'manual',
          signal: controller.signal
        });
        const location = fallbackResponse.headers.get('location');
        if (location) {
          current = new URL(location, current).toString();
          clearTimeout(timer);
          continue;
        }
      }
      clearTimeout(timer);
      return { final: current };
    } catch (error: unknown) {
      clearTimeout(timer);
      if (error instanceof DOMException && error.name === 'AbortError') {
        return { reason: 'timeout' };
      }
      return { reason: 'error' };
    }
  }
  return { final: current };
}

async function ensureShortExpansionPermission(): Promise<boolean> {
  return chrome.permissions.contains({ origins: ['http://*/*', 'https://*/*'] });
}

async function expandLinks(
  links: LinkScanResult[],
  enabled: boolean
): Promise<LinkScanResult[]> {
  if (!enabled) {
    return links.map((link) => ({ ...link, final: link.final ?? link.cleaned, expanded: false }));
  }
  const granted = await ensureShortExpansionPermission();
  if (!granted) {
    return links.map((link) => ({ ...link, final: link.final ?? link.cleaned, expanded: false }));
  }

  return Promise.all(
    links.map(async (link) => {
      if (!needsExpansion(link.cleaned)) {
        return { ...link, final: link.final ?? link.cleaned, expanded: false };
      }
      const result = await resolveUrl(link.cleaned, SHORT_EXPANSION_TIMEOUT_MS);
      if (result.final) {
        return { ...link, final: result.final, expanded: true };
      }
      const note = result.reason === 'timeout' ? 'expand-timeout' : 'expand-error';
      return {
        ...link,
        final: link.cleaned,
        expanded: false,
        notes: combineNotes(link.notes, note)
      } satisfies LinkScanResult;
    })
  );
}

async function downloadCsv(rows: LinkScanResult[]): Promise<void> {
  const csv = createCsv(
    rows.map((row) => ({
      original: row.original,
      cleaned: row.cleaned,
      final: row.final ?? row.cleaned
    }))
  );
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  await chrome.downloads.download({
    url,
    filename: `cleanlink-${Date.now()}.csv`,
    saveAs: false
  });
  URL.revokeObjectURL(url);
}

function toHistoryItems(links: LinkScanResult[]): HistoryItem[] {
  const timestamp = Date.now();
  return links.map((link) => {
    let site: string | undefined;
    try {
      site = new URL(link.cleaned).hostname;
    } catch (_error) {
      site = undefined;
    }
    return {
      id: makeId(),
      time: timestamp,
      original: link.original,
      cleaned: link.cleaned,
      final: link.final ?? link.cleaned,
      expanded: Boolean(link.final && link.final !== link.cleaned) || Boolean(link.expanded),
      notes: link.notes,
      site
    } satisfies HistoryItem;
  });
}

async function handleScanOrClean(kind: 'SCAN_CURRENT' | 'CLEAN_CURRENT' | 'BULK_CLEAN'):
  Promise<CleanLinkResponse<ScanLinksResponse>> {
  const tab = await getActiveTab();
  if (!tab?.id) {
    return { ok: false, errorCode: 'VALIDATION', message: 'No active tab.' };
  }
  if (isUnsupportedUrl(tab.url)) {
    return {
      ok: false,
      errorCode: 'UNSUPPORTED_PAGE',
      message: "This page can't be cleaned. Open a regular website."
    };
  }

  const response = await forwardToContent<LinkScanResult[]>(tab.id, { kind });
  if (!response.ok || !response.data) {
    return response as CleanLinkResponse<ScanLinksResponse>;
  }

  const snapshot = await loadStorage();
  const expanded = await expandLinks(response.data, snapshot.settings.expandShort);
  const summary = summarizeLinks(expanded);

  if (kind !== 'SCAN_CURRENT') {
    const historyItems = toHistoryItems(expanded);
    await appendHistory(historyItems);
  }
  if (kind === 'BULK_CLEAN') {
    await downloadCsv(expanded);
  }

  return { ok: true, data: { links: expanded, summary } };
}

async function handleMessage(message: CleanLinkMessage): Promise<CleanLinkResponse> {
  switch (message.kind) {
    case 'SCAN_CURRENT':
    case 'CLEAN_CURRENT':
    case 'BULK_CLEAN':
      return handleScanOrClean(message.kind);
    case 'FETCH_HISTORY': {
      const history = await getHistory();
      return { ok: true, data: history };
    }
    case 'CLEAR_HISTORY': {
      await clearHistory();
      return { ok: true };
    }
    case 'VERIFY_LICENSE': {
      if (!message.payload || typeof message.payload !== 'object') {
        return { ok: false, errorCode: 'VALIDATION', message: 'Missing license code' };
      }
      const { code } = message.payload as { code: string };
      const state = verifyLicense(code, LICENSE_PUBLIC_KEY);
      await saveLicense(state);
      return { ok: state.status === 'valid', data: state };
    }
    case 'UPDATE_SETTINGS': {
      const payload = (message.payload ?? {}) as Partial<Settings>;
      const snapshot = await loadStorage();
      const next: Settings = { ...snapshot.settings, ...payload };
      await saveSettings(next);
      return { ok: true, data: next };
    }
    case 'UPDATE_SITE_OVERRIDE': {
      if (!message.payload || typeof message.payload !== 'object') {
        return { ok: false, errorCode: 'VALIDATION', message: 'Invalid site override payload' };
      }
      const { domain, state } = message.payload as { domain: string; state: SiteOverrideState | null };
      if (!domain) {
        return { ok: false, errorCode: 'VALIDATION', message: 'Domain required' };
      }
      await updateSiteOverride(domain, state ?? null);
      return { ok: true };
    }
    default:
      return { ok: false, errorCode: 'VALIDATION', message: 'Unknown message kind' };
  }
}

chrome.runtime.onMessage.addListener((message: CleanLinkMessage, sender, sendResponse) => {
  void appendDiagnostic({
    id: makeId(),
    ts: Date.now(),
    event: `message:${message.kind}`,
    metadata: { from: sender.tab?.id ?? sender.id }
  });
  handleMessage(message)
    .then((response) => sendResponse(response))
    .catch((error: unknown) => {
      sendResponse({
        ok: false,
        errorCode: 'NETWORK',
        message: error instanceof Error ? error.message : String(error)
      });
    });
  return true;
});

chrome.commands.onCommand.addListener((command) => {
  if (command === 'clean-current-tab') {
    void handleScanOrClean('CLEAN_CURRENT');
  }
});

chrome.runtime.onInstalled.addListener(() => {
  void loadStorage();
});
