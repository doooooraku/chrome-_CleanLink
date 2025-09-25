import rulesConfig from './rules.json' assert { type: 'json' };

export type CleanReason = 'common' | 'domain';

export interface CleanDiff {
  key: string;
  reason: CleanReason;
  value?: string;
}

export interface CleanResult {
  original: string;
  cleaned: string;
  removed: CleanDiff[];
  preserved: string[];
}

interface DomainRule {
  pattern: string;
  preserve?: string[];
  remove?: string[];
  transform?: 'googleRedirect';
}

interface RulesConfig {
  commonPrefixes: string[];
  commonParams: string[];
  safeQueryKeys: string[];
  domainRules: DomainRule[];
  shortDomains: string[];
  sensitiveKeywords: string[];
}

const cachedRules: RulesConfig = rulesConfig satisfies RulesConfig;
const COMMON_PARAMS = new Set(cachedRules.commonParams.map((param) => param.toLowerCase()));
const COMMON_PREFIXES = cachedRules.commonPrefixes.map((prefix) => prefix.toLowerCase());
const SAFE_QUERY_KEYS = new Set(cachedRules.safeQueryKeys.map((key) => key.toLowerCase()));
const SENSITIVE_KEYWORDS = cachedRules.sensitiveKeywords.map((keyword) => keyword.toLowerCase());
const SHORT_DOMAINS = cachedRules.shortDomains.map((domain) => domain.toLowerCase());

function matchesDomain(rule: DomainRule, hostname: string): boolean {
  try {
    const regex = new RegExp(rule.pattern, 'i');
    return regex.test(hostname);
  } catch (_error) {
    return false;
  }
}

function applyTransform(rule: DomainRule, url: URL): void {
  if (!rule.transform) {
    return;
  }
  switch (rule.transform) {
    case 'googleRedirect': {
      if (url.pathname === '/url') {
        const target = url.searchParams.get('url') ?? url.searchParams.get('q');
        if (target) {
          try {
            url.href = target;
          } catch (_error) {
            // noop
          }
        }
      }
      break;
    }
    default:
      break;
  }
}

function removeDomainParams(rule: DomainRule, url: URL, removed: CleanDiff[]): string[] {
  const preserved: string[] = [];
  if (rule.remove) {
    for (const key of rule.remove) {
      if (url.searchParams.has(key)) {
        removed.push({ key, reason: 'domain', value: url.searchParams.get(key) ?? undefined });
        url.searchParams.delete(key);
      }
    }
  }
  if (rule.preserve) {
    preserved.push(...rule.preserve);
  }
  return preserved;
}

export function cleanUrl(raw: string): CleanResult {
  const preserved: string[] = [];
  const removed: CleanDiff[] = [];
  let cleaned = raw;

  try {
    const url = new URL(raw);

    for (const rule of cachedRules.domainRules) {
      if (!matchesDomain(rule, url.hostname)) {
        continue;
      }
      applyTransform(rule, url);
      preserved.push(...removeDomainParams(rule, url, removed));
    }

    for (const [key, value] of url.searchParams.entries()) {
      const lower = key.toLowerCase();
      const shouldRemove =
        COMMON_PARAMS.has(lower) ||
        COMMON_PREFIXES.some((prefix) => lower.startsWith(prefix)) ||
        (!SAFE_QUERY_KEYS.has(lower) && lower.startsWith('amp;'));
      if (shouldRemove) {
        removed.push({ key, reason: 'common', value });
        url.searchParams.delete(key);
      }
    }

    if (url.hash && /utm_|fbclid|gclid/i.test(url.hash)) {
      removed.push({ key: '#fragment', reason: 'common', value: url.hash });
      url.hash = '';
    }

    cleaned = url.toString();
  } catch (_error) {
    // return as-is on invalid URL
  }

  return {
    original: raw,
    cleaned,
    removed,
    preserved
  };
}

export function needsExpansion(target: string): boolean {
  try {
    const url = new URL(target);
    return SHORT_DOMAINS.includes(url.hostname.toLowerCase());
  } catch (_error) {
    return false;
  }
}

function includesKeyword(value: string): boolean {
  const lower = value.toLowerCase();
  return SENSITIVE_KEYWORDS.some((keyword) => lower.includes(keyword));
}

export function isSensitiveUrl(input: string): boolean {
  try {
    const url = new URL(input);
    if (!/^https?:/.test(url.protocol)) {
      return false;
    }
    if (includesKeyword(url.hostname)) {
      return true;
    }
    if (includesKeyword(url.pathname)) {
      return true;
    }
    for (const [key, value] of url.searchParams.entries()) {
      if (includesKeyword(key) || includesKeyword(value)) {
        return true;
      }
    }
    return false;
  } catch (_error) {
    return false;
  }
}

export function shouldSkipUrl(input: string): boolean {
  if (!input) {
    return false;
  }
  if (isSensitiveUrl(input)) {
    return true;
  }
  try {
    const url = new URL(input);
    return url.protocol !== 'http:' && url.protocol !== 'https:';
  } catch (_error) {
    return false;
  }
}

export type { RulesConfig, DomainRule };

export function createCsv(rows: Array<{ original: string; cleaned: string; final: string }>): string {
  const header = 'original,cleaned,final';
  const body = rows
    .map(({ original, cleaned, final }) =>
      [original, cleaned, final]
        .map((field) => `"${field.replace(/"/g, '""')}"`)
        .join(',')
    )
    .join('\n');
  return `${header}\n${body}`;
}
