export interface HistoryRecord {
  id: string;
  ts: number;
  original: string;
  cleaned: string;
  final: string;
  expanded: boolean;
  bulk: boolean;
  domain: string;
}
