import './minilix-brand.css';
import App from './AppPricingRules.jsx';
import V5Dashboard from './V5Dashboard.jsx';
import V5Clients from './V5Clients.jsx';
import V5Assets from './V5Assets.jsx';
import V54Reports from './V54Reports.jsx';
import V55Operational from './V55Operational.jsx';
import V56ClientRequests from './V56ClientRequests.jsx';
import V6Units from './V6Units.jsx';
import V61Clients from './V61Clients.jsx';

export default function AppV5(){
  return <><App/><V5Dashboard/><V5Clients/><V5Assets/><V54Reports/><V55Operational/><V56ClientRequests/><V6Units/><V61Clients/></>;
}
