import { useCallback, useEffect, useState } from 'react';

import type { AppConfigDTO } from '../../shared/types.js';
import { useAdminStore } from '../store/adminStore.js';

export function useAdminConfig(): {
  config: AppConfigDTO | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
} {
  const sessionToken = useAdminStore((s) => s.sessionToken);
  const [config, setConfig] = useState<AppConfigDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!sessionToken) {
      setConfig(null);
      return;
    }
    setLoading(true);
    try {
      const cfg = await window.api.admin.getConfig({ sessionToken });
      setConfig(cfg);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando configuración');
    } finally {
      setLoading(false);
    }
  }, [sessionToken]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { config, loading, error, reload };
}
