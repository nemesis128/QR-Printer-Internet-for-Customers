import { type FC } from 'react';

import { AdminNavRail } from '../components/AdminNavRail.js';
import { ChangePinWizard } from '../components/ChangePinWizard.js';
import { PinModal } from '../components/PinModal.js';
import { useAdminStore } from '../store/adminStore.js';

import { BusinessPanel } from './admin/BusinessPanel.js';
import { HomePanel } from './admin/HomePanel.js';
import { LogsPanel } from './admin/LogsPanel.js';
import { PrinterPanel } from './admin/PrinterPanel.js';
import { RouterPanel } from './admin/RouterPanel.js';
import { SchedulePanel } from './admin/SchedulePanel.js';
import { StatsPanel } from './admin/StatsPanel.js';

interface AdminViewProps {
  onExit: () => void;
}

export const AdminView: FC<AdminViewProps> = ({ onExit }) => {
  const sessionToken = useAdminStore((s) => s.sessionToken);
  const pinIsDefault = useAdminStore((s) => s.pinIsDefault);
  const error = useAdminStore((s) => s.error);
  const locked = useAdminStore((s) => s.locked);
  const remainingMs = useAdminStore((s) => s.remainingMs);
  const currentPanel = useAdminStore((s) => s.currentPanel);
  const attemptLogin = useAdminStore((s) => s.attemptLogin);
  const logout = useAdminStore((s) => s.logout);
  const setPinIsDefault = useAdminStore((s) => s.setPinIsDefault);

  if (!sessionToken) {
    return (
      <PinModal
        open
        onClose={onExit}
        onSubmit={(pin) => void attemptLogin(pin)}
        error={error}
        locked={locked}
        remainingMs={remainingMs}
      />
    );
  }

  if (pinIsDefault) {
    return (
      <div className="fixed inset-0 z-modal flex items-center justify-center bg-textPrimary/55">
        <ChangePinWizard
          onComplete={(newPin) => {
            void (async () => {
              const r = await window.api.admin.changePin({
                sessionToken,
                currentPin: '0000',
                newPin,
              });
              if (r.ok) setPinIsDefault(false);
            })();
          }}
          onCancel={onExit}
        />
      </div>
    );
  }

  const panel =
    currentPanel === 'home' ? (
      <HomePanel />
    ) : currentPanel === 'printer' ? (
      <PrinterPanel />
    ) : currentPanel === 'router' ? (
      <RouterPanel />
    ) : currentPanel === 'schedule' ? (
      <SchedulePanel />
    ) : currentPanel === 'business' ? (
      <BusinessPanel />
    ) : currentPanel === 'stats' ? (
      <StatsPanel />
    ) : (
      <LogsPanel />
    );

  return (
    <div className="flex h-screen bg-background">
      <AdminNavRail onLogout={() => { logout(); onExit(); }} />
      <main className="flex-1 overflow-auto p-8">{panel}</main>
    </div>
  );
};
