'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { apiClient } from '@/lib/api-client';
import AppShell from '@/app/components/AppShell';

type Outcome = 'limpia' | 'asistida' | 'bloqueada' | 'atencion' | 'error';
interface Portal { portal: string; attempts: number; counts: Record<Outcome, number>; cleanRate: number | null; paused: boolean; manual: boolean; manualReason: string | null }
interface Health { rule: { days: number; minCleanRate: number; confidence: number }; portals: Portal[] }
interface Invite { email: string; plan: string; createdAt: string; usedAt: string | null }
interface SourceRow { source: string; active: string; new24h: string; new7d: string; newest: string | null }
interface UserRow { id: string; email: string; plan: string; sent: string; queued: string; attention: string; interviews: string; mail: string | null }

const PLANS = ['free', 'pro', 'max'];
const OUTCOMES: Array<[Outcome, string]> = [['limpia', 'Limpia'], ['asistida', 'Asistida'], ['bloqueada', 'Bloqueada'], ['atencion', 'Atención'], ['error', 'Error']];
const pct = (n: number | null) => (n === null ? '—' : `${Math.round(n * 100)}%`);
const cell = { padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,.08)', textAlign: 'left' as const, whiteSpace: 'nowrap' as const };

/** Panel del dueño: salud por portal (E1) y beta cerrada (E6). */
export default function AdminPage() {
  const router = useRouter();
  const { user, initializing } = useAuth();
  const [health, setHealth] = useState<Health | null>(null);
  const [invites, setInvites] = useState<{ closed: boolean; invites: Invite[] } | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [forbidden, setForbidden] = useState(false);
  const [email, setEmail] = useState('');
  const [plan, setPlan] = useState('pro');
  const [reload, setReload] = useState(0);
  const [pausing, setPausing] = useState<string | null>(null);
  const [pauseReason, setPauseReason] = useState('');

  useEffect(() => {
    if (!initializing && !user) router.push('/login');
  }, [initializing, user, router]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [h, i, u, s] = await Promise.all([
        apiClient.get<Health>('/admin/portal-health'),
        apiClient.get<{ closed: boolean; invites: Invite[] }>('/admin/invites'),
        apiClient.get<UserRow[]>('/admin/users'),
        apiClient.get<SourceRow[]>('/admin/sources'),
      ]);
      if (!h.success) { setForbidden(true); return; }
      setHealth(h.data ?? null);
      setInvites(i.data ?? null);
      setUsers(u.data ?? []);
      setSources(s.data ?? []);
    })();
  }, [user, reload]);

  if (initializing || !user) return <div className="aw-loading">Cargando...</div>;
  if (forbidden) return <AppShell><p className="aw-muted">Esta sección es solo para el equipo de FITCV.</p></AppShell>;

  const invite = async (e: FormEvent) => {
    e.preventDefault();
    const res = await apiClient.post('/admin/invites', { email, plan });
    if (res.success) { setEmail(''); setReload((r) => r + 1); }
  };

  // Pausar: la señal ya es clara, no hace falta esperar el umbral automático.
  // Reactivar: quita la pausa manual (vuelve a decidir la fórmula sola).
  const confirmPause = async (portal: string) => {
    await apiClient.put(`/admin/portal-health/${encodeURIComponent(portal)}`, { paused: true, reason: pauseReason || null });
    setPausing(null);
    setPauseReason('');
    setReload((r) => r + 1);
  };
  const reactivatePortal = async (portal: string) => {
    await apiClient.delete(`/admin/portal-health/${encodeURIComponent(portal)}`);
    setReload((r) => r + 1);
  };

  return (
    <AppShell>
      <h1 className="aw-h1">Panel FITCV</h1>

      <section className="aw-card" style={{ marginBottom: 24 }}>
        <h2 className="aw-h2">Salud por portal</h2>
        {health && (
          <p className="aw-muted" style={{ marginBottom: 12 }}>
            Últimos {health.rule.days} días. Un portal se pausa solo, sin esperar un número fijo de intentos: si hay evidencia
            clara de que sale bajo {pct(health.rule.minCleanRate)} limpio (una racha mala con pocos intentos ya alcanza), se
            pausa; con datos parejos o insuficientes, espera. La cola prioriza calce × salida limpia. "Pausar" a mano queda
            para casos que la estadística todavía no ve, como que el dueño se entere de algo aparte.
          </p>
        )}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, color: '#F4F1E9', fontVariantNumeric: 'tabular-nums' }}>
            <thead>
              <tr>
                <th style={cell}>Portal</th><th style={cell}>Intentos</th>
                {OUTCOMES.map(([, label]) => <th key={label} style={cell}>{label}</th>)}
                <th style={cell}>Salida limpia</th><th style={cell}>Estado</th><th style={cell}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {health?.portals.map((p) => (
                <tr key={p.portal}>
                  <td style={cell}>{p.portal}</td>
                  <td style={cell}>{p.attempts}</td>
                  {OUTCOMES.map(([k]) => <td key={k} style={cell}>{p.counts[k]}</td>)}
                  <td style={cell}>{pct(p.cleanRate)}</td>
                  <td style={cell}>
                    <span className={p.paused ? 'aw-pill aw-pill-red' : 'aw-pill aw-pill-green'}>{p.paused ? 'En pausa' : 'Activo'}</span>
                    {p.manual && <span className="aw-dim" style={{ marginLeft: 6 }}>(manual{p.manualReason ? `: ${p.manualReason}` : ''})</span>}
                  </td>
                  <td style={cell}>
                    {p.paused ? (
                      <button className="aw-btn-outline aw-btn-sm" onClick={() => reactivatePortal(p.portal)}>Reactivar</button>
                    ) : pausing === p.portal ? (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input
                          className="aw-input"
                          placeholder="Motivo (opcional)"
                          value={pauseReason}
                          onChange={(e) => setPauseReason(e.target.value)}
                          style={{ width: 160 }}
                          autoFocus
                        />
                        <button className="aw-btn-gold aw-btn-sm" onClick={() => confirmPause(p.portal)}>Confirmar</button>
                        <button className="aw-btn-outline aw-btn-sm" onClick={() => { setPausing(null); setPauseReason(''); }}>Cancelar</button>
                      </div>
                    ) : (
                      <button className="aw-btn-outline aw-btn-sm" onClick={() => { setPausing(p.portal); setPauseReason(''); }}>Pausar</button>
                    )}
                  </td>
                </tr>
              ))}
              {health?.portals.length === 0 && (
                <tr><td style={cell} colSpan={10}><span className="aw-muted">Aún no hay intentos de envío en la ventana.</span></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="aw-card" style={{ marginBottom: 24 }}>
        <h2 className="aw-h2">Ofertas por fuente</h2>
        <p className="aw-muted" style={{ marginBottom: 12 }}>
          Si una fuente pasa días sin ofertas nuevas, probablemente el portal cambió su página y hay que ajustar el lector.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, color: '#F4F1E9', fontVariantNumeric: 'tabular-nums' }}>
            <thead>
              <tr>{['Fuente', 'Vigentes', 'Nuevas 24 h', 'Nuevas 7 días', 'Última'].map((h) => <th key={h} style={cell}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.source}>
                  <td style={cell}>{s.source}</td>
                  <td style={cell}>{s.active}</td>
                  <td style={cell}>{s.new24h}</td>
                  <td style={cell}>{s.new7d}</td>
                  <td style={cell}>{s.newest ? new Date(s.newest).toLocaleString('es-CL') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="aw-card" style={{ marginBottom: 24 }}>
        <h2 className="aw-h2">Beta cerrada</h2>
        <p className="aw-muted" style={{ marginBottom: 12 }}>
          {invites?.closed
            ? 'Registro cerrado: solo entran los correos invitados, con el plan que les asignes. Sin pasarela de pago.'
            : 'El registro está abierto (BETA_CLOSED no está activado en el servidor). Las invitaciones igual asignan el plan.'}
        </p>
        <form onSubmit={invite} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          <input className="aw-input" type="email" required placeholder="correo@invitado.cl" value={email} onChange={(e) => setEmail(e.target.value)} style={{ flex: 1, minWidth: 220 }} />
          <select className="aw-select" value={plan} onChange={(e) => setPlan(e.target.value)} style={{ width: 110 }}>
            {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <button className="aw-btn-gold aw-btn-sm" type="submit">Invitar</button>
        </form>
        {invites?.invites.map((i) => (
          <div key={i.email} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '6px 0', flexWrap: 'wrap' }}>
            <span style={{ color: '#F4F1E9', flex: 1 }}>{i.email}</span>
            <span className="aw-pill aw-pill-blue">{i.plan}</span>
            <span className="aw-dim">{i.usedAt ? 'Registrado' : 'Pendiente'}</span>
            <button className="aw-btn-outline aw-btn-sm" onClick={async () => { await apiClient.delete(`/admin/invites/${encodeURIComponent(i.email)}`); setReload((r) => r + 1); }}>Quitar</button>
          </div>
        ))}
      </section>

      <section className="aw-card">
        <h2 className="aw-h2">Candidatos</h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, color: '#F4F1E9', fontVariantNumeric: 'tabular-nums' }}>
            <thead>
              <tr>{['Correo', 'Plan', 'Enviadas', 'En cola', 'Atención', 'Entrevistas', 'Correo conectado'].map((h) => <th key={h} style={cell}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td style={cell}>{u.email}</td>
                  <td style={cell}>
                    <select className="aw-select" value={u.plan} onChange={async (e) => { await apiClient.put(`/admin/users/${u.id}/plan`, { plan: e.target.value }); setReload((r) => r + 1); }}>
                      {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </td>
                  <td style={cell}>{u.sent}</td>
                  <td style={cell}>{u.queued}</td>
                  <td style={cell}>{u.attention}</td>
                  <td style={cell}>{u.interviews}</td>
                  <td style={cell}>{u.mail ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
