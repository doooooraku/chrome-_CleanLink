import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
import type { CleanLinkResponse } from '../../types/messages';
import type { LicenseState, Settings, SiteOverrideState } from '../../libs/storage';
import { markUiReady } from '../shared/ready';

interface LicenseResponse extends LicenseState {}

async function sendMessage<T>(kind: string, payload?: unknown): Promise<CleanLinkResponse<T>> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ kind, payload }, (response: CleanLinkResponse<T>) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, errorCode: 'NETWORK', message: chrome.runtime.lastError.message });
        return;
      }
      resolve(response);
    });
  });
}

async function requestOptionalPermissions(): Promise<boolean> {
  return chrome.permissions.request({ origins: ['https://*/*', 'http://*/*'] });
}

function App() {
  const [settings, setSettings] = useState<Settings>({ autoCleanDefault: false, expandShort: false });
  const [license, setLicense] = useState<LicenseState | null>(null);
  const [siteOverrides, setSiteOverrides] = useState<Record<string, SiteOverrideState>>({});
  const [domainInput, setDomainInput] = useState('');
  const [domainMode, setDomainMode] = useState<SiteOverrideState>('always-clean');
  const [licenseCode, setLicenseCode] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    chrome.storage.local
      .get(['settings', 'license', 'siteOverrides'])
      .then((snapshot) => {
        setSettings(snapshot.settings ?? { autoCleanDefault: false, expandShort: false });
        setLicense(snapshot.license ?? null);
        setSiteOverrides(snapshot.siteOverrides ?? {});
        markUiReady();
      })
      .catch(() => {
        setSettings({ autoCleanDefault: false, expandShort: false });
        setSiteOverrides({});
        markUiReady();
      });
  }, []);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timer = setTimeout(() => setToast(null), 1500);
    return () => clearTimeout(timer);
  }, [toast]);

  const updateSettings = async (next: Partial<Settings>) => {
    const merged = { ...settings, ...next } satisfies Settings;
    setSettings(merged);
    await sendMessage<Settings>('UPDATE_SETTINGS', merged);
  };

  const handleExpandToggle = async (value: boolean) => {
    if (value) {
      const granted = await requestOptionalPermissions();
      if (!granted) {
        setToast('Permission required to expand short URLs.');
        return;
      }
    }
    await updateSettings({ expandShort: value });
  };

  const addOverride = async () => {
    const domain = domainInput.trim().toLowerCase();
    if (!domain) {
      return;
    }
    const next = { ...siteOverrides, [domain]: domainMode } satisfies Record<string, SiteOverrideState>;
    setSiteOverrides(next);
    await sendMessage<void>('UPDATE_SITE_OVERRIDE', { domain, state: domainMode });
    setDomainInput('');
  };

  const removeOverride = async (domain: string) => {
    const next = { ...siteOverrides } satisfies Record<string, SiteOverrideState>;
    delete next[domain];
    setSiteOverrides(next);
    await sendMessage<void>('UPDATE_SITE_OVERRIDE', { domain, state: null });
  };

  const clearHistory = async () => {
    const response = await sendMessage<void>('CLEAR_HISTORY');
    if (response.ok) {
      setToast('History cleared');
    }
  };

  const verifyLicense = async () => {
    if (!licenseCode) {
      return;
    }
    const response = await sendMessage<LicenseResponse>('VERIFY_LICENSE', { code: licenseCode });
    if (response.ok && response.data) {
      setLicense(response.data);
      setToast('License verified');
    } else {
      setToast(response.message ?? 'License invalid');
    }
  };

  return (
    <div className="options">
      <header>
        <h1>CleanLink Settings</h1>
        <p>Configure automation, rules, history, and licensing.</p>
      </header>

      <section>
        <h2>General</h2>
        <label>
          <input
            type="checkbox"
            checked={settings.autoCleanDefault}
            onChange={(event) => updateSettings({ autoCleanDefault: event.target.checked })}
          />
          Auto-clean pages by default
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings.expandShort}
            onChange={(event) => handleExpandToggle(event.target.checked)}
          />
          Expand short URLs (requires permission)
        </label>
        <button onClick={clearHistory}>Delete history</button>
      </section>

      <section>
        <h2>Site rules</h2>
        <div className="grid">
          <input
            placeholder="example.com"
            value={domainInput}
            onChange={(event) => setDomainInput(event.target.value)}
          />
          <select
            aria-label="Rule mode"
            value={domainMode}
            onChange={(event) => setDomainMode(event.target.value as SiteOverrideState)}
          >
            <option value="always-clean">Always clean</option>
            <option value="skip">Skip cleaning</option>
          </select>
          <button onClick={addOverride}>Save</button>
        </div>
        <ul className="overrides">
          {Object.entries(siteOverrides).length === 0 && <li className="empty">No overrides yet.</li>}
          {Object.entries(siteOverrides).map(([domain, mode]) => (
            <li key={domain}>
              <span>{domain}</span>
              <span className={`tag ${mode}`}>{mode}</span>
              <button onClick={() => removeOverride(domain)}>Remove</button>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Rules library</h2>
        <p>
          Tracking parameter definitions live in <code>src/libs/rules.json</code>. Update the file and reload the
          extension to apply new rules.
        </p>
      </section>

      <section>
        <h2>License</h2>
        <div className="grid">
          <input
            placeholder="Enter license code"
            value={licenseCode}
            onChange={(event) => setLicenseCode(event.target.value)}
          />
          <button onClick={verifyLicense}>Verify</button>
        </div>
        {license && (
          <p className={`license ${license.status}`}>
            Status: {license.status}
            {license.expiresAt && ` (expires ${new Date(license.expiresAt).toLocaleDateString()})`}
          </p>
        )}
        <p className="hint">Need help? Email support@cleanlink.app within 14 days for a refund.</p>
      </section>

      <section>
        <h2>Support</h2>
        <p>
          Download diagnostics from the popup to share with support. Privacy Policy and Terms will be published before
          release.
        </p>
      </section>

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
