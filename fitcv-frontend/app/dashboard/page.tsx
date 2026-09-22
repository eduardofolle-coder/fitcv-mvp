'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import { ExtensionCard } from './ExtensionCard';
import { DailyAnalysisCard } from './DailyAnalysisCard';
import { DiagnosisCard } from './DiagnosisCard';

// Lo que devuelve GET /api/cv/profile tras el análisis del CV.
interface CVProfile {
  fullName: string | null;
  yearsExperience: number | null;
  summary: string | null;
  education: Array<{
    institution?: string;
    degree?: string;
    field?: string;
    graduationDate?: string;
  }>;
  skills: Record<string, string[]>;
  createdAt?: string;
}

const SKILL_GROUP_LABELS: Record<string, string> = {
  programming: 'Lenguajes',
  frameworks: 'Frameworks',
  tools: 'Herramientas',
  soft: 'Habilidades blandas',
};

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading, logout } = useAuth();
  const [profile, setProfile] = useState<CVProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [authLoading, user, router]);

  // El perfil se carga aparte de la analítica: sin CV subido la API responde
  // 404, y eso no es un error que mostrar sino el estado inicial de todos.
  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    (async () => {
      const res = await apiClient.get<CVProfile>('/cv/profile');
      if (cancelled) return;
      if (res.success && res.data) setProfile(res.data);
      setProfileLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  if (authLoading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-3xl font-bold text-gray-900">FITCV Dashboard</h1>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">{user.email}</span>
              <button
                onClick={() => {
                  logout();
                  router.push('/login');
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded hover:bg-red-700"
              >
                Logout
              </button>
            </div>
          </div>

          {/* Navigation Menu */}
          <nav className="flex space-x-4 border-t pt-4">
            <button
              onClick={() => router.push('/dashboard')}
              className="px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded"
            >
              📊 Dashboard
            </button>
            <button
              onClick={() => router.push('/cv')}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded"
            >
              📄 Upload CV
            </button>
            <button
              onClick={() => router.push('/postulations')}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded"
            >
              📝 My Applications
            </button>
            <button
              onClick={() => router.push('/offers')}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded"
            >
              💼 Ofertas
            </button>
            <button
              onClick={() => router.push('/preferences')}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded"
            >
              ✍️ Mis respuestas
            </button>
          </nav>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Perfil extraído del CV: es el resultado del análisis y hasta ahora
            no se mostraba en ninguna pantalla. */}
        {!profileLoading && (
          profile ? (
            <section className="bg-white rounded-lg shadow mb-8 p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">
                    {profile.fullName || 'Tu perfil'}
                  </h2>
                  {profile.yearsExperience !== null && (
                    <p className="text-sm text-gray-600">
                      {profile.yearsExperience} años de experiencia
                    </p>
                  )}
                </div>
                <button
                  onClick={() => router.push('/cv')}
                  className="px-3 py-1.5 text-sm font-medium text-blue-600 border border-blue-600 rounded hover:bg-blue-50"
                >
                  Actualizar CV
                </button>
              </div>

              {profile.summary && (
                <p className="text-gray-700 mb-5">{profile.summary}</p>
              )}

              {Object.entries(profile.skills || {})
                .filter(([, list]) => Array.isArray(list) && list.length > 0)
                .map(([group, list]) => (
                  <div key={group} className="mb-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
                      {SKILL_GROUP_LABELS[group] || group}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {list.map((skill) => (
                        <span
                          key={skill}
                          className="px-2.5 py-1 bg-blue-50 text-blue-800 rounded-full text-sm"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}

              {profile.education?.length > 0 && (
                <div className="mt-5 pt-4 border-t border-gray-100">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                    Educación
                  </p>
                  {profile.education.map((ed, i) => (
                    <p key={i} className="text-sm text-gray-700">
                      {[ed.degree, ed.field].filter(Boolean).join(' — ')}
                      {ed.institution ? `, ${ed.institution}` : ''}
                      {ed.graduationDate ? ` (${ed.graduationDate})` : ''}
                    </p>
                  ))}
                </div>
              )}
            </section>
          ) : (
            <section className="bg-white rounded-lg shadow mb-8 p-6 text-center">
              <h2 className="text-lg font-semibold text-gray-900 mb-1">
                Todavía no has subido tu CV
              </h2>
              <p className="text-gray-600 mb-4">
                La IA lo analiza y construye tu perfil automáticamente.
              </p>
              <button
                onClick={() => router.push('/cv')}
                className="px-5 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
              >
                Subir mi CV
              </button>
            </section>
          )
        )}

        {profile && <DiagnosisCard />}

        {profile && <DailyAnalysisCard />}

        <ExtensionCard />

      </main>
    </div>
  );
}
