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

const COMMON_PREFIXES = ['utm_', 'icid', 'yclid'];
const COMMON_PARAMS = new Set([
  'gclid',
  'fbclid',
  'msclkid',
  'ttclid',
  'igshid',
  'mc_eid',
  'mc_cid',
  'spm',
  'ref_src',
  'ref_url',
  'ref',
  'tracking_id',
  'ck_subscriber_id',
  'campaignid',
  'dclid',
  'oly_enc_id',
  'oly_anon_id'
]);

interface DomainRule {
  domain: RegExp;
  preserve?: string[];
  remove?: string[];
  transform?: (url: URL) => void;
}

const DOMAIN_RULES: DomainRule[] = [
  {
    domain: /google\./,
    transform: (url) => {
      if (url.pathname === '/url') {
        const target = url.searchParams.get('url') || url.searchParams.get('q');
        if (target) {
          url.href = target;
        }
      }
    },
    remove: ['ved', 'usg', 'uact', 'sourceid', 'sa']
  },
  {
    domain: /youtube\.com$/,
    preserve: ['v', 't'],
    remove: ['feature', 'si', 'pp', 'start_radio']
  },
  {
    domain: /amazon\.(com|co\.uk|co\.jp|de|fr|it)/,
    preserve: ['k', 'ref_', 'gp'],
    remove: ['tag', 'ref', 'ascsubtag', 'linkCode', 'creativeASIN']
  }
];

const SAFE_QUERY_KEYS = new Set(['id', 'q', 's']);

const isShortLink = (original: string): boolean => {
  try {
    const url = new URL(original);
    const host = url.hostname;
    return /^(bit\.ly|t\.co|tinyurl\.com|is\.gd|buff\.ly|shorturl\.at|rebrand\.ly)$/i.test(host);
  } catch (_error) {
    return false;
  }
};

export const needsExpansion = (original: string): boolean => isShortLink(original);

export function cleanUrl(raw: string): CleanResult {
  const preserved: string[] = [];
  const removed: CleanDiff[] = [];
  let cleaned = raw;

  try {
    const url = new URL(raw);

    for (const rule of DOMAIN_RULES) {
      if (rule.domain.test(url.hostname)) {
        if (rule.transform) {
          rule.transform(url);
        }
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
      }
    }

    for (const [key, value] of Array.from(url.searchParams.entries())) {
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

    if (url.hash && /utm_|fbclid|gclid/.test(url.hash)) {
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
