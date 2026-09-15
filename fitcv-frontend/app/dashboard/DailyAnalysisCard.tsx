'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import { MATCH_TIERS, MATCH_TIER_LABELS, MATCH_TIER_STYLES, type MatchTier, type TierCounts } from '@/lib/matchTier';

interface DigestData {
  runDate: string;
  total: TierCounts;
  fresh: TierCounts;
  top: Array<{ id: string; title: string; company: string; score: number; tier: MatchTier; isNew: boolean }>;
}

interface Notification {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  data: DigestData | null;
  createdAt: string;
  readAt: string | null;
}

const hourLabel = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

// Análisis diario de ofertas en el tablero: hora elegida, último resumen por calce y avisos.
export function DailyAnalysisCard() {
  const router = useRouter();
  const [hour, setHour] = useState<number | null | undefined>(undefined);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [prefs, notes] = await Promise.all([
      apiClient.get<{ dailyAnalysisHour: number | null }>('/applications/preferences'),
      apiClient.get<{ items: Notification[]; unread: number }>('/notifications?limit=5'),
    ]);
    setHour(prefs.success && prefs.data ? prefs.data.dailyAnalysisHour : null);
    if (notes.success && notes.data) {
      setItems(notes.data.items);
      setUnread(notes.data.unread);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cancelled) await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const runNow = async () => {
    setRunning(true);
    setError(null);
    const res = await apiClient.post('/offers/analysis/run');
    if (!res.success) {
      setError(
        res.error?.includes('Upload your CV')
          ? 'Sube tu CV para que FITCV pueda analizar las ofertas de tu perfil.'
          : res.error || 'No se pudo correr el análisis'
      );
    }
    await load();
    setRunning(false);
  };

  const markAllRead = async () => {
    await apiClient.post('/notifications/read-all');
    await load();
  };

  const latest = items.find(item => item.kind === 'offer-digest' && item.data);

  return (
    <section className="bg-white rounded-lg shadow mb-8 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">
            Análisis diario de ofertas
            {unread > 0 && (
              <span className="ml-2 align-middle px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                {unread} {unread === 1 ? 'aviso nuevo' : 'avisos nuevos'}
              </span>
            )}
          </h2>
          {hour === undefined ? null : hour === null ? (
            <p className="text-sm text-orange-700">Todavía no eliges la hora de tu análisis diario.</p>
          ) : (
            <p className="text-sm text-gray-600">Todos los días a las {hourLabel(hour)} (hora de Chile).</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => router.push('/preferences')}
            className="px-3 py-1.5 text-sm font-medium text-blue-600 border border-blue-600 rounded hover:bg-blue-50"
          >
            {hour === null ? 'Elegir hora' : 'Cambiar hora'}
          </button>
          <button
            onClick={runNow}
            disabled={running}
            className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {running ? 'Analizando...' : 'Analizar ahora'}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-3 mb-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {latest?.data ? (
        <div className="space-y-4">
          <div>
            <p className="font-semibold text-gray-900">{latest.title}</p>
            <p className="text-sm text-gray-600">{latest.body}</p>
            <p className="text-xs text-gray-500 mt-1">{new Date(latest.createdAt).toLocaleString()}</p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {MATCH_TIERS.map(tier => (
              <button
                key={tier}
                onClick={() => router.push('/offers')}
                className={`rounded-lg p-3 text-left ${MATCH_TIER_STYLES[tier]}`}
              >
                <p className="text-xs font-semibold uppercase">{MATCH_TIER_LABELS[tier]}</p>
                <p className="text-2xl font-bold">{latest.data?.total[tier] ?? 0}</p>
                <p className="text-xs">{latest.data?.fresh[tier] ?? 0} nuevas</p>
              </button>
            ))}
          </div>

          {latest.data.top.length > 0 && (
            <ul className="divide-y divide-gray-100">
              {latest.data.top.map(offer => (
                <li key={offer.id} className="py-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{offer.title}</p>
                    <p className="text-xs text-gray-500 truncate">{offer.company}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {offer.isNew && <span className="text-xs font-semibold text-blue-700">Nueva</span>}
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${MATCH_TIER_STYLES[offer.tier]}`}>
                      {MATCH_TIER_LABELS[offer.tier]}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap gap-3">
            <button onClick={() => router.push('/offers')} className="text-sm font-medium text-blue-600 hover:underline">
              Ver todas las ofertas de tu perfil
            </button>
            {unread > 0 && (
              <button onClick={markAllRead} className="text-sm text-gray-500 hover:underline">
                Marcar avisos como leídos
              </button>
            )}
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-500">
          Aún no hay análisis. {hour === null ? 'Elige una hora' : 'Espera la hora elegida'} o pulsa &quot;Analizar
          ahora&quot;.
        </p>
      )}
    </section>
  );
}
