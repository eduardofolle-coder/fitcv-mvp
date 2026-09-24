'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import {
  APPLY_STATUS_LABELS,
  ATTENTION_REASON_LABELS,
  applyStatusOf,
} from '@/lib/applyStatus';

const APPLY_STATUS_DARK: Record<string, { bg: string; color: string }> = {
  pendiente:              { bg: 'rgba(169,182,200,.15)', color: '#A9B6C8' },
  'en-cola':              { bg: 'rgba(167,139,250,.18)', color: '#C4B5FD' },
  enviando:               { bg: 'rgba(59,130,246,.18)',  color: '#93C5FD' },
  enviada:                { bg: 'rgba(52,211,153,.18)',  color: '#6EE7B7' },
  'requiere-atencion':    { bg: 'rgba(225,165,38,.18)',  color: '#E1A526' },
  'requiere-autorizacion':{ bg: 'rgba(251,146,60,.18)',  color: '#FED7AA' },
  error:                  { bg: 'rgba(248,113,113,.18)', color: '#FCA5A5' },
};

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

  const d = APPLY_STATUS_DARK[status] ?? APPLY_STATUS_DARK['pendiente'];

  return (
    <section className="aw-card">
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:16, marginBottom:12 }}>
        <div>
          <h2 className="aw-h2" style={{ margin:0 }}>Envío de la postulación</h2>
          <p className="aw-muted" style={{ marginTop:4 }}>
            La extensión de Chrome la envía por ti con este CV. Solo la envía sola si tu CV respalda todo lo que pide el
            formulario.
          </p>
        </div>
        <span className="aw-pill" style={{ background:d.bg, color:d.color, flexShrink:0 }}>
          {APPLY_STATUS_LABELS[status]}
        </span>
      </div>

      {status === 'requiere-atencion' && (
        <div className="aw-warning" style={{ marginBottom:12 }}>
          <p>{(state.applyReason && ATTENTION_REASON_LABELS[state.applyReason]) || 'Necesita tu revisión.'}</p>
          {state.applyDetail && <p style={{ fontSize:12, marginTop:4 }}>{state.applyDetail}</p>}
          {state.applyUrl && (
            <a href={state.applyUrl} target="_blank" rel="noopener noreferrer" style={{ display:'inline-block', marginTop:8, color:'#E1A526', fontWeight:600, textDecoration:'underline' }}>
              Ir a postular
            </a>
          )}
        </div>
      )}

      {status === 'requiere-autorizacion' && (
        <div className="aw-warning" style={{ marginBottom:12 }}>
          <p>{(state.applyReason && ATTENTION_REASON_LABELS[state.applyReason]) || 'Necesita tu autorización para postular.'}</p>
          {state.applyDetail && <p style={{ fontSize:12, marginTop:4 }}>{state.applyDetail}</p>}
          <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginTop:12 }}>
            <button onClick={() => act('authorize')} disabled={busy} className="aw-btn-gold aw-btn-sm">Autorizar y postular</button>
            <button onClick={() => act('decline')} disabled={busy} className="aw-btn-outline aw-btn-sm">No postular</button>
          </div>
        </div>
      )}

      {status === 'enviada' && state.sentAt && (
        <p className="aw-success" style={{ marginBottom:12 }}>Enviada el {new Date(state.sentAt).toLocaleString()}.</p>
      )}

      {status === 'error' && state.applyDetail && (
        <div className="aw-error" style={{ marginBottom:12 }}>{state.applyDetail}</div>
      )}

      <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
        {(status === 'pendiente' || status === 'requiere-atencion' || status === 'error') && (
          <button onClick={() => act('queue')} disabled={busy} className="aw-btn-gold aw-btn-sm">
            {status === 'pendiente' ? 'Enviar con la extensión' : 'Reintentar con la extensión'}
          </button>
        )}
        {status === 'en-cola' && (
          <button onClick={() => act('unqueue')} disabled={busy} className="aw-btn-outline aw-btn-sm">Quitar de la cola</button>
        )}
        {status !== 'enviada' && status !== 'enviando' && (
          <button onClick={() => act('mark-sent')} disabled={busy} className="aw-btn-outline aw-btn-sm">Ya la envié por mi cuenta</button>
        )}
        {hasCv && (
          <button onClick={downloadPdf} className="aw-btn-outline aw-btn-sm">Descargar CV en PDF</button>
        )}
      </div>

      {error && <div className="aw-error" style={{ marginTop:12 }}>{error}</div>}

      {events.length > 0 && (
        <ol style={{ marginTop:20, paddingTop:16, borderTop:'1px solid rgba(255,255,255,.08)', display:'flex', flexDirection:'column', gap:4 }}>
          {events.map((event, i) => (
            <li key={i} className="aw-dim">
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
