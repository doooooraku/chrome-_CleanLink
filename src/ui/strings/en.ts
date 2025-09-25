export const strings = {
  title: 'CleanLink Mini',
  subtitle: 'Clean URLs before you share them.',
  empty: 'No links found on this page. Try another website.',
  loading: 'Scanning links…',
  unsupported: "This page can’t be cleaned. Open a regular website.",
  networkError: 'Could not analyze the page. Check your internet connection and try again.',
  copySuccess: 'Copied!',
  copyFailure: 'Could not copy. Allow clipboard access and try again.',
  autoClean: 'Auto-clean this site',
  expandShort: 'Expand short URLs',
  openHistory: 'Open History',
  openSettings: 'Open Settings',
  clean: 'Clean',
  copy: 'Copy cleaned URLs',
  cleanAndCopy: 'Clean & Copy',
  summary: (detected: number, changed: number, ignored: number) =>
    `Detected ${detected} | Changed ${changed} | Ignored ${ignored}`
};
