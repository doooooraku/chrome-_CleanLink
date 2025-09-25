export type MessageKind =
  | 'SCAN_CURRENT'
  | 'CLEAN_CURRENT'
  | 'BULK_CLEAN'
  | 'FETCH_HISTORY'
  | 'CLEAR_HISTORY'
  | 'VERIFY_LICENSE'
  | 'UPDATE_SETTINGS';

export interface CleanLinkMessage {
  kind: MessageKind;
  payload?: unknown;
}

export interface LinkScanResult {
  original: string;
  cleaned: string;
  href: string;
  removed: string[];
  preserved: string[];
  final?: string;
  expanded?: boolean;
  notes?: string;
}

export interface LinkSummary {
  detected: number;
  changed: number;
  ignored: number;
}

export interface ScanLinksResponse {
  links: LinkScanResult[];
  summary: LinkSummary;
}

export interface CleanLinkResponse<T = unknown> {
  ok: boolean;
  data?: T;
  errorCode?: 'PERMISSION_DENIED' | 'TIMEOUT' | 'NETWORK' | 'VALIDATION' | 'UNSUPPORTED_PAGE';
  message?: string;
}
