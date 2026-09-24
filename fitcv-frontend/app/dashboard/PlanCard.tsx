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
  free: 'bg-gray-100 text-gray-800',
  pro: 'bg-blue-100 text-blue-800',
  max: 'bg-purple-100 text-purple-800',
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
    <section className="bg-white rounded-lg shadow mb-8 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Tu plan</h2>
        <span className={`px-2.5 py-1 rounded-full text-sm font-medium ${PLAN_COLORS[state.plan]}`}>
          {PLAN_LABELS[state.plan]}
        </span>
      </div>

      {/* Barra de cuota */}
      <div className="mb-3">
        <div className="flex justify-between text-sm text-gray-600 mb-1">
          <span>Postulaciones {isLifetime ? 'vitalicias' : 'este mes'}</span>
          <span className="font-medium">
            {state.quotaUsed} / {state.effectiveTotal}
            {state.overageQuota > 0 && (
              <span className="text-xs text-amber-600 ml-1">(+{state.overageQuota} recarga)</span>
            )}
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          {/* Segmento base */}
          <div
            className={`h-2 rounded-full transition-all ${pct >= 90 ? 'bg-red-500' : pct >= 60 ? 'bg-yellow-500' : 'bg-blue-500'}`}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
        <p className="text-xs text-gray-500 mt-1">
          {state.quotaRemaining} disponibles
          {!isLifetime && state.quotaResetAt
            ? ` · se renueva el ${new Date(state.quotaResetAt).toLocaleDateString('es-CL')}`
            : ''}
        </p>
      </div>

      {/* Daily / runCap para planes pagos */}
      {state.plan !== 'free' && (
        <div className="text-xs text-gray-500 flex gap-4 mb-4">
          <span>Hoy: {state.dailyUsed} / {state.dailyUsed + state.dailyRemaining}</span>
          <span>Por corrida: máx {state.runCap}</span>
        </div>
      )}

      {/* Recarga */}
      {state.overageAvailable && mainExhausted && (
        <div className="border border-amber-200 rounded-lg p-4 bg-amber-50">
          <p className="text-sm font-medium text-amber-900 mb-1">
            Agotaste tus postulaciones de este mes
          </p>
          <p className="text-sm text-amber-800 mb-3">
            Agrega una recarga para seguir postulando antes de que se renueve tu plan.
            {state.overagePriceCLP && (
              <> Precio: <strong>{clp(state.overagePriceCLP)}</strong>.</>
            )}
          </p>
          {topupMsg ? (
            <p className="text-sm text-green-700">{topupMsg}</p>
          ) : (
            <button
              onClick={handleTopup}
              disabled={topping}
              className="px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded hover:bg-amber-700 disabled:opacity-50"
            >
              {topping ? 'Procesando...' : 'Comprar recarga'}
            </button>
          )}
        </div>
      )}

      {/* CTA upgrade para Free */}
      {state.plan === 'free' && state.quotaRemaining === 0 && (
        <p className="text-sm text-amber-700 bg-amber-50 rounded p-3 mt-2">
          Has usado tus 5 postulaciones gratuitas. Pasa a Pro para postular
          automáticamente a 150 ofertas al mes.
        </p>
      )}
    </section>
  );
}
