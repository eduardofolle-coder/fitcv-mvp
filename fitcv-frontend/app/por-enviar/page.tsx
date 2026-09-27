'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { apiClient } from '@/lib/api-client';
import { sourceLabel } from '@/lib/sources';
import AppShell from '@/app/components/AppShell';

interface Item {
  id: string;
  matchScore: number | null;
  reviewUntil: string | null;
  offer: { id: string; title: string; company: string; location: string | null; source: string; url: string | null };
}
interface InboxResponse {
  success: boolean;
  data?: Item[];
  error?: string;
  sendMode?: 'revision' | 'automatico' | 'manual';
  batchEveryHours?: number | null;
  dailyAnalysisHour?: number | null;
  reviewHours?: number;
}

const REASONS: Array<[string, string]> = [
  ['empresa', 'No me interesa la empresa'],
  ['ubicacion', 'Queda lejos'],
  ['cargo', 'No es el cargo que busco'],
  ['renta', 'La renta no me sirve'],
  ['otro', 'Otro motivo'],
];

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });

/** Bandeja "Por enviar": lo que FITCV eligió solo, antes de que salga. */
export default function PorEnviarPage() {
  const router = useRouter();
  const { user, initializing } = useAuth();
  const [inbox, setInbox] = useState<InboxResponse | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [reason, setReason] = useState('empresa');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!initializing && !user) router.push('/login');
  }, [initializing, user, router]);

  const load = async () => {
    const res = (await apiClient.get<Item[]>('/applications/inbox')) as InboxResponse;
    if (res.success) {
      setInbox(res);
      const ids = new Set((res.data ?? []).map(i => i.id));
      setSelected(prev => prev.filter(id => ids.has(id)));
    } else {
      setError(res.error || 'No se pudo cargar la bandeja');
    }
  };

  useEffect(() => {
    if (user) void load();
  }, [user]);

  if (initializing || !user || !inbox) return <div className="aw-loading">Cargando...</div>;

  const items = inbox.data ?? [];
  const mode = inbox.sendMode ?? 'revision';
  const allSelected = items.length > 0 && selected.length === items.length;
  const toggle = (id: string) => setSelected(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));

  const act = async (action: 'approve' | 'discard', ids: string[]) => {
    if (!ids.length) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    const res = (await apiClient.post(`/applications/inbox/${action}`, action === 'discard' ? { ids, reason } : { ids })) as {
      success: boolean;
      approved?: number;
      discarded?: number;
      error?: string;
    };
    if (res.success) {
      setMessage(
        action === 'approve'
          ? `${res.approved} aprobada(s): salen ahora.`
          : `${res.discarded} descartada(s): no se enviarán y el cupo vuelve a tu plan.`
      );
      await load();
    } else {
      setError(res.error || 'No se pudo completar la acción');
    }
    setBusy(false);
  };

  const schedule = inbox.batchEveryHours
    ? `cada ${inbox.batchEveryHours} horas`
    : inbox.dailyAnalysisHour !== null && inbox.dailyAnalysisHour !== undefined
      ? `una vez al día, a las ${String(inbox.dailyAnalysisHour).padStart(2, '0')}:00`
      : null;

  return (
    <AppShell>
      <h1 className="aw-h1" style={{ marginBottom: 4 }}>Por enviar</h1>
      <p className="aw-muted" style={{ marginBottom: 20 }}>
        {mode === 'manual'
          ? 'Estas son las postulaciones que FITCV eligió para ti. Nada sale sin que lo apruebes.'
          : mode === 'automatico'
            ? 'Estás en modo automático: FITCV envía sin pasar por esta bandeja.'
            : `FITCV arma una tanda ${schedule ?? 'cuando eliges una hora de análisis'}. Descarta lo que no quieras: lo demás sale solo ${inbox.reviewHours ?? 3} horas después del aviso.`}{' '}
        <a href="/preferences#envio" style={{ color: '#E1A526' }}>Cambiar cómo envía FITCV</a>
      </p>

      {mode !== 'automatico' && !schedule && (
        <div className="aw-info" style={{ marginBottom: 16 }}>
          Elige la hora de tu análisis diario (o una frecuencia) en <a href="/preferences#envio" style={{ color: '#E1A526' }}>Mis respuestas</a> para que FITCV arme tus tandas.
        </div>
      )}
      {message && <div className="aw-info" style={{ marginBottom: 12 }}>{message}</div>}
      {error && <div className="aw-error" style={{ marginBottom: 12 }}>{error}</div>}

      {items.length === 0 ? (
        <div className="aw-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <p className="aw-muted">No hay nada por enviar. La próxima tanda aparecerá aquí y te avisaremos.</p>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: '#F4F1E9', cursor: 'pointer', marginRight: 8 }}>
              <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? [] : items.map(i => i.id))} />
              {selected.length ? `${selected.length} seleccionada(s)` : 'Seleccionar todas'}
            </label>
            <button type="button" className="aw-btn-gold aw-btn-sm" disabled={busy || !selected.length} onClick={() => act('approve', selected)}>
              Enviar ahora
            </button>
            <select value={reason} onChange={e => setReason(e.target.value)} className="aw-select" style={{ width: 'auto' }} aria-label="Motivo del descarte">
              {REASONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <button type="button" className="aw-btn-outline aw-btn-sm" disabled={busy || !selected.length} onClick={() => act('discard', selected)}>
              Descartar
            </button>
          </div>

          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {items.map(item => (
              <li key={item.id} className="aw-card aw-card-sm">
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggle(item.id)} style={{ marginTop: 4 }} aria-label={`Seleccionar ${item.offer.title}`} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ fontWeight: 600, color: '#F4F1E9' }}>{item.offer.title}</p>
                    <p className="aw-muted">
                      {item.offer.company}{item.offer.location ? ` · ${item.offer.location}` : ''} · {sourceLabel(item.offer.source)}
                    </p>
                    <p style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      {item.matchScore !== null && <span className="aw-pill aw-pill-green">Calce {item.matchScore}%</span>}
                      <span className="aw-dim">
                        {mode === 'manual' ? 'Espera tu aprobación' : item.reviewUntil ? `Sale a las ${hhmm(item.reviewUntil)} si no la descartas` : 'Entra en la próxima tanda'}
                      </span>
                      {item.offer.url && <a href={item.offer.url} target="_blank" rel="noreferrer" style={{ color: '#E1A526' }}>Ver oferta →</a>}
                    </p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <button type="button" className="aw-btn-gold aw-btn-sm" disabled={busy} onClick={() => act('approve', [item.id])}>Enviar</button>
                    <button type="button" className="aw-btn-outline aw-btn-sm" disabled={busy} onClick={() => act('discard', [item.id])}>Descartar</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </AppShell>
  );
}
