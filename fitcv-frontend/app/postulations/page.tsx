'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import { APPLY_STATUS_LABELS, applyStatusOf } from '@/lib/applyStatus';
import AppShell from '@/app/components/AppShell';

// Los estados los define el backend en español; traducirlos a un juego propio
// obligaba a inventar equivalencias que no existen ('offer' no es un estado
// real) y a perder información por el camino.
const ESTADOS = [
  'Por revisar',
  'Preparar postulación',
  'Aplicado',
  'En revisión',
  'Entrevista',
  'Descartado',
] as const;

type Estado = (typeof ESTADOS)[number];

interface Postulation {
  id: string;
  offerId: string;
  title: string;
  company: string;
  estado: Estado;
  prioridad: string;
  createdAt: string;
  notes?: string | null;
  applyStatus?: string;
  postulationSource?: 'manual' | 'auto' | 'suggested';
  matchScore?: number | null;
}

interface Offer {
  id: string;
  title: string;
  company: string;
  level?: string;
  location?: string;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
}

const money = (n: number, currency?: string | null) =>
  currency === 'USD' ? `US$${n.toLocaleString('es-CL')}` : `$${n.toLocaleString('es-CL')}`;

export default function PostulationsPage() {
  const router = useRouter();
  const { user, initializing } = useAuth();
  const [postulations, setPostulations] = useState<Postulation[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | Estado>('all');
  const [creating, setCreating] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [queueing, setQueueing] = useState(false);
  const [queueMessage, setQueueMessage] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [actingSuggested, setActingSuggested] = useState<string | null>(null);

  // Todos los hooks van antes de cualquier return: la versión anterior salía
  // temprano mientras cargaba la sesión y declaraba el useEffect después, así
  // que al resolverse la sesión React veía más hooks que en el render previo y
  // la página entera reventaba.
  useEffect(() => {
    if (initializing || !user) return;

    let cancelled = false;
    (async () => {
      const [res, offersRes] = await Promise.all([
        apiClient.get<Postulation[]>('/postulations?limit=100'),
        // Solo ofertas del perfil del candidato, las más afines primero.
        apiClient.get<Offer[]>('/offers?match=profile&limit=20'),
      ]);
      if (cancelled) return;

      if (res.success && Array.isArray(res.data)) {
        setPostulations(res.data);
      } else {
        setError(res.error || 'No se pudieron cargar tus postulaciones');
      }
      // Sin ofertas la página sigue sirviendo para ver lo ya postulado.
      if (offersRes.success && Array.isArray(offersRes.data)) setOffers(offersRes.data);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [initializing, user, reloadKey]);

  useEffect(() => {
    if (!initializing && !user) router.push('/login');
  }, [initializing, user, router]);

  if (initializing) {
    return <div className="aw-loading">Cargando...</div>;
  }

  if (!user) return null;

  const createPostulation = async (offerId: string) => {
    setCreating(offerId);
    setCreateError(null);

    const res = await apiClient.post<{ postulationId: string }>('/postulations', {
      offerId,
      estado: 'Preparar postulación',
      prioridad: 'Media',
    });

    if (res.success && res.data?.postulationId) {
      router.push(`/postulations/${res.data.postulationId}`);
      return;
    }
    setCreateError(res.error || 'No se pudo crear la postulación');
    setCreating(null);
  };

  const pendingToSend = postulations.filter((p) => applyStatusOf(p.applyStatus) === 'pendiente');

  // Más postulaciones, más oportunidades: dejar todas las pendientes listas de una vez.
  const queueAll = async () => {
    setQueueing(true);
    setQueueMessage(null);
    let queued = 0;
    let needAuthorization = 0;
    for (const p of pendingToSend) {
      const res = await apiClient.post<{ applyStatus: string }>(`/postulations/${p.id}/queue`);
      if (res.success && res.data?.applyStatus === 'requiere-autorizacion') needAuthorization += 1;
      else if (res.success) queued += 1;
    }
    const failed = pendingToSend.length - queued - needAuthorization;
    setQueueMessage(
      [
        `${queued} postulaciones en cola: la extensión de Chrome las enviará.`,
        needAuthorization > 0 ? `${needAuthorization} pagan menos que tu rango de renta y esperan tu autorización.` : '',
        failed > 0 ? `${failed} no se pudieron poner en cola.` : '',
      ]
        .filter(Boolean)
        .join(' ')
    );
    setQueueing(false);
    setReloadKey((k) => k + 1);
  };

  const approveSuggested = async (id: string) => {
    setActingSuggested(id);
    await apiClient.post(`/postulations/${id}/approve-suggested`, {});
    setActingSuggested(null);
    setReloadKey((k) => k + 1);
  };

  const declineSuggested = async (id: string) => {
    setActingSuggested(id);
    await apiClient.post(`/postulations/${id}/decline`, {});
    setActingSuggested(null);
    setReloadKey((k) => k + 1);
  };

  const suggestedPostulations = postulations.filter((p) => p.postulationSource === 'suggested');
  const filteredPostulations = postulations.filter(
    (p) => (filter === 'all' || p.estado === filter) && p.postulationSource !== 'suggested'
  );

  const availableOffers = offers.filter((o) => !postulations.some((p) => p.offerId === o.id));

  const statusColors: Record<Estado, string> = {
    'Por revisar': 'aw-pill aw-pill-gray',
    'Preparar postulación': 'aw-pill aw-pill-purple',
    'Aplicado': 'aw-pill aw-pill-blue',
    'En revisión': 'aw-pill aw-pill-gold',
    'Entrevista': 'aw-pill aw-pill-green',
    'Descartado': 'aw-pill aw-pill-red',
  };

  const applyStatusColors: Record<string, string> = {
    pendiente: 'aw-pill aw-pill-gray',
    'en-cola': 'aw-pill aw-pill-purple',
    enviando: 'aw-pill aw-pill-blue',
    enviada: 'aw-pill aw-pill-green',
    'requiere-atencion': 'aw-pill aw-pill-gold',
    'requiere-autorizacion': 'aw-pill aw-pill-orange',
    error: 'aw-pill aw-pill-red',
  };

  return (
    <AppShell>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:16, marginBottom:24 }}>
        <div>
          <h1 className="aw-h1">Postulaciones</h1>
          <p className="aw-muted">Seguimiento de tus postulaciones y su estado</p>
        </div>
        <button
          onClick={queueAll}
          disabled={queueing || pendingToSend.length === 0}
          className="aw-btn-gold aw-btn-sm"
          style={{ flexShrink:0 }}
        >
          {queueing ? 'Poniendo en cola...' : `Enviar ${pendingToSend.length} pendientes`}
        </button>
      </div>

      {queueMessage && <div className="aw-info" style={{ marginBottom:16 }}>{queueMessage}</div>}

      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:16 }}>
        {(['all', ...ESTADOS] as const).map((estado) => (
          <button
            key={estado}
            onClick={() => setFilter(estado)}
            className={`aw-filter${filter === estado ? ' aw-filter-active' : ''}`}
          >
            {estado === 'all' ? 'Todas' : estado}
          </button>
        ))}
      </div>

      <div className="aw-grid-4" style={{ marginBottom:24 }}>
        <div className="aw-stat">
          <p className="aw-dim">Total</p>
          <p style={{ fontSize:28, fontWeight:700, color:'#F4F1E9' }}>{postulations.length}</p>
        </div>
        <div className="aw-stat">
          <p className="aw-dim">Enviadas</p>
          <p style={{ fontSize:28, fontWeight:700, color:'#6EE7B7' }}>
            {postulations.filter((p) => applyStatusOf(p.applyStatus) === 'enviada').length}
          </p>
        </div>
        <div className="aw-stat">
          <p className="aw-dim">Requieren atención</p>
          <p style={{ fontSize:28, fontWeight:700, color:'#E1A526' }}>
            {postulations.filter((p) => ['requiere-atencion','requiere-autorizacion'].includes(applyStatusOf(p.applyStatus))).length}
          </p>
        </div>
        <div className="aw-stat">
          <p className="aw-dim">Entrevistas</p>
          <p style={{ fontSize:28, fontWeight:700, color:'#93C5FD' }}>
            {postulations.filter((p) => p.estado === 'Entrevista').length}
          </p>
        </div>
      </div>

      {!loading && suggestedPostulations.length > 0 && (
        <section style={{ marginBottom:24 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
            <h2 className="aw-h2" style={{ margin:0 }}>Sugeridas por FITCV</h2>
            <span className="aw-pill aw-pill-gold">{suggestedPostulations.length}</span>
            <span className="aw-dim">No consumen cuota hasta que las apruebes</span>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {suggestedPostulations.map((p) => (
              <div key={p.id} className="aw-card aw-card-sm" style={{ display:'flex', alignItems:'center', gap:16 }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                    <span style={{ fontWeight:600, color:'#F4F1E9', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.title}</span>
                    {p.matchScore != null && <span className="aw-pill aw-pill-green">{Math.round(p.matchScore)}% calce</span>}
                  </div>
                  <p className="aw-muted">{p.company}</p>
                </div>
                <div style={{ display:'flex', gap:8, flexShrink:0 }}>
                  <button onClick={() => approveSuggested(p.id)} disabled={actingSuggested === p.id} className="aw-btn-gold aw-btn-sm">Aprobar</button>
                  <button onClick={() => declineSuggested(p.id)} disabled={actingSuggested === p.id} className="aw-btn-outline aw-btn-sm">Descartar</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {loading ? (
        <div style={{ textAlign:'center', padding:'48px 0', color:'#A9B6C8' }}>Cargando...</div>
      ) : error ? (
        <div className="aw-error">{error}</div>
      ) : filteredPostulations.length === 0 ? (
        <div className="aw-card" style={{ textAlign:'center', padding:'48px 24px' }}>
          <p className="aw-muted">
            {postulations.length === 0 ? 'Todavía no has creado ninguna postulación.' : 'Ninguna postulación con ese estado.'}
          </p>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {filteredPostulations.map((post) => {
            const applyStatus = applyStatusOf(post.applyStatus);
            return (
              <div key={post.id} className="aw-card aw-card-sm">
                <div style={{ display:'flex', alignItems:'flex-start', gap:16 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:6 }}>
                      <span style={{ fontSize:15, fontWeight:600, color:'#F4F1E9' }}>{post.title}</span>
                      <span className={statusColors[post.estado] ?? 'aw-pill aw-pill-gray'}>{post.estado}</span>
                      <span className={applyStatusColors[applyStatus] ?? 'aw-pill aw-pill-gray'}>{APPLY_STATUS_LABELS[applyStatus]}</span>
                    </div>
                    <p className="aw-muted">{post.company}</p>
                    <p className="aw-dim" style={{ marginTop:4 }}>Creada el {new Date(post.createdAt).toLocaleDateString()}</p>
                  </div>
                  <button onClick={() => router.push(`/postulations/${post.id}`)} className="aw-btn-outline aw-btn-sm" style={{ flexShrink:0 }}>
                    {applyStatus === 'requiere-atencion' ? 'Revisar' : 'Ver CV'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && availableOffers.length > 0 && (
        <section style={{ marginTop:40 }}>
          <h2 className="aw-h2">Ofertas afines a tu perfil</h2>
          <p className="aw-muted" style={{ marginBottom:16 }}>
            Las más afines a tu CV. Crea una postulación y adapta tu CV a la oferta, o{' '}
            <button onClick={() => router.push('/offers')} style={{ color:'#E1A526', background:'none', border:'none', cursor:'pointer', fontWeight:600, padding:0 }}>
              ve todas las ofertas
            </button>
            .
          </p>

          {createError && <div className="aw-error" style={{ marginBottom:12 }}>{createError}</div>}

          <div className="aw-grid-2">
            {availableOffers.map((offer) => (
              <div key={offer.id} className="aw-card aw-card-sm" style={{ display:'flex', flexDirection:'column' }}>
                <p style={{ fontWeight:600, color:'#F4F1E9' }}>{offer.title}</p>
                <p className="aw-muted">{offer.company}{offer.location ? ` · ${offer.location}` : ''}</p>
                {typeof offer.salaryMin === 'number' && typeof offer.salaryMax === 'number' && (
                  <p className="aw-dim" style={{ marginTop:4 }}>
                    {money(offer.salaryMin, offer.salaryCurrency)} – {money(offer.salaryMax, offer.salaryCurrency)}
                  </p>
                )}
                <button
                  onClick={() => createPostulation(offer.id)}
                  disabled={creating !== null}
                  className="aw-btn-gold aw-btn-sm"
                  style={{ marginTop:12, alignSelf:'flex-start' }}
                >
                  {creating === offer.id ? 'Creando...' : 'Crear postulación'}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </AppShell>
  );
}
