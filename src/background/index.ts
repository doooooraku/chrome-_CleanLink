import { createCsv, needsExpansion } from "../libs/rules";
import { appendDiagnostic, loadStorage, saveLicense, saveSettings } from '../libs/storage';
import { saveHistory, trimHistory } from '../libs/history';
import { makeId } from '../libs/utils';
import { verifyLicense } from '../libs/license';
import type { CleanLinkMessage, CleanLinkResponse, LinkScanResult } from '../types/messages';
import type { HistoryRecord } from '../types/history';
import type { Settings } from '../libs/storage';

async function getActiveTabId(): Promise<number | undefined> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0]?.id;
}

async function forwardToContent<T = unknown>(tabId: number, message: CleanLinkMessage): Promise<CleanLinkResponse<T>> {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response: CleanLinkResponse<T>) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, errorCode: 'VALIDATION', message: chrome.runtime.lastError.message });
        return;
      }
      resolve(response);
    });
  });
}

async function ensurePermissions(): Promise<boolean> {
  return chrome.permissions.contains({ origins: ['http://*/*', 'https://*/*'] });
}

async function expandLinks(links: LinkScanResult[], enabled: boolean): Promise<LinkScanResult[]> {
  if (!enabled) {
    return links;
  }
  const granted = await ensurePermissions();
  if (!granted) {
    return links;
  }
  const controller = new AbortController();
  const tasks = links.map(async (link) => {
    if (!needsExpansion(link.cleaned)) {
      return link;
    }
    try {
      const finalUrl = await resolveUrl(link.cleaned, controller.signal);
      return { ...link, expanded: finalUrl };
    } catch (_error) {
      return { ...link, expanded: undefined };
    }
  });
  return Promise.all(tasks);
}

async function resolveUrl(url: string, signal: AbortSignal): Promise<string> {
  let current = url;
  for (let i = 0; i < 5; i += 1) {
    const response = await fetch(current, {
      method: 'HEAD',
      redirect: 'manual',
      signal
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (location) {
        current = new URL(location, current).toString();
        continue;
      }
    }
    if (response.status === 405) {
      const getResponse = await fetch(current, {
        method: 'GET',
        redirect: 'manual',
        signal
      });
      const location = getResponse.headers.get('location');
      if (location) {
        current = new URL(location, current).toString();
        continue;
      }
    }
    break;
  }
  return current;
}

async function downloadCsv(rows: LinkScanResult[]): Promise<void> {
  const csv = createCsv(
    rows.map((row) => ({
      original: row.original,
      cleaned: row.cleaned,
      final: row.expanded ?? row.cleaned
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

async function persistHistory(rows: LinkScanResult[], bulk: boolean): Promise<void> {
  const now = Date.now();
  await Promise.all(
    rows.map((row) => {
      let domain = '';
      try {
        domain = new URL(row.cleaned).hostname;
      } catch (_error) {
        domain = '';
      }
      return saveHistory({
        id: makeId(),
        ts: now,
        original: row.original,
        cleaned: row.cleaned,
        final: row.expanded ?? row.cleaned,
        expanded: Boolean(row.expanded),
        bulk,
        domain
      } satisfies HistoryRecord);
    })
  );
  await trimHistory();
}

async function handleClean(kind: 'SCAN_LINKS' | 'CLEAN_LINKS' | 'BULK_CLEAN' | 'EXPAND_SHORT'): Promise<CleanLinkResponse> {
  const tabId = await getActiveTabId();
  if (!tabId) {
    return { ok: false, errorCode: 'VALIDATION', message: 'No active tab.' };
  }

  const forwardKind = kind === 'EXPAND_SHORT' ? 'SCAN_LINKS' : kind;
  const response = await forwardToContent<LinkScanResult[]>(tabId, { kind: forwardKind });
  if (!response.ok || !response.data) {
    return response;
  }
  const snapshot = await loadStorage();
  const expanded = await expandLinks(response.data, snapshot.settings.expandShort);

  if (kind === 'CLEAN_LINKS') {
    await persistHistory(expanded, false);
  }
  if (kind === 'BULK_CLEAN') {
    await persistHistory(expanded, true);
    await downloadCsv(expanded);
  }

  return { ok: true, data: expanded };
}

async function handleMessage(message: CleanLinkMessage): Promise<CleanLinkResponse> {
  switch (message.kind) {
    case 'SCAN_LINKS':
    case 'CLEAN_LINKS':
    case 'BULK_CLEAN':
    case 'EXPAND_SHORT':
      return handleClean(message.kind);
    case 'SAVE_HISTORY': {
      if (!Array.isArray(message.payload)) {
        return { ok: false, errorCode: 'VALIDATION', message: 'Invalid payload' };
      }
      await persistHistory(message.payload as LinkScanResult[], false);
      return { ok: true };
    }
    case 'FETCH_HISTORY': {
      const snapshot = await chrome.storage.local.get(['history']);
      return { ok: true, data: snapshot.history ?? [] };
    }
    case 'VERIFY_LICENSE': {
      if (!message.payload || typeof message.payload !== 'object') {
        return { ok: false, errorCode: 'VALIDATION', message: 'Missing license code' };
      }
      const { code } = message.payload as { code: string };
      const state = verifyLicense(code);
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
      sendResponse({ ok: false, errorCode: 'NETWORK', message: error instanceof Error ? error.message : String(error) });
    });
  return true;
});

chrome.action.onClicked.addListener(() => {
  void handleClean('CLEAN_LINKS');
});

chrome.commands.onCommand.addListener((command) => {
  if (command === 'clean-current-tab') {
    void handleClean('CLEAN_LINKS');
  }
});

chrome.runtime.onInstalled.addListener(() => {
  void loadStorage();
});
