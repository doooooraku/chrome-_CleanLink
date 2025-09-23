export type MessageKind =
  | 'SCAN_LINKS'
  | 'CLEAN_LINKS'
  | 'BULK_CLEAN'
  | 'EXPAND_SHORT'
  | 'SAVE_HISTORY'
  | 'FETCH_HISTORY'
  | 'VERIFY_LICENSE'
  | 'UPDATE_SETTINGS';

export interface CleanLinkMessage {
  kind: MessageKind;
  payload?: unknown;
}

export interface ScanLinksResponse {
  ok: boolean;
  data: LinkScanResult[];
}

export interface LinkScanResult {
  original: string;
  cleaned: string;
  href: string;
  removed: string[];
  preserved: string[];
  expanded?: string;
}

export interface CleanLinkResponse<T = unknown> {
  ok: boolean;
  data?: T;
  errorCode?: 'PERMISSION_DENIED' | 'TIMEOUT' | 'NETWORK' | 'VALIDATION';
  message?: string;
}
