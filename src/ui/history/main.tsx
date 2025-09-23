import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
import type { HistoryRecord } from '../../types/history';
import { fetchHistory } from '../../libs/history';

function App() {
  const [records, setRecords] = useState<HistoryRecord[]>([]);

  useEffect(() => {
    fetchHistory().then(setRecords).catch(() => setRecords([]));
  }, []);

  return (
    <div className="history">
      <header>
        <h1>CleanLink History</h1>
        <p>Most recent 1,000 cleaned links.</p>
      </header>
      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>Original</th>
            <th>Cleaned</th>
            <th>Final</th>
            <th>Expanded</th>
          </tr>
        </thead>
        <tbody>
          {records.length === 0 ? (
            <tr>
              <td colSpan={5}>No history yet.</td>
            </tr>
          ) : (
            records.map((record) => (
              <tr key={record.id}>
                <td>{new Date(record.ts).toLocaleString()}</td>
                <td>{record.original}</td>
                <td>{record.cleaned}</td>
                <td>{record.final}</td>
                <td>{record.expanded ? 'Yes' : 'No'}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
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
