import './style.css';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { usePopupStore, bootstrapStore } from './store';
import { strings } from '../strings/en';
import { markUiReady } from '../shared/ready';

function useCopyFeedback() {
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  useEffect(() => {
    if (status === 'idle') {
      return;
    }
    const timer = setTimeout(() => setStatus('idle'), 1200);
    return () => clearTimeout(timer);
  }, [status]);
  return { status, setStatus };
}

function Summary() {
  const { summary, loading, error, links } = usePopupStore((state) => ({
    summary: state.summary,
    loading: state.loading,
    error: state.error,
    links: state.links
  }));

  if (loading) {
    return <p className="status" aria-live="polite">{strings.loading}</p>;
  }
  if (error) {
    return (
      <p className="status error" role="alert">
        {error}
      </p>
    );
  }
  const summaryText = strings.summary(summary.detected, summary.changed, summary.ignored);

  if (!links.length) {
    return (
      <div className="summary-group">
        <div className="summary" aria-live="polite">
          {summaryText}
        </div>
        <p className="status" aria-live="polite">{strings.empty}</p>
      </div>
    );
  }
  return (
    <div className="summary" aria-live="polite">
      {summaryText}
    </div>
  );
}

function Actions() {
  const { status, setStatus } = useCopyFeedback();
  const { loading, clean, copyCleaned, cleanAndCopy } = usePopupStore((state) => ({
    loading: state.loading,
    clean: state.clean,
    copyCleaned: state.copyCleaned,
    cleanAndCopy: state.cleanAndCopy
  }));

  const handleCopy = async () => {
    const ok = await copyCleaned();
    setStatus(ok ? 'success' : 'error');
  };

  const handleCleanAndCopy = async () => {
    const ok = await cleanAndCopy();
    setStatus(ok ? 'success' : 'error');
  };

  return (
    <div className="actions">
      <button onClick={clean} disabled={loading} className="primary">
        {strings.clean}
      </button>
      <button onClick={handleCopy} disabled={loading}>
        {strings.copy}
      </button>
      <button onClick={handleCleanAndCopy} disabled={loading}>
        {strings.cleanAndCopy}
      </button>
      {status !== 'idle' && (
        <div className={`toast ${status === 'success' ? 'success' : 'error'}`} role="status">
          {status === 'success' ? strings.copySuccess : strings.copyFailure}
        </div>
      )}
    </div>
  );
}

function Toggles() {
  const { expandShort, toggleExpandShort, autoCleanThisSite, toggleAutoCleanSite, proActive } = usePopupStore((state) => ({
    expandShort: state.expandShort,
    toggleExpandShort: state.toggleExpandShort,
    autoCleanThisSite: state.autoCleanThisSite,
    toggleAutoCleanSite: state.toggleAutoCleanSite,
    proActive: state.proActive
  }));
  return (
    <section className="toggles">
      <label>
        <input
          type="checkbox"
          checked={autoCleanThisSite}
          onChange={(event) => void toggleAutoCleanSite(event.target.checked)}
        />
        {strings.autoClean}
      </label>
      <label>
        <input
          type="checkbox"
          checked={expandShort}
          onChange={(event) => void toggleExpandShort(event.target.checked)}
          disabled={!proActive}
        />
        {strings.expandShort}
      </label>
      {!proActive && <p className="hint">Pro required for short URL expansion.</p>}
    </section>
  );
}

function Links() {
  const { openHistory, openOptions } = usePopupStore((state) => ({
    openHistory: state.openHistory,
    openOptions: state.openOptions
  }));
  return (
    <div className="nav-links">
      <button className="link" onClick={openHistory}>
        {strings.openHistory}
      </button>
      <button className="link" onClick={openOptions}>
        {strings.openSettings}
      </button>
    </div>
  );
}

function App() {
  const { scan } = usePopupStore((state) => ({ scan: state.scan }));

  useEffect(() => {
    void bootstrapStore().then(() => scan());
  }, [scan]);

  useEffect(() => {
    markUiReady();
  }, []);

  return (
    <div className="popup">
      <header>
        <h1>{strings.title}</h1>
        <p className="subtitle">{strings.subtitle}</p>
      </header>
      <Summary />
      <Actions />
      <Toggles />
      <Links />
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
