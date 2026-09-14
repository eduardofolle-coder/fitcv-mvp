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
  title: string;
  company: string;
  estado: Estado;
  prioridad: string;
  createdAt: string;
  notes?: string | null;
}

export default function PostulationsPage() {
  const router = useRouter();
  const { user, initializing } = useAuth();
  const [postulations, setPostulations] = useState<Postulation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | Estado>('all');

  // Todos los hooks van antes de cualquier return: la versión anterior salía
  // temprano mientras cargaba la sesión y declaraba el useEffect después, así
  // que al resolverse la sesión React veía más hooks que en el render previo y
  // la página entera reventaba.
  useEffect(() => {
    if (initializing || !user) return;

    let cancelled = false;
    (async () => {
      const res = await apiClient.get<Postulation[]>('/postulations');
      if (cancelled) return;

      if (res.success && Array.isArray(res.data)) {
        setPostulations(res.data);
      } else {
        setError(res.error || 'No se pudieron cargar tus postulaciones');
      }
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

  const filteredPostulations = postulations.filter(
    (p) => filter === 'all' || p.estado === filter
  );

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
                    <button className="px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-800 border border-blue-600 rounded hover:bg-blue-50">
                      View Details
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
