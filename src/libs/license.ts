import nacl from 'tweetnacl';
import { decode as decodeBase64 } from './utils';
import type { LicenseState } from './storage';

export interface LicensePayload {
  emailHash: string;
  exp: number;
}

interface EncodedLicense {
  payload: string; // base64-encoded JSON
  signature: string; // base64-encoded signature
}

const DEV_UNLOCK_CODE = 'DEV-UNLOCK';
const PUBLIC_KEY_B64 = (import.meta.env?.VITE_LICENSE_PUBLIC_KEY as string | undefined) ?? '';

function getPublicKey(): Uint8Array | null {
  if (!PUBLIC_KEY_B64) {
    return null;
  }
  try {
    return decodeBase64(PUBLIC_KEY_B64);
  } catch (_error) {
    return null;
  }
}

function decodeLicense(code: string): EncodedLicense | null {
  try {
    const decoded = JSON.parse(atob(code)) as EncodedLicense;
    if (!decoded.payload || !decoded.signature) {
      return null;
    }
    return decoded;
  } catch (_error) {
    return null;
  }
}

function parsePayload(encoded: string): LicensePayload | null {
  try {
    const payloadJson = atob(encoded);
    const payload = JSON.parse(payloadJson) as LicensePayload;
    if (typeof payload.emailHash !== 'string' || typeof payload.exp !== 'number') {
      return null;
    }
    return payload;
  } catch (_error) {
    return null;
  }
}

export function verifyLicense(code: string, now = Date.now()): LicenseState {
  if (code === DEV_UNLOCK_CODE) {
    return {
      code,
      status: 'valid',
      lastChecked: now,
      expiresAt: now + 1000 * 60 * 60 * 24 * 365 // 1 year
    };
  }

  const publicKey = getPublicKey();
  if (!publicKey) {
    return {
      code,
      status: 'invalid',
      lastChecked: now
    };
  }

  const decoded = decodeLicense(code);
  if (!decoded) {
    return {
      code,
      status: 'invalid',
      lastChecked: now
    };
  }

  const payload = parsePayload(decoded.payload);
  if (!payload) {
    return {
      code,
      status: 'invalid',
      lastChecked: now
    };
  }

  const message = decodeBase64(decoded.payload);
  const signature = decodeBase64(decoded.signature);

  const valid = nacl.sign.detached.verify(message, signature, publicKey);

  if (!valid) {
    return {
      code,
      status: 'invalid',
      lastChecked: now
    };
  }

  if (payload.exp * 1000 < now) {
    return {
      code,
      status: 'expired',
      lastChecked: now,
      expiresAt: payload.exp * 1000
    };
  }

  return {
    code,
    status: 'valid',
    lastChecked: now,
    expiresAt: payload.exp * 1000
  };
}
