'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { apiClient } from '@/lib/api-client';

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
  match?: { score: number; reasons: string[] };
}

interface OffersResponse {
  success: boolean;
  data?: Offer[];
  error?: string;
  pagination?: { page: number; totalPages: number; total: number };
  needsProfile?: boolean;
  profileTerms?: string[];
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
  linkedin: 'LinkedIn',
  computrabajo: 'Computrabajo',
  laborum: 'Laborum',
  empresa: 'Sitio de empresa',
};

// Portales que bloquean la lectura automática: sus ofertas entran con la extensión.
const EXTENSION_ONLY = ['LinkedIn', 'Computrabajo', 'Laborum', 'Empleos Públicos'];

const sourceLabel = (source: string) => SOURCE_LABELS[source] ?? source;

const money = (n: number, currency?: string | null) =>
  currency === 'USD' ? `US$${n.toLocaleString('es-CL')}` : `$${n.toLocaleString('es-CL')}`;

const affinityStyle = (score: number) =>
  score >= 60 ? 'bg-green-100 text-green-800' : score >= 35 ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-700';

export default function OffersPage() {
  const router = useRouter();
  const { user, initializing } = useAuth();

  const [mode, setMode] = useState<Mode>('profile');
  const [offers, setOffers] = useState<Offer[]>([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [profileTerms, setProfileTerms] = useState<string[]>([]);
  const [needsProfile, setNeedsProfile] = useState(false);
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
      if (search) params.set('search', search);
      if (source) params.set('source', source);

      const res = (await apiClient.get<Offer[]>(`/offers?${params}`)) as OffersResponse;
      if (cancelled) return;
      if (res.success && Array.isArray(res.data)) {
        setOffers(res.data);
        if (res.pagination) setPagination(res.pagination);
        setNeedsProfile(res.needsProfile === true);
        setProfileTerms(res.profileTerms ?? []);
      } else {
        setError(res.error || 'No se pudieron cargar las ofertas');
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [initializing, user, mode, page, search, source]);

  if (initializing) {
    return <div className="flex items-center justify-center min-h-screen">Cargando...</div>;
  }
  if (!user) return null;

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
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-5xl mx-auto px-4">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <button onClick={() => router.push('/dashboard')} className="text-sm text-blue-600 hover:underline mb-2">
              ← Tablero
            </button>
            <h1 className="text-3xl font-bold text-gray-900">Ofertas</h1>
            <p className="text-gray-600">
              {mode === 'profile'
                ? 'Ofertas vigentes afines a tu CV, de la más afín a la menos.'
                : `${totalOffers.toLocaleString('es-CL')} ofertas vigentes de portales chilenos.`}
            </p>
          </div>
          <button
            onClick={() => router.push('/postulations')}
            className="shrink-0 px-4 py-2 text-sm font-medium text-blue-600 border border-blue-600 rounded hover:bg-blue-50"
          >
            Mis postulaciones
          </button>
        </div>

        <div className="flex gap-1 mb-4 border-b border-gray-200">
          {(
            [
              ['profile', 'Para tu perfil'],
              ['all', 'Todas las ofertas'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => changeMode(value)}
              className={`px-4 py-2 -mb-px text-sm font-medium border-b-2 ${
                mode === value ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === 'profile' && profileTerms.length > 0 && (
          <p className="text-sm text-gray-700 mb-4">
            Según tu CV buscamos: <strong>{profileTerms.join(', ')}</strong>.
          </p>
        )}

        <form onSubmit={submitSearch} className="flex gap-2 mb-4">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={mode === 'profile' ? 'Afinar dentro de tus ofertas (ej: jefe, Santiago, SAP)' : 'Cargo, empresa o palabra clave'}
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
          />
          <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700">
            Buscar
          </button>
        </form>

        <div className="flex flex-wrap gap-2 mb-4">
          {[{ source: '', count: totalOffers }, ...bySource].map(item => (
            <button
              key={item.source || 'todas'}
              onClick={() => {
                setSource(item.source);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${
                source === item.source
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              {item.source ? sourceLabel(item.source) : 'Todos los portales'}
              {mode === 'all' ? ` · ${item.count.toLocaleString('es-CL')}` : ''}
            </button>
          ))}
        </div>

        <p className="text-xs text-gray-500 mb-6">
          {EXTENSION_ONLY.join(', ')} bloquean la lectura automática: agrega sus ofertas con el botón &quot;Agregar esta
          oferta a la cola&quot; de la extensión mientras navegas.
        </p>

        {error && (
          <div className="rounded-md bg-red-50 p-4 mb-4">
            <p className="text-sm font-medium text-red-800">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12 text-gray-600">Cargando ofertas...</div>
        ) : needsProfile ? (
          <div className="text-center py-12 bg-white rounded-lg shadow">
            <p className="text-gray-700 mb-4">Sube tu CV para que FITCV te muestre las ofertas de tu perfil.</p>
            <button
              onClick={() => router.push('/cv')}
              className="px-5 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
            >
              Subir mi CV
            </button>
          </div>
        ) : offers.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg shadow text-gray-600 px-6">
            {mode === 'profile' ? (
              <>
                <p className="mb-2">Todavía no hay ofertas vigentes afines a tu perfil con esos filtros.</p>
                <p className="text-sm text-gray-500">
                  FITCV revisa los portales cada hora y lee primero las ofertas de tus áreas. Mientras, puedes agregar
                  ofertas de LinkedIn, Computrabajo o Laborum con la extensión.
                </p>
              </>
            ) : (
              <p>No hay ofertas vigentes con esos filtros.</p>
            )}
          </div>
        ) : (
          <ul className="space-y-3">
            {offers.map(offer => {
              const postulationId = applied[offer.id];
              return (
                <li key={offer.id} className="bg-white rounded-lg shadow p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h2 className="font-semibold text-gray-900">{offer.title}</h2>
                      <p className="text-sm text-gray-600">
                        {offer.company}
                        {offer.location ? ` · ${offer.location}` : ''}
                      </p>
                      {offer.match && (
                        <p className="text-xs text-gray-600 mt-2">
                          <span className={`px-2 py-0.5 rounded-full font-semibold ${affinityStyle(offer.match.score)}`}>
                            Afinidad {offer.match.score}%
                          </span>
                          {offer.match.reasons.length > 0 && <span className="ml-2">Coincide con: {offer.match.reasons.join(', ')}</span>}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-gray-500">
                        <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">{sourceLabel(offer.source)}</span>
                        {offer.publishedAt && <span>Publicada el {new Date(offer.publishedAt).toLocaleDateString()}</span>}
                        {offer.validThrough && <span>· vence el {new Date(offer.validThrough).toLocaleDateString()}</span>}
                        {typeof offer.salaryMin === 'number' && (
                          <span>
                            · {money(offer.salaryMin, offer.salaryCurrency)}
                            {typeof offer.salaryMax === 'number' && offer.salaryMax !== offer.salaryMin
                              ? ` – ${money(offer.salaryMax, offer.salaryCurrency)}`
                              : ''}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      {postulationId ? (
                        <button
                          onClick={() => router.push(`/postulations/${postulationId}`)}
                          className="px-3 py-1.5 text-sm font-medium text-green-700 border border-green-600 rounded hover:bg-green-50"
                        >
                          Ya postulada · ver
                        </button>
                      ) : (
                        <button
                          onClick={() => applyWithFitcv(offer)}
                          disabled={busyOffer !== null}
                          className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
                        >
                          {busyOffer === offer.id ? 'Postulando...' : 'Postular con FITCV'}
                        </button>
                      )}
                      {offer.url && (
                        <a href={offer.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">
                          Ver en el portal
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
          <div className="flex items-center justify-between mt-6">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded bg-white disabled:opacity-50"
            >
              Anterior
            </button>
            <span className="text-sm text-gray-600">
              Página {pagination.page} de {pagination.totalPages} · {pagination.total.toLocaleString('es-CL')} ofertas
            </span>
            <button
              onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
              disabled={page >= pagination.totalPages}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded bg-white disabled:opacity-50"
            >
              Siguiente
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
