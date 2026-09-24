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

  const TIER_DARK: Record<string, { bg: string; color: string }> = {
    alto: { bg: 'rgba(52,211,153,.12)', color: '#6EE7B7' },
    medio: { bg: 'rgba(225,165,38,.12)', color: '#E1A526' },
    bajo: { bg: 'rgba(169,182,200,.12)', color: '#A9B6C8' },
  };

  return (
    <section className="aw-card" style={{ marginBottom:24 }}>
      <div style={{ display:'flex', flexWrap:'wrap', alignItems:'flex-start', justifyContent:'space-between', gap:12, marginBottom:16 }}>
        <div>
          <h2 className="aw-h2" style={{ margin:0 }}>
            Análisis diario de ofertas
            {unread > 0 && (
              <span className="aw-pill aw-pill-red" style={{ marginLeft:8, verticalAlign:'middle' }}>
                {unread} {unread === 1 ? 'aviso nuevo' : 'avisos nuevos'}
              </span>
            )}
          </h2>
          {hour === undefined ? null : hour === null ? (
            <p style={{ fontSize:13, color:'#FED7AA', marginTop:4 }}>Todavía no eliges la hora de tu análisis diario.</p>
          ) : (
            <p className="aw-muted" style={{ marginTop:4 }}>Todos los días a las {hourLabel(hour)} (hora de Chile).</p>
          )}
        </div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
          <button onClick={() => router.push('/preferences')} className="aw-btn-outline aw-btn-sm">
            {hour === null ? 'Elegir hora' : 'Cambiar hora'}
          </button>
          <button onClick={runNow} disabled={running} className="aw-btn-gold aw-btn-sm">
            {running ? 'Analizando...' : 'Analizar ahora'}
          </button>
        </div>
      </div>

      {error && <div className="aw-error" style={{ marginBottom:16 }}>{error}</div>}

      {latest?.data ? (
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <div>
            <p style={{ fontWeight:600, color:'#F4F1E9' }}>{latest.title}</p>
            <p className="aw-muted">{latest.body}</p>
            <p className="aw-dim" style={{ marginTop:4 }}>{new Date(latest.createdAt).toLocaleString()}</p>
          </div>

          <div className="aw-grid-3">
            {MATCH_TIERS.map(tier => {
              const d = TIER_DARK[tier];
              return (
                <button
                  key={tier}
                  onClick={() => router.push('/offers')}
                  style={{ background:d.bg, borderRadius:10, padding:'12px 16px', textAlign:'left', border:`1px solid ${d.color}30`, cursor:'pointer' }}
                >
                  <p style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', color:d.color }}>{MATCH_TIER_LABELS[tier]}</p>
                  <p style={{ fontSize:24, fontWeight:700, color:d.color }}>{latest.data?.total[tier] ?? 0}</p>
                  <p style={{ fontSize:12, color:d.color, opacity:.7 }}>{latest.data?.fresh[tier] ?? 0} nuevas</p>
                </button>
              );
            })}
          </div>

          {latest.data.top.length > 0 && (
            <ul>
              {latest.data.top.map(offer => {
                const d = TIER_DARK[offer.tier];
                return (
                  <li key={offer.id} className="aw-row">
                    <div style={{ flex:1, minWidth:0 }}>
                      <p style={{ fontSize:14, fontWeight:500, color:'#F4F1E9', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{offer.title}</p>
                      <p className="aw-dim" style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{offer.company}</p>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
                      {offer.isNew && <span className="aw-pill aw-pill-blue" style={{ fontSize:11 }}>Nueva</span>}
                      <span className="aw-pill" style={{ background:d.bg, color:d.color }}>{MATCH_TIER_LABELS[offer.tier]}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <div style={{ display:'flex', flexWrap:'wrap', gap:12 }}>
            <button onClick={() => router.push('/offers')} style={{ fontSize:13, fontWeight:600, color:'#E1A526', background:'none', border:'none', cursor:'pointer', padding:0 }}>
              Ver todas las ofertas de tu perfil →
            </button>
            {unread > 0 && (
              <button onClick={markAllRead} style={{ fontSize:13, color:'#6C7686', background:'none', border:'none', cursor:'pointer', padding:0 }}>
                Marcar avisos como leídos
              </button>
            )}
          </div>
        </div>
      ) : (
        <p className="aw-muted">
          Aún no hay análisis. {hour === null ? 'Elige una hora' : 'Espera la hora elegida'} o pulsa &quot;Analizar ahora&quot;.
        </p>
      )}
    </section>
  );
}
