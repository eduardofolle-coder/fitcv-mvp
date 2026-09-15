'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import {
  APPLY_STATUS_LABELS,
  APPLY_STATUS_STYLES,
  ATTENTION_REASON_LABELS,
  applyStatusOf,
} from '@/lib/applyStatus';

interface ApplyState {
  applyStatus: string;
  applyReason: string | null;
  applyDetail: string | null;
  applyUrl: string | null;
  sentAt: string | null;
}

interface ApplyEvent {
  toStatus: string;
  mode: string | null;
  reason: string | null;
  detail: string | null;
  createdAt: string;
}

export function ApplyPanel({ postulationId, hasCv }: { postulationId: string; hasCv: boolean }) {
  const [state, setState] = useState<ApplyState | null>(null);
  const [events, setEvents] = useState<ApplyEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [detail, history] = await Promise.all([
      apiClient.get<ApplyState>(`/postulations/${postulationId}`),
      apiClient.get<ApplyEvent[]>(`/postulations/${postulationId}/events`),
    ]);
    if (detail.success && detail.data) setState(detail.data);
    if (history.success && Array.isArray(history.data)) setEvents(history.data);
  }, [postulationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const status = applyStatusOf(state?.applyStatus);

  // Mientras la extensión trabaja, el estado cambia sin que el candidato haga nada.
  useEffect(() => {
    if (status !== 'en-cola' && status !== 'enviando') return;
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, [status, load]);

  const act = async (action: 'queue' | 'unqueue' | 'mark-sent' | 'authorize' | 'decline') => {
    setBusy(true);
    setError(null);
    const res = await apiClient.post(`/postulations/${postulationId}/${action}`);
    if (!res.success) setError(res.error || 'No se pudo actualizar la postulación');
    await load();
    setBusy(false);
  };

  const downloadPdf = async () => {
    setError(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/postulations/${postulationId}/cv.pdf`, {
        headers: { Authorization: `Bearer ${apiClient.getAuthToken() ?? ''}` },
      });
      if (!res.ok) throw new Error(`No se pudo descargar el PDF (${res.status})`);

      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/)?.[1];
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = encoded ? decodeURIComponent(encoded) : 'CV.pdf';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo descargar el PDF');
    }
  };

  if (!state) return null;

  const secondary =
    'px-4 py-2 text-sm font-medium text-blue-600 border border-blue-600 rounded hover:bg-blue-50 disabled:opacity-50';

  return (
    <section className="bg-white rounded-lg shadow p-6">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Envío de la postulación</h2>
          <p className="text-sm text-gray-600">
            La extensión de Chrome la envía por ti con este CV. Solo la envía sola si tu CV respalda todo lo que pide el
            formulario.
          </p>
        </div>
        <span className={`shrink-0 px-3 py-1 rounded-full text-sm font-medium ${APPLY_STATUS_STYLES[status]}`}>
          {APPLY_STATUS_LABELS[status]}
        </span>
      </div>

      {status === 'requiere-atencion' && (
        <div className="rounded-md bg-yellow-50 p-4 mb-4">
          <p className="text-sm text-yellow-900">
            {(state.applyReason && ATTENTION_REASON_LABELS[state.applyReason]) || 'Necesita tu revisión.'}
          </p>
          {state.applyDetail && <p className="text-xs text-yellow-800 mt-1">{state.applyDetail}</p>}
          {state.applyUrl && (
            <a
              href={state.applyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-2 text-sm font-medium text-yellow-900 underline"
            >
              Ir a postular
            </a>
          )}
        </div>
      )}

      {status === 'requiere-autorizacion' && (
        <div className="rounded-md bg-orange-50 p-4 mb-4">
          <p className="text-sm text-orange-900">
            {(state.applyReason && ATTENTION_REASON_LABELS[state.applyReason]) || 'Necesita tu autorización para postular.'}
          </p>
          {state.applyDetail && <p className="text-xs text-orange-800 mt-1">{state.applyDetail}</p>}
          <div className="flex flex-wrap gap-2 mt-3">
            <button
              onClick={() => act('authorize')}
              disabled={busy}
              className="px-4 py-2 text-sm font-medium text-white bg-orange-600 rounded hover:bg-orange-700 disabled:opacity-50"
            >
              Autorizar y postular
            </button>
            <button
              onClick={() => act('decline')}
              disabled={busy}
              className="px-4 py-2 text-sm font-medium text-orange-700 border border-orange-600 rounded hover:bg-orange-100 disabled:opacity-50"
            >
              No postular
            </button>
          </div>
        </div>
      )}

      {status === 'enviada' && state.sentAt && (
        <p className="text-sm text-green-700 mb-4">Enviada el {new Date(state.sentAt).toLocaleString()}.</p>
      )}

      {status === 'error' && state.applyDetail && <p className="text-sm text-red-700 mb-4">{state.applyDetail}</p>}

      <div className="flex flex-wrap gap-2">
        {(status === 'pendiente' || status === 'requiere-atencion' || status === 'error') && (
          <button
            onClick={() => act('queue')}
            disabled={busy}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {status === 'pendiente' ? 'Enviar con la extensión' : 'Reintentar con la extensión'}
          </button>
        )}
        {status === 'en-cola' && (
          <button onClick={() => act('unqueue')} disabled={busy} className={secondary}>
            Quitar de la cola
          </button>
        )}
        {status !== 'enviada' && status !== 'enviando' && (
          <button onClick={() => act('mark-sent')} disabled={busy} className={secondary}>
            Ya la envié por mi cuenta
          </button>
        )}
        {hasCv && (
          <button onClick={downloadPdf} className={secondary}>
            Descargar CV en PDF
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-700 mt-3">{error}</p>}

      {events.length > 0 && (
        <ol className="mt-5 pt-4 border-t border-gray-100 space-y-1">
          {events.map((event, i) => (
            <li key={i} className="text-sm text-gray-600">
              {new Date(event.createdAt).toLocaleString()} · {APPLY_STATUS_LABELS[applyStatusOf(event.toStatus)]}
              {event.mode === 'auto' ? ' automáticamente' : event.mode === 'manual' ? ' por ti' : ''}
              {event.reason ? ` — ${ATTENTION_REASON_LABELS[event.reason] ?? event.reason}` : ''}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
