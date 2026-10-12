import DocumentPortal from './DocumentPortal.jsx';
import './documents.css';
import React from 'react';
import {createRoot} from 'react-dom/client';
import FiscalPortal from './FiscalPortal.jsx';
import App from './App.jsx';
import PartnerPortal from './PartnerPortal.jsx';
import ClientPortal from './ClientPortal.jsx';
import './styles.css';
import './client.css';

const root=createRoot(document.getElementById('root'));
root.render(<React.StrictMode>{window.location.pathname.startsWith('/documentos')?<DocumentPortal/>:window.location.pathname.startsWith('/fiscal')?<FiscalPortal/>:window.location.pathname.startsWith('/parceiros/admin')?<PartnerPortal admin/>:window.location.pathname.startsWith('/parceiros')?<PartnerPortal/>:window.location.pathname.startsWith('/cliente')?<ClientPortal/>:<App/>}</React.StrictMode>);

if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));}
