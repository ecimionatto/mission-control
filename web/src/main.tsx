import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { cssVariables } from './theme';

const style = document.createElement('style');
style.textContent = cssVariables + `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: var(--bg-page); color: var(--text-primary); font-family: var(--font); font-size: 13px; line-height: 1.5; }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: var(--bg-page); }
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }

  /* Tablet (≤820px): single-column grid, bump font, 2-col token stats */
  @media (max-width: 820px) {
    body { font-size: 14px; }
    .mc-grid { grid-template-columns: 1fr !important; }
    .mc-grid > * { grid-column: 1 / -1 !important; min-width: 0 !important; }
    .token-stats { grid-template-columns: repeat(2, 1fr) !important; }
  }

  /* Phone (≤500px): stack PR rows into 2-row layout */
  @media (max-width: 500px) {
    .pr-row {
      grid-template-columns: auto 1fr !important;
      row-gap: 2px !important;
    }
    /* time cell: left-align in 2nd row */
    .pr-row > :last-child { text-align: left !important; }
  }
`;
document.head.appendChild(style);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
