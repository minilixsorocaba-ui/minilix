import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.jsx';
import ClientPortal from './ClientPortal.jsx';
import './styles.css';
import './client.css';

const root=createRoot(document.getElementById('root'));
root.render(<React.StrictMode>{window.location.pathname.startsWith('/cliente')?<ClientPortal/>:<App/>}</React.StrictMode>);

if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));}
