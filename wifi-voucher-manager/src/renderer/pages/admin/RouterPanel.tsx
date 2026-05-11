// src/renderer/pages/admin/RouterPanel.tsx
import { useEffect, useState, type FC } from 'react';

import { PasswordInput } from '../../components/PasswordInput.js';
import { useAdminConfig } from '../../hooks/useAdminConfig.js';
import { useAdminStore } from '../../store/adminStore.js';
import { useRouterStore } from '../../store/routerStore.js';

export const RouterPanel: FC = () => {
  const { config, reload } = useAdminConfig();
  const sessionToken = useAdminStore((s) => s.sessionToken);
  const { lastTestResult, runTestConnection } = useRouterStore();
  const [host, setHost] = useState('');
  const [user, setUser] = useState('');
  const [model, setModel] = useState('');
  const [ssidGuest, setSsidGuest] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pingResult, setPingResult] = useState<{ reachable: boolean; latencyMs: number; errorMessage?: string } | null>(null);
  const [newRouterPassword, setNewRouterPassword] = useState('');
  const [pwdFeedback, setPwdFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (config) {
      setHost(config.router.host);
      setUser(config.router.user);
      setModel(config.router.model);
      setSsidGuest(config.router.ssidGuest);
    }
  }, [config]);

  const save = async (): Promise<void> => {
    if (!sessionToken) return;
    const r = await window.api.admin.updateConfig({
      sessionToken,
      section: 'router',
      value: { host, user, model, ssidGuest },
    });
    setFeedback(r.ok ? 'Guardado.' : `Error: ${r.code}`);
    await reload();
  };

  const ping = async (): Promise<void> => {
    if (!sessionToken) return;
    setPingResult(null);
    const r = await window.api.router.pingRouter({ sessionToken, host });
    setPingResult(r);
  };

  const saveRouterPassword = async (): Promise<void> => {
    if (!sessionToken || !newRouterPassword) return;
    const r = await window.api.admin.setRouterPassword({ sessionToken, password: newRouterPassword });
    setPwdFeedback(r.ok ? 'Contraseña guardada.' : (r.message ?? 'Error'));
    if (r.ok) setNewRouterPassword('');
  };

  if (!config) return <p className="text-sm text-textSecondary">Cargando…</p>;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-textPrimary">Router</h1>

      <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-6 shadow-card">
        <h2 className="text-lg font-medium text-textPrimary">Conexión</h2>
        <label className="flex flex-col gap-1 text-sm text-textSecondary">
          IP del router
          <input
            type="text"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            placeholder="192.168.1.1"
            className="h-10 rounded-md border border-border bg-surface px-3 font-mono text-textPrimary"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-textSecondary">
          Usuario
          <input
            type="text"
            value={user}
            onChange={(e) => setUser(e.target.value)}
            className="h-10 rounded-md border border-border bg-surface px-3 text-textPrimary"
          />
        </label>
        <p className="text-xs text-textSecondary">
          La contraseña del router se almacena cifrada (safeStorage). Cambiarla aquí no muestra la actual; deja el campo vacío para conservar la guardada.
        </p>
        <PasswordInput value={newRouterPassword} onChange={setNewRouterPassword} label="Nueva contraseña router (opcional)" />
        <button
          type="button"
          disabled={!newRouterPassword}
          onClick={() => void saveRouterPassword()}
          className="self-start rounded-md bg-accent px-4 py-2 text-sm text-accentForeground hover:bg-accentHover disabled:opacity-50"
        >
          Guardar contraseña router
        </button>
        {pwdFeedback ? <p className="text-sm text-textSecondary">{pwdFeedback}</p> : null}
        <label className="flex flex-col gap-1 text-sm text-textSecondary">
          Modelo
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="h-10 rounded-md border border-border bg-surface px-3 text-textPrimary"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-textSecondary">
          SSID guest
          <input
            type="text"
            value={ssidGuest}
            onChange={(e) => setSsidGuest(e.target.value)}
            className="h-10 rounded-md border border-border bg-surface px-3 text-textPrimary"
          />
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void save()}
            className="rounded-md bg-accent px-4 py-2 text-sm text-accentForeground hover:bg-accentHover"
          >
            Guardar
          </button>
          <button
            type="button"
            onClick={() => void ping()}
            className="rounded-md border border-border bg-surface px-4 py-2 text-sm text-textPrimary hover:bg-surfaceMuted"
          >
            Probar alcanzabilidad
          </button>
          <button
            type="button"
            onClick={() => sessionToken && void runTestConnection(sessionToken)}
            className="rounded-md border border-border bg-surface px-4 py-2 text-sm text-textPrimary hover:bg-surfaceMuted"
          >
            Probar conexión
          </button>
        </div>
        {feedback ? <p className="text-sm text-textSecondary">{feedback}</p> : null}
      </section>

      {pingResult ? (
        <section
          className={`rounded-md border-l-[3px] bg-surface p-4 shadow-card ${
            pingResult.reachable ? 'border-success' : 'border-error'
          }`}
        >
          <p className="text-sm text-textPrimary">
            {pingResult.reachable
              ? `Router alcanzable (${pingResult.latencyMs} ms)`
              : `No alcanzable: ${pingResult.errorMessage ?? 'sin detalle'}`}
          </p>
        </section>
      ) : null}

      {lastTestResult ? (
        <section
          className={`rounded-md border-l-[3px] bg-surface p-4 shadow-card ${
            lastTestResult.ok ? 'border-success' : 'border-error'
          }`}
        >
          <p className="mb-2 text-sm text-textPrimary">
            {lastTestResult.ok
              ? `Conexión exitosa. SSID guest: ${lastTestResult.ssidGuest}`
              : `Falló: ${lastTestResult.errorMessage}`}
          </p>
          <ul className="ml-4 space-y-1 text-xs text-textSecondary">
            {lastTestResult.steps.map((s, idx) => (
              <li key={`${s.step}-${idx}`}>
                {s.ok ? '✓' : '✗'} {s.step} ({s.latencyMs} ms){s.detail ? ` — ${s.detail}` : ''}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
};
