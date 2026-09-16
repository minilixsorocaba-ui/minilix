import './minilix-brand.css';
import App from './AppPricingRules.jsx';
import V5Dashboard from './V5Dashboard.jsx';
import V5Clients from './V5Clients.jsx';
import V5Assets from './V5Assets.jsx';
import V54Reports from './V54Reports.jsx';
import V55Operational from './V55Operational.jsx';

export default function AppV5(){
  return <><App/><V5Dashboard/><V5Clients/><V5Assets/><V54Reports/><V55Operational/></>;
}
