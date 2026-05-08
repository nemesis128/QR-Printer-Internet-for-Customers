import './styles/fonts.js';
import './styles/global.css';

import React from 'react';
import ReactDOM from 'react-dom/client';

import { App } from './App.js';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('No se encontró el elemento #root en index.html');

const root = ReactDOM.createRoot(rootEl);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
