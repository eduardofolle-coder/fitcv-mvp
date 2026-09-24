'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';

interface PlanState {
  plan: 'free' | 'pro' | 'max';
  quotaUsed: number;
  quotaTotal: number;
  overageQuota: number;
  effectiveTotal: number;
  quotaRemaining: number;
  dailyUsed: number;
  dailyRemaining: number;
  runCap: number;
  quotaResetAt: string | null;
  overageAvailable: boolean;
  overagePriceCLP: number | null;
}

const PLAN_LABELS = { free: 'Free', pro: 'Pro', max: 'Max' };
const PLAN_COLORS = {
  free: 'aw-pill aw-pill-gray',
  pro: 'aw-pill aw-pill-blue',
  max: 'aw-pill aw-pill-purple',
};

const clp = (n: number) => `$${n.toLocaleString('es-CL')}`;

export function PlanCard() {
  const [state, setState] = useState<PlanState | null>(null);
  const [topping, setTopping] = useState(false);
  const [topupMsg, setTopupMsg] = useState<string | null>(null);

  const load = () =>
    apiClient.get<PlanState>('/plans/me').then(res => {
      if (res.success && res.data) setState(res.data);
    });

  useEffect(() => { load(); }, []);

  if (!state) return null;

  const pct = state.effectiveTotal > 0
    ? Math.round((state.quotaUsed / state.effectiveTotal) * 100)
    : 0;
  const isLifetime = state.plan === 'free';
  const mainExhausted = state.quotaUsed >= state.quotaTotal;

  const handleTopup = async () => {
    setTopping(true);
    setTopupMsg(null);
    const res = await apiClient.post<{ slotsAdded: number; effectiveTotal: number }>(
      '/plans/me/topup', {}
    );
    if (res.success && res.data) {
      setTopupMsg(`+${res.data.slotsAdded} postulaciones agregadas.`);
      await load();
    } else {
      setTopupMsg(res.error ?? 'Error al procesar la recarga.');
    }
    setTopping(false);
  };

  return (
    <section className="aw-card" style={{ marginBottom: 24 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
        <h2 className="aw-h2" style={{ margin:0 }}>Tu plan</h2>
        <span className={PLAN_COLORS[state.plan]}>{PLAN_LABELS[state.plan]}</span>
      </div>

      <div style={{ marginBottom:12 }}>
        <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:'#A9B6C8', marginBottom:6 }}>
          <span>Postulaciones {isLifetime ? 'vitalicias' : 'este mes'}</span>
          <span style={{ fontWeight:600, color:'#F4F1E9' }}>
            {state.quotaUsed} / {state.effectiveTotal}
            {state.overageQuota > 0 && (
              <span style={{ fontSize:11, color:'#E1A526', marginLeft:4 }}>(+{state.overageQuota} recarga)</span>
            )}
          </span>
        </div>
        <div style={{ width:'100%', background:'rgba(255,255,255,.1)', borderRadius:4, height:6 }}>
          <div
            style={{
              height:6, borderRadius:4, transition:'width .3s',
              background: pct >= 90 ? '#FCA5A5' : pct >= 60 ? '#E1A526' : '#E1A526',
              width: `${Math.min(pct, 100)}%`,
            }}
          />
        </div>
        <p className="aw-dim" style={{ marginTop:4 }}>
          {state.quotaRemaining} disponibles
          {!isLifetime && state.quotaResetAt
            ? ` · se renueva el ${new Date(state.quotaResetAt).toLocaleDateString('es-CL')}`
            : ''}
        </p>
      </div>

      {state.plan !== 'free' && (
        <div className="aw-dim" style={{ display:'flex', gap:16, marginBottom:16 }}>
          <span>Hoy: {state.dailyUsed} / {state.dailyUsed + state.dailyRemaining}</span>
          <span>Por corrida: máx {state.runCap}</span>
        </div>
      )}

      {state.overageAvailable && mainExhausted && (
        <div className="aw-warning" style={{ marginTop:8 }}>
          <p style={{ fontWeight:600, marginBottom:4 }}>Agotaste tus postulaciones de este mes</p>
          <p style={{ marginBottom:12 }}>
            Agrega una recarga para seguir postulando antes de que se renueve tu plan.
            {state.overagePriceCLP && <> Precio: <strong>{clp(state.overagePriceCLP)}</strong>.</>}
          </p>
          {topupMsg ? (
            <p style={{ color:'#6EE7B7' }}>{topupMsg}</p>
          ) : (
            <button onClick={handleTopup} disabled={topping} className="aw-btn-gold aw-btn-sm">
              {topping ? 'Procesando...' : 'Comprar recarga'}
            </button>
          )}
        </div>
      )}

      {state.plan === 'free' && state.quotaRemaining === 0 && (
        <p className="aw-warning" style={{ marginTop:8 }}>
          Has usado tus 5 postulaciones gratuitas. Pasa a Pro para postular automáticamente a 150 ofertas al mes.
        </p>
      )}
    </section>
  );
}
