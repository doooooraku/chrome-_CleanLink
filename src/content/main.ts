import { cleanUrl } from '../libs/rules';
import type { CleanLinkMessage, CleanLinkResponse, LinkScanResult } from '../types/messages';

type OverrideState = 'allow' | 'block';

let autoClean = false;
let siteOverrides: Record<string, OverrideState> = {};

async function loadSettings() {
  const { settings, siteOverrides: overrides } = await chrome.storage.local.get(['settings', 'siteOverrides']);
  autoClean = settings?.autoClean ?? false;
  siteOverrides = overrides ?? {};
}

void loadSettings();

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') {
    return;
  }
  if (changes.settings) {
    autoClean = changes.settings.newValue?.autoClean ?? false;
  }
  if (changes.siteOverrides) {
    siteOverrides = changes.siteOverrides.newValue ?? {};
  }
});

function shouldSkip(link: string): boolean {
  try {
    const url = new URL(link);
    const override = siteOverrides[url.hostname];
    return override === 'block';
  } catch (_error) {
    return false;
  }
}

function scanDocument(): LinkScanResult[] {
  const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'));
  return anchors.map((anchor) => {
    if (shouldSkip(anchor.href)) {
      return {
        original: anchor.href,
        cleaned: anchor.href,
        href: anchor.href,
        removed: [],
        preserved: []
      } satisfies LinkScanResult;
    }
    const result = cleanUrl(anchor.href);
    return {
      original: anchor.href,
      cleaned: result.cleaned,
      href: anchor.href,
      removed: result.removed.map((diff) => diff.key),
      preserved: result.preserved
    } satisfies LinkScanResult;
  });
}

function applyCleanedLinks(cleaned: LinkScanResult[]): void {
  const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'));
  cleaned.forEach((item) => {
    const match = anchors.find((anchor) => anchor.href === item.original);
    if (match && match.href !== item.cleaned && !shouldSkip(item.original)) {
      match.href = item.cleaned;
    }
  });
}

chrome.runtime.onMessage.addListener((message: CleanLinkMessage, sender, sendResponse) => {
  if (!message || typeof message.kind !== 'string') {
    return;
  }

  const respond = (response: CleanLinkResponse) => {
    sendResponse(response);
  };

  switch (message.kind) {
    case 'SCAN_LINKS': {
      const data = scanDocument();
      if (autoClean) {
        applyCleanedLinks(data);
      }
      respond({ ok: true, data });
      break;
    }
    case 'CLEAN_LINKS': {
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
  if (!autoClean) {
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
