import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

interface Settings {
  autoClean: boolean;
  previewOnly: boolean;
  expandShort: boolean;
}

interface LicenseInfo {
  code: string;
  status: 'valid' | 'invalid' | 'expired';
  lastChecked: number;
  expiresAt?: number;
}

async function sendMessage<T>(kind: string, payload?: unknown): Promise<T | null> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ kind, payload }, (response: { ok: boolean; data?: T; message?: string }) => {
      if (chrome.runtime.lastError || !response?.ok) {
        resolve(null);
        return;
      }
      resolve(response.data ?? null);
    });
  });
}

function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [licenseCode, setLicenseCode] = useState('');
  const [license, setLicense] = useState<LicenseInfo | null>(null);
  const [siteOverrides, setSiteOverrides] = useState<Record<string, 'allow' | 'block'>>({});
  const [domainInput, setDomainInput] = useState('');
  const [domainMode, setDomainMode] = useState<'allow' | 'block'>('block');

  useEffect(() => {
    chrome.storage.local.get(['settings', 'license', 'siteOverrides']).then((snapshot) => {
      setSettings(snapshot.settings ?? { autoClean: false, previewOnly: false, expandShort: false });
      setLicense(snapshot.license ?? null);
      setSiteOverrides(snapshot.siteOverrides ?? {});
    });
  }, []);

  const updateSetting = (key: keyof Settings, value: boolean) => {
    if (!settings) {
      return;
    }
    const next = { ...settings, [key]: value };
    setSettings(next);
    void sendMessage('UPDATE_SETTINGS', next);
  };

  const verifyLicense = async () => {
    if (!licenseCode) {
      return;
    }
    const result = await sendMessage<LicenseInfo>('VERIFY_LICENSE', { code: licenseCode });
    if (result) {
      setLicense(result);
    }
  };

  const addOverride = async () => {
    if (!domainInput) {
      return;
    }
    const next = { ...siteOverrides, [domainInput]: domainMode };
    setSiteOverrides(next);
    await chrome.storage.local.set({ siteOverrides: next });
    setDomainInput('');
  };

  const removeOverride = async (domain: string) => {
    const next = { ...siteOverrides };
    delete next[domain];
    setSiteOverrides(next);
    await chrome.storage.local.set({ siteOverrides: next });
  };

  const exportDiagnostics = async () => {
    const snapshot = await chrome.storage.local.get(['diagnostics']);
    const blob = new Blob([JSON.stringify(snapshot.diagnostics ?? [], null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    await chrome.downloads.download({
      url,
      filename: `cleanlink-diagnostics-${Date.now()}.json`,
      saveAs: true
    });
    URL.revokeObjectURL(url);
  };

  return (
    <div className="options">
      <header>
        <h1>CleanLink Settings</h1>
        <p>Configure automation, rules, and licensing.</p>
      </header>

      <section>
        <h2>General</h2>
        <label>
          <input
            type="checkbox"
            checked={settings?.autoClean ?? false}
            onChange={(event) => updateSetting('autoClean', event.target.checked)}
          />
          Auto-clean pages by default
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings?.previewOnly ?? false}
            onChange={(event) => updateSetting('previewOnly', event.target.checked)}
          />
          Start in preview mode
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings?.expandShort ?? false}
            onChange={(event) => updateSetting('expandShort', event.target.checked)}
          />
          Expand short URLs automatically
        </label>
      </section>

      <section>
        <h2>Per-site overrides</h2>
        <div className="grid">
          <input
            placeholder="example.com"
            value={domainInput}
            onChange={(event) => setDomainInput(event.target.value)}
          />
          <select value={domainMode} onChange={(event) => setDomainMode(event.target.value as 'allow' | 'block')}>
            <option value="allow">Always clean</option>
            <option value="block">Exclude from cleaning</option>
          </select>
          <button onClick={addOverride}>Save</button>
        </div>
        <ul>
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
        <h2>License</h2>
        <div className="grid">
          <input
            placeholder="Enter license code"
            value={licenseCode}
            onChange={(event) => setLicenseCode(event.target.value)}
          />
          <button onClick={verifyLicense}>Activate</button>
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
        <h2>Diagnostics</h2>
        <button onClick={exportDiagnostics}>Download diagnostics log</button>
      </section>
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
