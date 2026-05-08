import { useCallback, useEffect, useState } from 'react';

import type { SystemHealth } from '../../shared/types.js';

const POLL_INTERVAL_MS = 30_000;

export interface UseSystemHealthResult {
  health: SystemHealth | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useSystemHealth(): UseSystemHealthResult {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await window.api.waiter.getSystemHealth();
      setHealth(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido obteniendo salud del sistema');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
    const id = setInterval(() => {
      void refetch();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refetch]);

  return { health, isLoading, error, refetch };
}
