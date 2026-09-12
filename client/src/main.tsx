// Bundles Monaco locally (no CDN, real language workers) before anything
// renders. Side-effect import: keep it first.
import './lib/monacoSetup';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
