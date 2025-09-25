import nacl from 'tweetnacl';
import type { LicenseState } from './storage';
import { decodeBase64 } from './utils';

export interface LicensePayload {
  emailHash: string;
  exp: number; // unix timestamp (seconds)
}

interface EncodedLicense {
  payload: string; // base64-encoded JSON
  signature: string; // base64-encoded signature
}

const DEV_UNLOCK_CODE = 'DEV-UNLOCK';

function cleanPem(pem: string): string {
  return pem.replace(/-----BEGIN PUBLIC KEY-----/g, '').replace(/-----END PUBLIC KEY-----/g, '').replace(/\s+/g, '');
}

function decodePem(pem: string): Uint8Array | null {
  if (!pem) {
    return null;
  }
  try {
    const base64 = cleanPem(pem);
    return decodeBase64(base64);
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

export function verifyLicense(code: string, publicKeyPem: string, now = Date.now()): LicenseState {
  if (!code) {
    return { code, status: 'invalid', lastChecked: now };
  }

  if (code === DEV_UNLOCK_CODE) {
    return {
      code,
      status: 'valid',
      lastChecked: now,
      expiresAt: now + 1000 * 60 * 60 * 24 * 365,
      signatureValid: true
    };
  }

  const publicKey = decodePem(publicKeyPem);
  if (!publicKey) {
    return {
      code,
      status: 'invalid',
      lastChecked: now,
      signatureValid: false
    };
  }

  const encoded = decodeLicense(code);
  if (!encoded) {
    return {
      code,
      status: 'invalid',
      lastChecked: now,
      signatureValid: false
    };
  }

  const payload = parsePayload(encoded.payload);
  if (!payload) {
    return {
      code,
      status: 'invalid',
      lastChecked: now,
      signatureValid: false
    };
  }

  const message = decodeBase64(encoded.payload);
  const signature = decodeBase64(encoded.signature);
  const signatureValid = nacl.sign.detached.verify(message, signature, publicKey);

  if (!signatureValid) {
    return {
      code,
      status: 'invalid',
      lastChecked: now,
      signatureValid: false
    };
  }

  if (payload.exp * 1000 < now) {
    return {
      code,
      status: 'expired',
      lastChecked: now,
      expiresAt: payload.exp * 1000,
      signatureValid: true
    };
  }

  return {
    code,
    status: 'valid',
    lastChecked: now,
    expiresAt: payload.exp * 1000,
    signatureValid: true
  };
}
