import { migrateLegacyHistoryIfNeeded } from './history';

export interface Settings {
  autoCleanDefault: boolean;
  expandShort: boolean;
}

export type SiteOverrideState = 'always-clean' | 'skip';

export interface LicenseState {
  code: string;
  status: 'valid' | 'invalid' | 'expired';
  lastChecked: number;
  expiresAt?: number;
  signatureValid?: boolean;
}

export interface DiagnosticsEvent {
  id: string;
  ts: number;
  event: string;
  durationMs?: number;
  errorCode?: string;
  metadata?: Record<string, unknown>;
}

const DEFAULT_SETTINGS: Settings = {
  autoCleanDefault: false,
  expandShort: false
};

export interface StorageSnapshot {
  settings: Settings;
  siteOverrides: Record<string, SiteOverrideState>;
  license: LicenseState | null;
  diagnostics: DiagnosticsEvent[];
  schemaVersion: number;
}

const STORAGE_KEYS = ['settings', 'siteOverrides', 'license', 'diagnostics', 'schemaVersion'] as const;
const TARGET_SCHEMA_VERSION = 2;

export async function loadStorage(): Promise<StorageSnapshot> {
  await upgradeSchema();
  const result = await chrome.storage.local.get([...STORAGE_KEYS]);
  return {
    settings: { ...DEFAULT_SETTINGS, ...(result.settings ?? {}) },
    siteOverrides: result.siteOverrides ?? {},
    license: result.license ?? null,
    diagnostics: result.diagnostics ?? [],
    schemaVersion: result.schemaVersion ?? TARGET_SCHEMA_VERSION
  };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ settings });
}

export async function updateSiteOverride(domain: string, state: SiteOverrideState | null): Promise<void> {
  const snapshot = await chrome.storage.local.get(['siteOverrides']);
  const current = snapshot.siteOverrides ?? {};
  if (state === null) {
    delete current[domain];
  } else {
    current[domain] = state;
  }
  await chrome.storage.local.set({ siteOverrides: current });
}

export async function appendDiagnostic(event: DiagnosticsEvent): Promise<void> {
  const snapshot = await chrome.storage.local.get(['diagnostics']);
  const diagnostics: DiagnosticsEvent[] = snapshot.diagnostics ?? [];
  const next = [...diagnostics.slice(-99), event];
  await chrome.storage.local.set({ diagnostics: next });
}

export async function saveLicense(license: LicenseState | null): Promise<void> {
  await chrome.storage.local.set({ license });
}

async function upgradeSchema(): Promise<void> {
  const { schemaVersion = 1 } = await chrome.storage.local.get(['schemaVersion']);
  if (schemaVersion >= TARGET_SCHEMA_VERSION) {
    if (schemaVersion > TARGET_SCHEMA_VERSION) {
      await chrome.storage.local.set({ schemaVersion: TARGET_SCHEMA_VERSION });
    }
    return;
  }
  // schemaVersion 1 → 2: migrate history to chrome.storage.local
  await migrateLegacyHistoryIfNeeded();
  await chrome.storage.local.set({ schemaVersion: TARGET_SCHEMA_VERSION });
}
