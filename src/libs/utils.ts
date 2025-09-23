export function decode(source: string): Uint8Array {
  const binary = atob(source);
  const length = binary.length;
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export { decode as decodeBase64 };

export function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

export function makeId(): string {
  return crypto.randomUUID();
}
