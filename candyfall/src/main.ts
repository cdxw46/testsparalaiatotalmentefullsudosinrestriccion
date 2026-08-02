import './style.scss';
import { CandyfallApp } from './ui/app';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) {
  throw new Error('Missing #app root');
}

new CandyfallApp(app);
