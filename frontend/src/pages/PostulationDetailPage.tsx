import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { Layout } from '../components/Layout';
import { MatchScoreCard } from '../components/MatchScoreCard';
import { Postulation, MatchResult } from '../types';

export function PostulationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [postulation, setPostulation] = useState<Postulation | null>(null);
  const [match, setMatch] = useState<MatchResult | null>(null);
  const [adapted, setAdapted] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    loadPostulationDetails();
  }, [id]);

  const loadPostulationDetails = async () => {
    try {
      if (!id) throw new Error('No postulation ID');

      // Load postulation
      const postRes = await api.getPostulation(id);
      setPostulation(postRes);

      // Load match analysis
      try {
        const matchRes = await api.matchPostulation(postRes.offerId);
        setMatch(matchRes);
      } catch (err) {
        console.log('Match not available');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load postulation');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateCV = async () => {
    if (!id || !postulation) return;
    setGenerating(true);
    try {
      const result = await api.generateAdaptedCV(id);
      setAdapted(result);
    } catch (err) {
      console.error('Failed to generate CV:', err);
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <Layout title="Application Details">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading details...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout title="Application Details">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <p className="text-red-700 mb-4">{error}</p>
          <button
            onClick={() => navigate('/postulations')}
            className="text-blue-600 hover:underline"
          >
            Back to applications
          </button>
        </div>
      </Layout>
    );
  }

  if (!postulation) {
    return (
      <Layout title="Application Details">
        <div className="bg-gray-50 rounded-lg p-6">
          <p className="text-gray-600">No postulation found</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Application Details">
      <div className="space-y-8">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg shadow-lg p-8 text-white">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h1 className="text-3xl font-bold mb-2">Postulation Details</h1>
              <p className="text-blue-100">Job Offer: {postulation.offerId}</p>
            </div>
            <EstadoBadge estado={postulation.estado} />
          </div>
          <div className="flex gap-4 mt-6">
            <button
              onClick={handleGenerateCV}
              disabled={generating}
              className="bg-white/20 hover:bg-white/30 text-white font-semibold py-2 px-6 rounded-lg transition"
            >
              {generating ? '⏳ Generating...' : '📝 Generate Adapted CV'}
            </button>
            <button
              onClick={() => navigate('/postulations')}
              className="bg-white/20 hover:bg-white/30 text-white font-semibold py-2 px-6 rounded-lg transition"
            >
              ← Back to List
            </button>
          </div>
        </div>

        {/* Match Analysis */}
        {match && (
          <div>
            <h2 className="text-2xl font-bold mb-4">Job Fit Analysis</h2>
            <MatchScoreCard match={match} title="How Well You Match This Role" />
          </div>
        )}

        {/* Adapted CV */}
        {adapted && (
          <div>
            <h2 className="text-2xl font-bold mb-4">Your Adapted CV</h2>
            <div className="bg-white rounded-lg shadow-lg p-8 space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">ATS Optimization Score</h3>
                <span className="text-4xl font-bold text-green-600">{adapted.atsScore}%</span>
              </div>

              {adapted.keywords && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Key Keywords Included</h3>
                  <div className="flex flex-wrap gap-2">
                    {adapted.keywords.map((kw: string) => (
                      <span
                        key={kw}
                        className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium"
                      >
                        {kw}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {adapted.changes && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Changes Made to CV</h3>
                  <ul className="space-y-2">
                    {adapted.changes.map((change: string, idx: number) => (
                      <li key={idx} className="flex gap-3">
                        <span className="text-green-600 font-bold">✓</span>
                        <span className="text-gray-700">{change}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Adapted CV Content</h3>
                <div className="bg-gray-50 p-4 rounded-lg max-h-96 overflow-y-auto border">
                  <pre className="text-gray-700 text-sm font-mono whitespace-pre-wrap">
                    {adapted.adaptedCV}
                  </pre>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg transition">
                  📋 Copy to Clipboard
                </button>
                <button className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-2 rounded-lg transition">
                  ✓ Ready to Apply
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Timeline */}
        <div>
          <h2 className="text-2xl font-bold mb-4">Application Timeline</h2>
          <div className="space-y-3">
            <TimelineItem
              date={postulation.createdAt}
              title="Application Created"
              status="completed"
            />
            <TimelineItem
              date={postulation.updatedAt}
              title="Last Updated"
              status={postulation.estado === 'Aplicado' ? 'completed' : 'pending'}
            />
            {postulation.estado === 'Entrevista' && (
              <TimelineItem date="—" title="Interview Scheduled" status="in-progress" />
            )}
            {postulation.estado === 'Oferta' && (
              <TimelineItem date="—" title="Offer Received" status="completed" />
            )}
          </div>
        </div>

        {/* Stats */}
        <div>
          <h2 className="text-2xl font-bold mb-4">Application Stats</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatBox label="Match Score" value={postulation.matchScore?.toString() || '—'} />
            <StatBox label="ATS Score" value={postulation.atsScore?.toString() || '—'} />
            <StatBox label="Status" value={postulation.estado} />
          </div>
        </div>
      </div>
    </Layout>
  );
}

function EstadoBadge({ estado }: { estado: string }) {
  const colors = {
    'Por revisar': 'bg-yellow-100 text-yellow-800',
    'Preparar': 'bg-purple-100 text-purple-800',
    'Aplicado': 'bg-gray-100 text-gray-800',
    'Entrevista': 'bg-blue-100 text-blue-800',
    'Oferta': 'bg-green-100 text-green-800',
  };

  return (
    <span
      className={`px-4 py-2 rounded-full text-lg font-semibold ${
        colors[estado as keyof typeof colors] || 'bg-gray-100'
      }`}
    >
      {estado}
    </span>
  );
}

function TimelineItem({
  date,
  title,
  status,
}: {
  date: string;
  title: string;
  status: 'completed' | 'in-progress' | 'pending';
}) {
  const statusClass = {
    completed: 'bg-green-600',
    'in-progress': 'bg-blue-600',
    pending: 'bg-gray-300',
  }[status];

  return (
    <div className="flex gap-4">
      <div className={`w-4 h-4 rounded-full ${statusClass} mt-1.5 flex-shrink-0`} />
      <div className="flex-1">
        <h3 className="font-semibold text-gray-900">{title}</h3>
        <p className="text-sm text-gray-600">{date}</p>
      </div>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <p className="text-sm text-gray-600 mb-2">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}
