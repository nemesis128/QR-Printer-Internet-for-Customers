// src/renderer/App.tsx
import { useState, type FC } from 'react';

import { AdminView } from './pages/AdminView.js';
import { WaiterView } from './pages/WaiterView.js';

export const App: FC = () => {
  const [view, setView] = useState<'waiter' | 'admin'>('waiter');

  if (view === 'admin') {
    return <AdminView onExit={() => setView('waiter')} />;
  }
  return <WaiterView onOpenAdmin={() => setView('admin')} />;
};
