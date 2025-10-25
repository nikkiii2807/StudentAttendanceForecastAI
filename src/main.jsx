import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css'; // this is where Tailwind is imported

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
