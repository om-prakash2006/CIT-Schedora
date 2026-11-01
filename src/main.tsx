import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { installFetchInterceptor } from './utils/apiClient.ts';

installFetchInterceptor();

createRoot(document.getElementById('root')!).render(<App />);
