'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api-client';

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
}

interface Offer {
  id: string;
  title: string;
  company: string;
  level?: string;
  location?: string;
  salaryMin?: number;
  salaryMax?: number;
}

const clp = (n?: number) => (typeof n === 'number' ? `$${n.toLocaleString('es-CL')}` : '');

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

  // Todos los hooks van antes de cualquier return: la versión anterior salía
  // temprano mientras cargaba la sesión y declaraba el useEffect después, así
  // que al resolverse la sesión React veía más hooks que en el render previo y
  // la página entera reventaba.
  useEffect(() => {
    if (initializing || !user) return;

    let cancelled = false;
    (async () => {
      const [res, offersRes] = await Promise.all([
        apiClient.get<Postulation[]>('/postulations'),
        apiClient.get<Offer[]>('/offers'),
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
  }, [initializing, user]);

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

  const filteredPostulations = postulations.filter(
    (p) => filter === 'all' || p.estado === filter
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
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">My Postulations</h1>
          <p className="text-gray-600">Track your job applications and their status</p>
        </div>

        {/* Filters */}
        <div className="mb-6 flex gap-2">
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
            <p className="text-sm text-gray-600">En revisión</p>
            <p className="text-3xl font-bold text-yellow-600">
              {postulations.filter((p) => p.estado === 'En revisión').length}
            </p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-600">Entrevistas</p>
            <p className="text-3xl font-bold text-green-600">
              {postulations.filter((p) => p.estado === 'Entrevista').length}
            </p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-600">Activas</p>
            <p className="text-3xl font-bold text-blue-600">
              {/* Sin postulaciones esto dividía por cero y mostraba "NaN%". */}
              {postulations.length === 0
                ? '—'
                : `${Math.round(
                    (postulations.filter((p) => p.estado !== 'Descartado').length /
                      postulations.length) *
                      100
                  )}%`}
            </p>
          </div>
        </div>

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
            {filteredPostulations.map((post) => (
              <div key={post.id} className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">{post.title}</h3>
                      <span
                        className={`px-3 py-1 rounded-full text-sm font-medium ${
                          statusColors[post.estado] ?? 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {post.estado}
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
                      Ver CV adaptado
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Ofertas disponibles: hasta que llegue la búsqueda en portales, es la
            única forma de crear una postulación desde la web. */}
        {!loading && availableOffers.length > 0 && (
          <section className="mt-10">
            <h2 className="text-xl font-bold text-gray-900 mb-1">Ofertas disponibles</h2>
            <p className="text-gray-600 mb-4">Crea una postulación y adapta tu CV a la oferta.</p>

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
                  {offer.salaryMin !== undefined && offer.salaryMax !== undefined && (
                    <p className="text-xs text-gray-500 mt-1">
                      {clp(offer.salaryMin)} – {clp(offer.salaryMax)}
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
