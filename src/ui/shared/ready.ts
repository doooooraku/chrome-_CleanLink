export function markUiReady(): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return;
  }
  document.body?.setAttribute('data-ready', 'true');
  (window as Record<string, unknown>).CleanLinkReady = true;
}
