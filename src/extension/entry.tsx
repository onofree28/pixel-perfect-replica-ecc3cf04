import { createRoot } from 'react-dom/client';
import { Assistant } from './Assistant';
const root = document.getElementById('root');
if (root) createRoot(root).render(<Assistant />);