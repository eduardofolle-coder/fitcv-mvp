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
}

interface Pagination {
  page: number;
  totalPages: number;
  total: number;
}

interface Postulation {
  id: string;
  offerId: string;
}

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

export default function OffersPage() {
  const router = useRouter();
  const { user, initializing } = useAuth();

  const [offers, setOffers] = useState<Offer[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, totalPages: 1, total: 0 });
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
      if (search) params.set('search', search);
      if (source) params.set('source', source);

      const res = await apiClient.get<Offer[]>(`/offers?${params}`);
      if (cancelled) return;
      if (res.success && Array.isArray(res.data)) {
        setOffers(res.data);
        const meta = (res as unknown as { pagination?: Pagination }).pagination;
        if (meta) setPagination(meta);
      } else {
        setError(res.error || 'No se pudieron cargar las ofertas');
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [initializing, user, page, search, source]);

  if (initializing) {
    return <div className="flex items-center justify-center min-h-screen">Cargando...</div>;
  }
  if (!user) return null;

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
              {totalOffers.toLocaleString('es-CL')} ofertas vigentes de portales chilenos. Postula y la extensión las envía
              con tu CV adaptado.
            </p>
          </div>
          <button
            onClick={() => router.push('/postulations')}
            className="shrink-0 px-4 py-2 text-sm font-medium text-blue-600 border border-blue-600 rounded hover:bg-blue-50"
          >
            Mis postulaciones
          </button>
        </div>

        <form onSubmit={submitSearch} className="flex gap-2 mb-4">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Cargo, empresa o palabra clave (ej: analista, Node.js, enfermera)"
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
              {item.source ? sourceLabel(item.source) : 'Todos los portales'} · {item.count.toLocaleString('es-CL')}
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
        ) : offers.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg shadow text-gray-500">
            No hay ofertas vigentes con esos filtros.
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
