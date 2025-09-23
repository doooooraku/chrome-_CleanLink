import './style.css';
import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { usePopupStore, bootstrapStore } from './store';
import type { LinkScanResult } from '../../types/messages';

function LinkRow({ link }: { link: LinkScanResult }) {
  const removed = link.removed.length > 0 ? link.removed.join(', ') : '—';
  const copyClean = async () => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(link.cleaned);
    }
  };
  const copyOriginal = async () => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(link.original);
    }
  };
  return (
    <tr>
      <td>
        <code title={link.original}>{link.original}</code>
      </td>
      <td>
        <code title={link.cleaned}>{link.cleaned}</code>
      </td>
      <td>{removed}</td>
      <td>
        <button onClick={copyClean}>Copy Clean</button>
        <button onClick={copyOriginal}>Copy Original</button>
        {link.expanded && <span className="badge">Expanded</span>}
      </td>
    </tr>
  );
}

function Header() {
  const { scan, clean, bulk, loading, proActive } = usePopupStore((state) => ({
    scan: state.scan,
    clean: state.clean,
    bulk: state.bulk,
    loading: state.loading,
    proActive: state.proActive
  }));
  return (
    <div className="actions">
      <button onClick={clean} disabled={loading} className="primary">
        Clean & Copy
      </button>
      <button onClick={scan} disabled={loading}>
        Preview only
      </button>
      <button onClick={bulk} disabled={loading || !proActive}>
        Bulk clean + CSV
      </button>
    </div>
  );
}

function Settings() {
  const { autoClean, expandShort, toggleExpandShort, setSettings, proActive, openHistory } = usePopupStore((state) => ({
    autoClean: state.autoClean,
    expandShort: state.expandShort,
    setSettings: state.setSettings,
    toggleExpandShort: state.toggleExpandShort,
    proActive: state.proActive,
    openHistory: state.openHistory
  }));
  return (
    <section className="settings">
      <label>
        <input
          type="checkbox"
          checked={autoClean}
          onChange={(event) => setSettings({ autoClean: event.target.checked })}
        />
        Auto-clean this page
      </label>
      <label>
        <input
          type="checkbox"
          checked={expandShort}
          onChange={(event) => toggleExpandShort(event.target.checked)}
          disabled={!proActive}
        />
        Expand short URLs
      </label>
      {!proActive && <p className="hint">Enter a Pro license in Options to unlock.</p>}
      <button className="link" onClick={openHistory}>Open history</button>
    </section>
  );
}

function Summary() {
  const { links, loading, error, lastUpdated } = usePopupStore((state) => ({
    links: state.links,
    loading: state.loading,
    error: state.error,
    lastUpdated: state.lastUpdated
  }));

  if (loading) {
    return <p className="status">Scanning links…</p>;
  }
  if (error) {
    return (
      <p role="alert" className="status error">
        {error}
      </p>
    );
  }
  if (links.length === 0) {
    return <p className="status">No links found on this page.</p>;
  }

  return (
    <div className="results">
      <table>
        <thead>
          <tr>
            <th>Original</th>
            <th>Cleaned</th>
            <th>Removed</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {links.map((link) => (
            <LinkRow key={link.original + link.cleaned} link={link} />
          ))}
        </tbody>
      </table>
      <footer>
        <small>Updated: {lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : '—'}</small>
      </footer>
    </div>
  );
}

function App() {
  const { scan } = usePopupStore((state) => ({
    scan: state.scan
  }));
  useEffect(() => {
    void bootstrapStore().then(() => scan());
  }, [scan]);

  return (
    <div className="popup">
      <header>
        <h1>CleanLink Mini</h1>
        <p className="subtitle">Clean URLs before you share them.</p>
      </header>
      <Header />
      <Summary />
      <Settings />
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
