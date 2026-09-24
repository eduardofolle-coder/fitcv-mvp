'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';

interface PlanState {
  plan: 'free' | 'pro' | 'max';
  quotaUsed: number;
  quotaTotal: number;
  quotaRemaining: number;
  dailyUsed: number;
  dailyRemaining: number;
  runCap: number;
  quotaResetAt: string | null;
}

const PLAN_LABELS = { free: 'Free', pro: 'Pro', max: 'Max' };
const PLAN_COLORS = {
  free: 'bg-gray-100 text-gray-800',
  pro: 'bg-blue-100 text-blue-800',
  max: 'bg-purple-100 text-purple-800',
};

export function PlanCard() {
  const [state, setState] = useState<PlanState | null>(null);

  useEffect(() => {
    apiClient.get<PlanState>('/plans/me').then(res => {
      if (res.success && res.data) setState(res.data);
    });
  }, []);

  if (!state) return null;

  const pct = state.quotaTotal > 0 ? Math.round((state.quotaUsed / state.quotaTotal) * 100) : 0;
  const isLifetime = state.plan === 'free';

  return (
    <section className="bg-white rounded-lg shadow mb-8 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Tu plan</h2>
        <span className={`px-2.5 py-1 rounded-full text-sm font-medium ${PLAN_COLORS[state.plan]}`}>
          {PLAN_LABELS[state.plan]}
        </span>
      </div>

      <div className="mb-3">
        <div className="flex justify-between text-sm text-gray-600 mb-1">
          <span>
            Postulaciones {isLifetime ? 'vitalicias' : 'este mes'}
          </span>
          <span className="font-medium">
            {state.quotaUsed} / {state.quotaTotal}
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
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

      {state.plan !== 'free' && (
        <div className="text-xs text-gray-500 flex gap-4">
          <span>Hoy: {state.dailyUsed} / {state.dailyUsed + state.dailyRemaining}</span>
          <span>Por corrida: máx {state.runCap}</span>
        </div>
      )}

      {state.plan === 'free' && state.quotaRemaining === 0 && (
        <p className="text-sm text-amber-700 bg-amber-50 rounded p-2 mt-3">
          Has usado tus 5 postulaciones gratuitas. Pasa a Pro para postular automáticamente a 150 ofertas al mes.
        </p>
      )}
    </section>
  );
}
