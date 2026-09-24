'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import { APPLY_STATUS_LABELS, APPLY_STATUS_STYLES, applyStatusOf } from '@/lib/applyStatus';

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
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
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
    'Por revisar': 'bg-gray-100 text-gray-800',
    'Preparar postulación': 'bg-purple-100 text-purple-800',
    'Aplicado': 'bg-blue-100 text-blue-800',
    'En revisión': 'bg-yellow-100 text-yellow-800',
    'Entrevista': 'bg-green-100 text-green-800',
    'Descartado': 'bg-red-100 text-red-800',
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">My Postulations</h1>
            <p className="text-gray-600">Track your job applications and their status</p>
          </div>
          <button
            onClick={queueAll}
            disabled={queueing || pendingToSend.length === 0}
            className="shrink-0 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {queueing ? 'Poniendo en cola...' : `Enviar ${pendingToSend.length} pendientes con la extensión`}
          </button>
        </div>

        {queueMessage && (
          <div className="rounded-md bg-blue-50 p-4 mb-6">
            <p className="text-sm text-blue-900">{queueMessage}</p>
          </div>
        )}

        {/* Filters */}
        <div className="mb-6 flex gap-2 flex-wrap">
          {(['all', ...ESTADOS] as const).map((estado) => (
            <button
              key={estado}
              onClick={() => setFilter(estado)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition ${
                filter === estado
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              {estado === 'all' ? 'Todas' : estado}
            </button>
          ))}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-600">Total</p>
            <p className="text-3xl font-bold text-gray-900">{postulations.length}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-600">Enviadas</p>
            <p className="text-3xl font-bold text-green-600">
              {postulations.filter((p) => applyStatusOf(p.applyStatus) === 'enviada').length}
            </p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-600">Requieren tu atención</p>
            <p className="text-3xl font-bold text-yellow-600">
              {
                postulations.filter((p) =>
                  ['requiere-atencion', 'requiere-autorizacion'].includes(applyStatusOf(p.applyStatus))
                ).length
              }
            </p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-600">Entrevistas</p>
            <p className="text-3xl font-bold text-blue-600">
              {postulations.filter((p) => p.estado === 'Entrevista').length}
            </p>
          </div>
        </div>

        {/* Bandeja Sugeridas */}
        {!loading && suggestedPostulations.length > 0 && (
          <section className="mb-8">
            <div className="flex items-center gap-3 mb-3">
              <h2 className="text-lg font-semibold text-gray-900">Sugeridas por FITCV</h2>
              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-medium">
                {suggestedPostulations.length}
              </span>
              <span className="text-xs text-gray-500">No consumen cuota hasta que las apruebes</span>
            </div>
            <div className="space-y-3">
              {suggestedPostulations.map((p) => (
                <div key={p.id} className="bg-white rounded-lg shadow p-4 flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900 truncate">{p.title}</span>
                      {p.matchScore != null && (
                        <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-800 text-xs font-medium">
                          {Math.round(p.matchScore)}% calce
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600">{p.company}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => approveSuggested(p.id)}
                      disabled={actingSuggested === p.id}
                      className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
                    >
                      Aprobar
                    </button>
                    <button
                      onClick={() => declineSuggested(p.id)}
                      disabled={actingSuggested === p.id}
                      className="px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
                    >
                      Descartar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Postulations List */}
        {loading ? (
          <div className="text-center py-12">Cargando...</div>
        ) : error ? (
          <div className="text-center py-12 bg-white rounded-lg shadow">
            <p className="text-red-700">{error}</p>
          </div>
        ) : filteredPostulations.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg shadow">
            <p className="text-gray-500">
              {postulations.length === 0
                ? 'Todavía no has creado ninguna postulación.'
                : 'Ninguna postulación con ese estado.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredPostulations.map((post) => {
              const applyStatus = applyStatusOf(post.applyStatus);
              return (
                <div key={post.id} className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <h3 className="text-lg font-semibold text-gray-900">{post.title}</h3>
                        <span
                          className={`px-3 py-1 rounded-full text-sm font-medium ${
                            statusColors[post.estado] ?? 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {post.estado}
                        </span>
                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${APPLY_STATUS_STYLES[applyStatus]}`}>
                          {APPLY_STATUS_LABELS[applyStatus]}
                        </span>
                      </div>
                      <p className="text-gray-600 mb-3">{post.company}</p>
                      {post.notes && (
                        <p className="text-sm text-gray-600 mb-2">
                          <strong>Notes:</strong> {post.notes}
                        </p>
                      )}
                      <p className="text-xs text-gray-500">
                        Creada el {new Date(post.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="ml-4">
                      <button
                        onClick={() => router.push(`/postulations/${post.id}`)}
                        className="px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-800 border border-blue-600 rounded hover:bg-blue-50"
                      >
                        {applyStatus === 'requiere-atencion' ? 'Revisar' : 'Ver CV adaptado'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Ofertas disponibles: las que trae FITCV de los portales y las que
            agregas desde la extensión. */}
        {!loading && availableOffers.length > 0 && (
          <section className="mt-10">
            <h2 className="text-xl font-bold text-gray-900 mb-1">Ofertas afines a tu perfil</h2>
            <p className="text-gray-600 mb-4">
              Las más afines a tu CV. Crea una postulación y adapta tu CV a la oferta, o{' '}
              <button onClick={() => router.push('/offers')} className="text-blue-600 hover:underline">
                ve todas las ofertas
              </button>
              .
            </p>

            {createError && (
              <div className="rounded-md bg-red-50 p-4 mb-4">
                <p className="text-sm font-medium text-red-800">{createError}</p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {availableOffers.map((offer) => (
                <div key={offer.id} className="bg-white rounded-lg shadow p-5 flex flex-col">
                  <h3 className="font-semibold text-gray-900">{offer.title}</h3>
                  <p className="text-gray-600 text-sm">
                    {offer.company}
                    {offer.location ? ` · ${offer.location}` : ''}
                  </p>
                  {typeof offer.salaryMin === 'number' && typeof offer.salaryMax === 'number' && (
                    <p className="text-xs text-gray-500 mt-1">
                      {money(offer.salaryMin, offer.salaryCurrency)} – {money(offer.salaryMax, offer.salaryCurrency)}
                    </p>
                  )}
                  <button
                    onClick={() => createPostulation(offer.id)}
                    disabled={creating !== null}
                    className="mt-4 self-start px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    {creating === offer.id ? 'Creando...' : 'Crear postulación'}
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
