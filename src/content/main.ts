import { cleanUrl, isSensitiveUrl } from '../libs/rules';
import type { CleanLinkMessage, CleanLinkResponse, LinkScanResult } from '../types/messages';
import type { SiteOverrideState } from '../libs/storage';

let autoCleanDefault = false;
let siteOverrides: Record<string, SiteOverrideState> = {};
let currentHost: string | null = null;

async function loadSettings(): Promise<void> {
  const { settings, siteOverrides: overrides } = await chrome.storage.local.get(['settings', 'siteOverrides']);
  autoCleanDefault = settings?.autoCleanDefault ?? false;
  siteOverrides = overrides ?? {};
}

void loadSettings();

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') {
    return;
  }
  if (changes.settings) {
    autoCleanDefault = changes.settings.newValue?.autoCleanDefault ?? false;
  }
  if (changes.siteOverrides) {
    siteOverrides = changes.siteOverrides.newValue ?? {};
  }
});

function getOverrideForHost(hostname: string): SiteOverrideState | null {
  return siteOverrides[hostname] ?? null;
}

function shouldAutoClean(hostname: string): boolean {
  const override = getOverrideForHost(hostname);
  if (override === 'always-clean') {
    return true;
  }
  if (override === 'skip') {
    return false;
  }
  return autoCleanDefault;
}

function buildLinkResult(anchor: HTMLAnchorElement): LinkScanResult {
  const href = anchor.href;
  const original = anchor.href;
  const protocol = anchor.protocol;
  const hostname = (() => {
    try {
      return new URL(original).hostname;
    } catch (_error) {
      return '';
    }
  })();
  const override = hostname ? getOverrideForHost(hostname) : null;
  const skipOverride = override === 'skip';
  const nonHttp = protocol !== 'http:' && protocol !== 'https:';
  const sensitive = !nonHttp && isSensitiveUrl(original);

  if (skipOverride || sensitive || nonHttp) {
    const notes = skipOverride ? 'skipped-site-override' : sensitive ? 'skipped-sensitive' : 'skipped-non-http';
    return {
      original,
      cleaned: original,
      href,
      removed: [],
      preserved: [],
      notes
    } satisfies LinkScanResult;
  }

  const result = cleanUrl(original);
  return {
    original,
    cleaned: result.cleaned,
    href,
    removed: result.removed.map((diff) => diff.key),
    preserved: result.preserved
  } satisfies LinkScanResult;
}

function scanDocument(): LinkScanResult[] {
  const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'));
  const hostname = (() => {
    try {
      return window.location.hostname;
    } catch (_error) {
      return '';
    }
  })();
  currentHost = hostname;
  return anchors.map((anchor) => buildLinkResult(anchor));
}

function applyCleanedLinks(cleaned: LinkScanResult[]): void {
  const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'));
  cleaned.forEach((item) => {
    if (item.notes === 'skipped-site-override' || item.notes === 'skipped-sensitive' || item.notes === 'skipped-non-http') {
      return;
    }
    const match = anchors.find((anchor) => anchor.href === item.original);
    if (match && match.href !== item.cleaned) {
      match.href = item.cleaned;
      match.setAttribute('data-cleanlink-original', item.original);
    }
  });
}

chrome.runtime.onMessage.addListener((message: CleanLinkMessage, sender, sendResponse) => {
  if (!message || typeof message.kind !== 'string') {
    return;
  }

  const respond = (response: CleanLinkResponse<LinkScanResult[]>) => {
    sendResponse(response);
  };

  switch (message.kind) {
    case 'SCAN_CURRENT': {
      const data = scanDocument();
      const host = currentHost ?? '';
      if (host && shouldAutoClean(host)) {
        applyCleanedLinks(data);
      }
      respond({ ok: true, data });
      break;
    }
    case 'CLEAN_CURRENT': {
      const data = scanDocument();
      applyCleanedLinks(data);
      respond({ ok: true, data });
      break;
    }
    case 'BULK_CLEAN': {
      const data = scanDocument();
      applyCleanedLinks(data);
      respond({ ok: true, data });
      break;
    }
    default:
      respond({ ok: false, errorCode: 'VALIDATION', message: 'Unknown message' });
      break;
  }

  return true;
});

const observer = new MutationObserver(() => {
  if (!currentHost) {
    return;
  }
  if (!shouldAutoClean(currentHost)) {
    return;
  }
  const data = scanDocument();
  applyCleanedLinks(data);
});

if (document.documentElement) {
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['href']
  });
}
