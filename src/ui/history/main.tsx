import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
import type { HistoryItem } from '../../types/history';
import type { CleanLinkResponse } from '../../types/messages';
import { markUiReady } from '../shared/ready';

async function fetchHistory(): Promise<HistoryItem[]> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ kind: 'FETCH_HISTORY' }, (response: CleanLinkResponse<HistoryItem[]>) => {
      if (chrome.runtime.lastError || !response?.ok) {
        resolve([]);
        return;
      }
      resolve(response.data ?? []);
    });
  });
}

function useToast(delay = 1200) {
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    if (!message) {
      return;
    }
    const timer = setTimeout(() => setMessage(null), delay);
    return () => clearTimeout(timer);
  }, [message, delay]);
  return { message, setMessage };
}

function App() {
  const [records, setRecords] = useState<HistoryItem[]>([]);
  const { message, setMessage } = useToast();

  useEffect(() => {
    fetchHistory()
      .then((items) => {
        setRecords(items);
        markUiReady();
      })
      .catch(() => {
        setRecords([]);
        markUiReady();
      });
  }, []);

  const handleCopy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setMessage('Copied!');
    } catch (_error) {
      setMessage('Could not copy. Allow clipboard access.');
    }
  };

  return (
    <div className="history">
      <header>
        <h1>CleanLink History</h1>
        <p>Most recent 1,000 cleaned links.</p>
      </header>
      {records.length === 0 ? (
        <p className="empty">No history yet. Clean a page and come back!</p>
      ) : (
        <div className="table-wrapper">
          <table>
            <caption className="visually-hidden">Cleaned link history</caption>
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col">Before (Original)</th>
                <th scope="col">After (Final)</th>
                <th scope="col">Expanded</th>
                <th scope="col">Notes</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.id}>
                  <td data-label="Time">{new Date(record.time).toLocaleString()}</td>
                  <td data-label="Original">
                    <code title={record.original}>{record.original}</code>
                  </td>
                  <td data-label="Cleaned">
                    <button
                      className="link"
                      onClick={() => handleCopy(record.final)}
                      title={record.final}
                      aria-label="Copy cleaned URL"
                    >
                      <span>{record.final}</span>
                    </button>
                  </td>
                  <td data-label="Expanded">{record.expanded ? 'Yes' : 'No'}</td>
                  <td data-label="Notes">{record.notes ?? '—'}</td>
                  <td data-label="Cleaned">
                    <button onClick={() => handleCopy(record.original)} aria-label="Copy original URL">
                      Copy original
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {message && (
        <div className="toast" role="status">
          {message}
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
