export interface HistoryItem {
  id: string;
  time: number;
  original: string;
  cleaned: string;
  final: string;
  expanded: boolean;
  notes?: string;
  site?: string;
}
