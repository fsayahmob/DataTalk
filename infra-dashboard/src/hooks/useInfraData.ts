import { useState, useEffect, useCallback, useRef } from 'react';
import type { InfraData, ContainerStats } from '../types/infra.js';

// In production, use relative URLs (same origin). In dev, proxy handles it via vite.config.ts
const API_URL = import.meta.env.VITE_API_URL || '';

// Auto-refresh interval (5 seconds)
const POLLING_INTERVAL = 5000;

interface UseInfraDataResult {
  data: InfraData | null;
  stats: ContainerStats[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  lastUpdate: Date | null;
  autoRefresh: boolean;
  setAutoRefresh: (enabled: boolean) => void;
}

export function useInfraData(): UseInfraDataResult {
  const [data, setData] = useState<InfraData | null>(null);
  const [stats, setStats] = useState<ContainerStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const previousDataRef = useRef<string | null>(null);

  const fetchData = useCallback(async (silent = false) => {
    try {
      if (!silent) {
        setLoading(true);
      }
      setError(null);
      const response = await fetch(`${API_URL}/api/detect`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const infraData = (await response.json()) as InfraData;

      // Only update if data has changed (compare container/volume/network counts and states)
      const dataFingerprint = JSON.stringify({
        containers: infraData.containers.map(c => ({ name: c.name, status: c.status })),
        volumes: infraData.volumes.map(v => v.name),
        networks: infraData.networks.map(n => n.name),
        images: infraData.images?.map(i => i.name) || [],
      });

      if (dataFingerprint !== previousDataRef.current) {
        previousDataRef.current = dataFingerprint;
        setData(infraData);
        setLastUpdate(new Date());
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch';
      setError(message);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh polling
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchData(true); // Silent refresh (no loading state)
    }, POLLING_INTERVAL);

    return () => clearInterval(interval);
  }, [autoRefresh, fetchData]);

  // SSE for real-time stats
  useEffect(() => {
    const eventSource = new EventSource(`${API_URL}/api/stream`);

    eventSource.onmessage = (event) => {
      try {
        const update = JSON.parse(event.data) as {
          type: string;
          data?: ContainerStats[];
          infraData?: InfraData;
          message?: string;
        };
        if (update.type === 'stats' && update.data) {
          setStats(update.data);
        }
        // Handle infrastructure change events from server
        if (update.type === 'infra' && update.infraData) {
          setData(update.infraData);
          setLastUpdate(new Date());
        }
      } catch {
        // Ignore parse errors
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
      // Reconnect after 3 seconds
      setTimeout(() => {
        // The effect will re-run and create a new connection
      }, 3000);
    };

    return () => {
      eventSource.close();
    };
  }, []);

  return {
    data,
    stats,
    loading,
    error,
    refresh: () => fetchData(false),
    lastUpdate,
    autoRefresh,
    setAutoRefresh,
  };
}
