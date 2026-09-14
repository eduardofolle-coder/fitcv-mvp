'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import {
  TopKeywordsResponse,
  PatternsResponse,
  SkillGrowthResponse,
  RecommendationsResponse,
  MarketTrendsResponse,
} from '@/lib/types';

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
  const [activeTab, setActiveTab] = useState<'keywords' | 'patterns' | 'skills' | 'recommendations' | 'trends'>('keywords');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [keywords, setKeywords] = useState<string[]>([]);
  const [patterns, setPatterns] = useState<PatternsResponse | null>(null);
  const [skills, setSkills] = useState<SkillGrowthResponse | null>(null);
  const [recommendations, setRecommendations] = useState<RecommendationsResponse | null>(null);
  const [trends, setTrends] = useState<MarketTrendsResponse | null>(null);

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

  const loadData = async () => {
    if (!user) return;

    setLoading(true);
    setError(null);

    try {
      const [keywordsRes, patternsRes, skillsRes, recsRes, trendsRes] = await Promise.all([
        apiClient.get<TopKeywordsResponse>('/learning/top-keywords'),
        apiClient.get<PatternsResponse>('/learning/patterns'),
        apiClient.get<SkillGrowthResponse>('/learning/skill-growth'),
        apiClient.get<RecommendationsResponse>('/learning/recommendations'),
        apiClient.get<MarketTrendsResponse>('/learning/market-trends'),
      ]);

      if (keywordsRes.success && keywordsRes.data) {
        setKeywords(keywordsRes.data.keywords);
      }
      if (patternsRes.success && patternsRes.data) {
        setPatterns(patternsRes.data);
      }
      if (skillsRes.success && skillsRes.data) {
        setSkills(skillsRes.data);
      }
      if (recsRes.success && recsRes.data) {
        setRecommendations(recsRes.data);
      }
      if (trendsRes.success && trendsRes.data) {
        setTrends(trendsRes.data);
      }

      if (!keywordsRes.success) {
        setError('Failed to load learning data');
      }
    } catch (err) {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadData();
    }
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
          </nav>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="rounded-md bg-red-50 p-4 mb-4">
            <p className="text-sm font-medium text-red-800">{error}</p>
          </div>
        )}

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

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-8">
            {(['keywords', 'patterns', 'skills', 'recommendations', 'trends'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-2 px-1 border-b-2 font-medium text-sm capitalize ${
                  activeTab === tab
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.replace(/([A-Z])/g, ' $1').trim()}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab content */}
        {loading ? (
          <div className="text-center py-12">Loading...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeTab === 'keywords' && (
              <>
                {keywords.length > 0 ? (
                  keywords.map((keyword, idx) => (
                    <div key={idx} className="bg-white rounded-lg shadow p-4">
                      <p className="text-sm text-gray-600">Keyword {idx + 1}</p>
                      <p className="text-lg font-semibold text-gray-900">{keyword}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-500">No keywords found</p>
                )}
              </>
            )}

            {activeTab === 'patterns' && patterns && (
              <>
                <div className="bg-white rounded-lg shadow p-4">
                  <p className="text-sm text-gray-600">Total Adaptations</p>
                  <p className="text-3xl font-bold text-gray-900">{patterns.totalAdaptations}</p>
                </div>
                <div className="bg-white rounded-lg shadow p-4">
                  <p className="text-sm text-gray-600">Average Score</p>
                  <p className="text-3xl font-bold text-gray-900">{patterns.averageScore}</p>
                </div>
                <div className="bg-white rounded-lg shadow p-4 lg:col-span-3">
                  <p className="text-sm font-semibold text-gray-600 mb-2">Top Companies</p>
                  <div className="flex flex-wrap gap-2">
                    {patterns.topCompanies.map((company, idx) => (
                      <span key={idx} className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
                        {company}
                      </span>
                    ))}
                  </div>
                </div>
              </>
            )}

            {activeTab === 'skills' && skills && (
              <>
                <div className="bg-white rounded-lg shadow p-4 lg:col-span-3">
                  <p className="text-sm font-semibold text-gray-600 mb-2">New Skills</p>
                  <div className="flex flex-wrap gap-2">
                    {skills.newSkills.map((skill, idx) => (
                      <span key={idx} className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="bg-white rounded-lg shadow p-4 lg:col-span-3">
                  <p className="text-sm font-semibold text-gray-600 mb-2">Strengthened Skills</p>
                  <div className="flex flex-wrap gap-2">
                    {skills.strengthenedSkills.map((skill, idx) => (
                      <span key={idx} className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              </>
            )}

            {activeTab === 'recommendations' && recommendations && (
              <>
                <div className="bg-white rounded-lg shadow p-4 lg:col-span-3">
                  <p className="text-sm font-semibold text-gray-600 mb-2">Recommended Keywords</p>
                  <div className="flex flex-wrap gap-2">
                    {recommendations.recommendedKeywords.map((kw, idx) => (
                      <span key={idx} className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm">
                        {kw}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="bg-white rounded-lg shadow p-4 lg:col-span-3">
                  <p className="text-sm font-semibold text-gray-600 mb-2">Recommended Companies</p>
                  <div className="flex flex-wrap gap-2">
                    {recommendations.recommendedCompanies.map((company, idx) => (
                      <span key={idx} className="px-3 py-1 bg-indigo-100 text-indigo-800 rounded-full text-sm">
                        {company}
                      </span>
                    ))}
                  </div>
                </div>
              </>
            )}

            {activeTab === 'trends' && trends && (
              <>
                <div className="bg-white rounded-lg shadow p-4 lg:col-span-3">
                  <p className="text-sm font-semibold text-gray-600 mb-2">Hot Skills</p>
                  <div className="flex flex-wrap gap-2">
                    {trends.hotSkills.map((skill, idx) => (
                      <span key={idx} className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="bg-white rounded-lg shadow p-4 lg:col-span-3">
                  <p className="text-sm font-semibold text-gray-600 mb-2">Hot Companies</p>
                  <div className="flex flex-wrap gap-2">
                    {trends.hotCompanies.map((company, idx) => (
                      <span key={idx} className="px-3 py-1 bg-orange-100 text-orange-800 rounded-full text-sm">
                        {company}
                      </span>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
