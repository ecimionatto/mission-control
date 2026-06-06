import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { cssVariables } from './theme';

// Inject CSS variables into the document
const style = document.createElement('style');
style.textContent = cssVariables + `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: var(--bg-page); color: var(--text-primary); font-family: var(--font); font-size: 13px; line-height: 1.5; }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: var(--bg-page); }
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
`;
document.head.appendChild(style);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
