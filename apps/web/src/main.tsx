import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './index.css';
import { syncTimeOnce } from './lib/api';
import { Home } from './pages/Home';
import { Play } from './pages/Play';
import { Facilitator } from './pages/Facilitator';
import { Screen } from './pages/Screen';

syncTimeOnce();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/p/:code" element={<Play />} />
        <Route path="/gv" element={<Facilitator />} />
        <Route path="/gv/:code" element={<Screen />} />
        <Route path="*" element={<Home />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
