'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { apiClient } from '@/lib/api-client';
import { MATCH_TIERS, MATCH_TIER_LABELS, type MatchTier, type TierCounts } from '@/lib/matchTier';
import AppShell from '@/app/components/AppShell';

interface Offer {
  id: string;
  title: string;
  company: string;
  location?: string | null;
  source: string;
  url?: string | null;
  publishedAt?: string | null;
  validThrough?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  match?: { score: number; tier: MatchTier; reasons: string[] };
}

interface OffersResponse {
  success: boolean;
  data?: Offer[];
  error?: string;
  pagination?: { page: number; totalPages: number; total: number };
  needsProfile?: boolean;
  profileTerms?: string[];
  tierCounts?: TierCounts;
}

interface Postulation {
  id: string;
  offerId: string;
}

type Mode = 'profile' | 'all';

const SOURCE_LABELS: Record<string, string> = {
  getonbrd: 'Get on Board',
  trabajando: 'trabajando.cl',
  chiletrabajos: 'Chiletrabajos',
  bne: 'Bolsa Nacional de Empleo',
  portalminero: 'Portal Minero',
  trabajosdiarios: 'Trabajos Diarios',
  linkedin: 'LinkedIn',
  computrabajo: 'Computrabajo',
  laborum: 'Laborum',
  empresa: 'Sitio de empresa',
};

// Portales que bloquean la lectura automática: sus ofertas entran con la extensión.
const EXTENSION_ONLY = ['LinkedIn', 'Laborum', 'Zonajobs', 'Empleos Públicos'];

const sourceLabel = (source: string) => SOURCE_LABELS[source] ?? source;

const money = (n: number, currency?: string | null) =>
  currency === 'USD' ? `US$${n.toLocaleString('es-CL')}` : `$${n.toLocaleString('es-CL')}`;


export default function OffersPage() {
  const router = useRouter();
  const { user, initializing } = useAuth();

  const [mode, setMode] = useState<Mode>('profile');
  const [offers, setOffers] = useState<Offer[]>([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [profileTerms, setProfileTerms] = useState<string[]>([]);
  const [needsProfile, setNeedsProfile] = useState(false);
  const [tier, setTier] = useState<'' | MatchTier>('');
  const [tierCounts, setTierCounts] = useState<TierCounts>({ alto: 0, medio: 0, bajo: 0 });

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('tier');
    if (fromUrl && (MATCH_TIERS as readonly string[]).includes(fromUrl)) setTier(fromUrl as MatchTier);
  }, []);
  const [bySource, setBySource] = useState<Array<{ source: string; count: number }>>([]);
  const [applied, setApplied] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [source, setSource] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyOffer, setBusyOffer] = useState<string | null>(null);

  useEffect(() => {
    if (!initializing && !user) router.push('/login');
  }, [initializing, user, router]);

  // Totales por portal y postulaciones ya creadas: se cargan una vez.
  useEffect(() => {
    if (initializing || !user) return;
    let cancelled = false;
    (async () => {
      const [stats, mine] = await Promise.all([
        apiClient.get<{ bySource?: Array<{ source: string; count: number }> }>('/offers/stats/summary'),
        apiClient.get<Postulation[]>('/postulations?limit=100'),
      ]);
      if (cancelled) return;
      if (stats.success && stats.data?.bySource) setBySource(stats.data.bySource);
      if (mine.success && Array.isArray(mine.data)) {
        setApplied(Object.fromEntries(mine.data.map(p => [p.offerId, p.id])));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initializing, user]);

  useEffect(() => {
    if (initializing || !user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (mode === 'profile') params.set('match', 'profile');
      if (mode === 'profile' && tier) params.set('tier', tier);
      if (search) params.set('search', search);
      if (source) params.set('source', source);

      const res = (await apiClient.get<Offer[]>(`/offers?${params}`)) as OffersResponse;
      if (cancelled) return;
      if (res.success && Array.isArray(res.data)) {
        setOffers(res.data);
        if (res.pagination) setPagination(res.pagination);
        setNeedsProfile(res.needsProfile === true);
        setProfileTerms(res.profileTerms ?? []);
        if (res.tierCounts) setTierCounts(res.tierCounts);
      } else {
        setError(res.error || 'No se pudieron cargar las ofertas');
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [initializing, user, mode, page, search, source, tier]);

  if (initializing) {
    return <div className="aw-loading">Cargando...</div>;
  }
  if (!user) return null;

  const TIER_DARK: Record<string, { bg: string; color: string }> = {
    alto: { bg: 'rgba(52,211,153,.12)', color: '#6EE7B7' },
    medio: { bg: 'rgba(225,165,38,.12)', color: '#E1A526' },
    bajo: { bg: 'rgba(169,182,200,.12)', color: '#A9B6C8' },
  };

  const changeMode = (next: Mode) => {
    setMode(next);
    setPage(1);
  };

  const submitSearch = (e: FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(query.trim());
  };

  // Crea la postulación y la deja en cola para que la extensión la envíe.
  const applyWithFitcv = async (offer: Offer) => {
    setBusyOffer(offer.id);
    setError(null);

    const created = await apiClient.post<{ postulationId: string }>('/postulations', {
      offerId: offer.id,
      estado: 'Preparar postulación',
      prioridad: 'Media',
    });
    const postulationId = created.data?.postulationId;
    if (!created.success || !postulationId) {
      setError(created.error || 'No se pudo crear la postulación');
      setBusyOffer(null);
      return;
    }

    const queued = await apiClient.post(`/postulations/${postulationId}/queue`);
    if (!queued.success) setError(queued.error || 'La postulación se creó, pero no quedó en cola');

    setApplied(prev => ({ ...prev, [offer.id]: postulationId }));
    setBusyOffer(null);
  };

  const totalOffers = bySource.reduce((sum, s) => sum + s.count, 0);

  return (
    <AppShell>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:16, marginBottom:20 }}>
        <div>
          <h1 className="aw-h1">Ofertas</h1>
          <p className="aw-muted">
            {mode === 'profile'
              ? 'Ofertas vigentes afines a tu CV, de la más afín a la menos.'
              : `${totalOffers.toLocaleString('es-CL')} ofertas vigentes de portales chilenos.`}
          </p>
        </div>
        <button onClick={() => router.push('/postulations')} className="aw-btn-outline aw-btn-sm" style={{ flexShrink:0 }}>
          Mis postulaciones
        </button>
      </div>

      <div style={{ display:'flex', gap:4, marginBottom:16, borderBottom:'1px solid rgba(255,255,255,.08)' }}>
        {([['profile','Para tu perfil'],['all','Todas las ofertas']] as const).map(([value, label]) => (
          <button
            key={value}
            onClick={() => changeMode(value)}
            style={{
              padding:'8px 16px', marginBottom:-1, fontSize:14, fontWeight:500, border:'none', cursor:'pointer',
              background:'transparent', borderBottom: mode === value ? '2px solid #E1A526' : '2px solid transparent',
              color: mode === value ? '#E1A526' : '#A9B6C8',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'profile' && profileTerms.length > 0 && (
        <p className="aw-muted" style={{ marginBottom:12 }}>
          Según tu CV buscamos: <strong style={{ color:'#F4F1E9' }}>{profileTerms.join(', ')}</strong>.
        </p>
      )}

      {mode === 'profile' && !needsProfile && (
        <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:12 }}>
          {(['', ...MATCH_TIERS] as const).map(value => {
            const count = value ? tierCounts[value] : tierCounts.alto + tierCounts.medio + tierCounts.bajo;
            const active = tier === value;
            const d = value ? TIER_DARK[value] : null;
            return (
              <button
                key={value || 'todos'}
                onClick={() => { setTier(value); setPage(1); }}
                className={`aw-filter${active ? ' aw-filter-active' : ''}`}
                style={active && d ? { background:d.bg, color:d.color, borderColor:d.color+'40' } : {}}
              >
                {value ? MATCH_TIER_LABELS[value] : 'Todos los calces'} · {count.toLocaleString('es-CL')}
              </button>
            );
          })}
        </div>
      )}

      <form onSubmit={submitSearch} style={{ display:'flex', gap:8, marginBottom:12 }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={mode === 'profile' ? 'Afinar dentro de tus ofertas (ej: jefe, Santiago, SAP)' : 'Cargo, empresa o palabra clave'}
          className="aw-input"
          style={{ flex:1 }}
        />
        <button type="submit" className="aw-btn-gold aw-btn-sm">Buscar</button>
      </form>

      <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:12 }}>
        {[{ source: '', count: totalOffers }, ...bySource].map(item => (
          <button
            key={item.source || 'todas'}
            onClick={() => { setSource(item.source); setPage(1); }}
            className={`aw-filter${source === item.source ? ' aw-filter-active' : ''}`}
          >
            {item.source ? sourceLabel(item.source) : 'Todos los portales'}
            {mode === 'all' ? ` · ${item.count.toLocaleString('es-CL')}` : ''}
          </button>
        ))}
      </div>

      <p className="aw-dim" style={{ marginBottom:20 }}>
        {EXTENSION_ONLY.join(', ')} bloquean la lectura automática: agrega sus ofertas con la extensión.
      </p>

      {error && <div className="aw-error" style={{ marginBottom:12 }}>{error}</div>}

      {loading ? (
        <div style={{ textAlign:'center', padding:'48px 0', color:'#A9B6C8' }}>Cargando ofertas...</div>
      ) : needsProfile ? (
        <div className="aw-card" style={{ textAlign:'center', padding:'48px 24px' }}>
          <p className="aw-muted" style={{ marginBottom:16 }}>Sube tu CV para que FITCV te muestre las ofertas de tu perfil.</p>
          <button onClick={() => router.push('/cv')} className="aw-btn-gold">Subir mi CV</button>
        </div>
      ) : offers.length === 0 ? (
        <div className="aw-card" style={{ textAlign:'center', padding:'48px 24px' }}>
          {mode === 'profile' ? (
            <>
              <p className="aw-muted" style={{ marginBottom:8 }}>Todavía no hay ofertas vigentes afines a tu perfil con esos filtros.</p>
              <p className="aw-dim">FITCV revisa los portales cada hora. Mientras, puedes agregar ofertas de LinkedIn, Computrabajo o Laborum con la extensión.</p>
            </>
          ) : (
            <p className="aw-muted">No hay ofertas vigentes con esos filtros.</p>
          )}
        </div>
      ) : (
        <ul style={{ listStyle:'none', padding:0, margin:0, display:'flex', flexDirection:'column', gap:8 }}>
          {offers.map(offer => {
            const postulationId = applied[offer.id];
            return (
              <li key={offer.id} className="aw-card aw-card-sm">
                <div style={{ display:'flex', alignItems:'flex-start', gap:16 }}>
                  <div style={{ minWidth:0, flex:1 }}>
                    <p style={{ fontWeight:600, color:'#F4F1E9' }}>{offer.title}</p>
                    <p className="aw-muted">{offer.company}{offer.location ? ` · ${offer.location}` : ''}</p>
                    {offer.match && (() => {
                      const d = TIER_DARK[offer.match.tier];
                      return (
                        <p style={{ marginTop:6, display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                          <span className="aw-pill" style={{ background:d.bg, color:d.color }}>
                            {MATCH_TIER_LABELS[offer.match.tier]} · {offer.match.score}%
                          </span>
                          {offer.match.reasons.length > 0 && <span className="aw-dim">Coincide con: {offer.match.reasons.join(', ')}</span>}
                        </p>
                      );
                    })()}
                    <div style={{ display:'flex', flexWrap:'wrap', alignItems:'center', gap:6, marginTop:6 }}>
                      <span className="aw-pill aw-pill-gray">{sourceLabel(offer.source)}</span>
                      {offer.publishedAt && <span className="aw-dim">Publicada el {new Date(offer.publishedAt).toLocaleDateString()}</span>}
                      {offer.validThrough && <span className="aw-dim">· vence el {new Date(offer.validThrough).toLocaleDateString()}</span>}
                      {typeof offer.salaryMin === 'number' && (
                        <span className="aw-dim">
                          · {money(offer.salaryMin, offer.salaryCurrency)}
                          {typeof offer.salaryMax === 'number' && offer.salaryMax !== offer.salaryMin ? ` – ${money(offer.salaryMax, offer.salaryCurrency)}` : ''}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:8, flexShrink:0 }}>
                    {postulationId ? (
                      <button onClick={() => router.push(`/postulations/${postulationId}`)} className="aw-btn-outline aw-btn-sm" style={{ borderColor:'rgba(110,231,183,.4)', color:'#6EE7B7' }}>
                        Ya postulada · ver
                      </button>
                    ) : (
                      <button onClick={() => applyWithFitcv(offer)} disabled={busyOffer !== null} className="aw-btn-gold aw-btn-sm">
                        {busyOffer === offer.id ? 'Postulando...' : 'Postular con FITCV'}
                      </button>
                    )}
                    {offer.url && (
                      <a href={offer.url} target="_blank" rel="noopener noreferrer" className="aw-dim" style={{ fontSize:12 }}>
                        Ver en el portal →
                      </a>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {pagination.totalPages > 1 && (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:20 }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="aw-btn-outline aw-btn-sm">
            Anterior
          </button>
          <span className="aw-dim">Página {pagination.page} de {pagination.totalPages} · {pagination.total.toLocaleString('es-CL')} ofertas</span>
          <button onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))} disabled={page >= pagination.totalPages} className="aw-btn-outline aw-btn-sm">
            Siguiente
          </button>
        </div>
      )}
    </AppShell>
  );
}
