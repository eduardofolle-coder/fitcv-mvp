import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Layout } from '../components/Layout';
import { Postulation } from '../types';

export function PostulationsPage() {
  const [postulations, setPostulations] = useState<Postulation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterEstado, setFilterEstado] = useState<string>('');
  const [showOutcomeModal, setShowOutcomeModal] = useState(false);
  const [selectedPostulation, setSelectedPostulation] = useState<Postulation | null>(null);
  const [showCVModal, setShowCVModal] = useState(false);

  useEffect(() => {
    loadPostulations();
  }, []);

  const loadPostulations = async () => {
    try {
      const data = await api.getPostulations();
      setPostulations(data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load postulations');
    } finally {
      setLoading(false);
    }
  };

  const filteredPostulations = filterEstado
    ? postulations.filter(p => p.estado === filterEstado)
    : postulations;

  const estados = ['Por revisar', 'Preparar', 'Aplicado', 'Entrevista', 'Oferta'];

  const estadoStats = {
    total: postulations.length,
    porRevisar: postulations.filter(p => p.estado === 'Por revisar').length,
    preparar: postulations.filter(p => p.estado === 'Preparar').length,
    aplicado: postulations.filter(p => p.estado === 'Aplicado').length,
    entrevista: postulations.filter(p => p.estado === 'Entrevista').length,
    oferta: postulations.filter(p => p.estado === 'Oferta').length,
  };

  if (loading) {
    return (
      <Layout title="Applications">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading applications...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Applications">
      <div className="space-y-8">
        {/* Stats */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Pipeline Overview</h2>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <StatCard label="Total" value={estadoStats.total} color="blue" />
            <StatCard label="To Review" value={estadoStats.porRevisar} color="yellow" />
            <StatCard label="Preparing" value={estadoStats.preparar} color="purple" />
            <StatCard label="Applied" value={estadoStats.aplicado} color="gray" />
            <StatCard label="Interviews" value={estadoStats.entrevista} color="blue" />
            <StatCard label="Offers" value={estadoStats.oferta} color="green" />
          </div>
        </div>

        {/* Filters */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Filter by Status</h2>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setFilterEstado('')}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                filterEstado === ''
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-900 hover:bg-gray-300'
              }`}
            >
              All ({postulations.length})
            </button>
            {estados.map(estado => {
              const count = postulations.filter(p => p.estado === estado).length;
              return (
                <button
                  key={estado}
                  onClick={() => setFilterEstado(estado)}
                  className={`px-4 py-2 rounded-lg font-medium transition ${
                    filterEstado === estado
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-900 hover:bg-gray-300'
                  }`}
                >
                  {estado} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {/* Postulations Table */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Applications {filterEstado ? `- ${filterEstado}` : ''}
          </h2>

          {error && (
            <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
              {error}
            </div>
          )}

          {filteredPostulations.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <p className="text-gray-600 text-lg mb-4">
                No applications {filterEstado ? `with status "${filterEstado}"` : 'yet'}
              </p>
              <button
                onClick={() => setFilterEstado('')}
                className="text-blue-600 hover:underline font-medium"
              >
                View all applications
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-100 border-b">
                    <tr>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">
                        Job Title
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">
                        Status
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">
                        Match Score
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">
                        ATS Score
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">
                        Created
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredPostulations.map(post => (
                      <PostulationRow
                        key={post.id}
                        postulation={post}
                        onReportOutcome={() => {
                          setSelectedPostulation(post);
                          setShowOutcomeModal(true);
                        }}
                        onGenerateCV={() => {
                          setSelectedPostulation(post);
                          setShowCVModal(true);
                        }}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showOutcomeModal && selectedPostulation && (
        <OutcomeReporterModal
          postulation={selectedPostulation}
          onClose={() => {
            setShowOutcomeModal(false);
            setSelectedPostulation(null);
          }}
          onSuccess={() => {
            loadPostulations();
            setShowOutcomeModal(false);
            setSelectedPostulation(null);
          }}
        />
      )}

      {showCVModal && selectedPostulation && (
        <CVAdapterModal
          postulation={selectedPostulation}
          onClose={() => {
            setShowCVModal(false);
            setSelectedPostulation(null);
          }}
        />
      )}
    </Layout>
  );
}

function PostulationRow({
  postulation,
  onReportOutcome,
  onGenerateCV,
}: {
  postulation: Postulation;
  onReportOutcome: () => void;
  onGenerateCV: () => void;
}) {
  return (
    <tr className="hover:bg-gray-50 transition">
      <td className="px-6 py-4">
        <div>
          <p className="font-medium text-gray-900">Postulation {postulation.offerId}</p>
          <p className="text-sm text-gray-600">{postulation.createdAt.split('T')[0]}</p>
        </div>
      </td>
      <td className="px-6 py-4">
        <EstadoBadge estado={postulation.estado} />
      </td>
      <td className="px-6 py-4">
        <ScoreBadge score={postulation.matchScore} label="Match" />
      </td>
      <td className="px-6 py-4">
        <ScoreBadge score={postulation.atsScore} label="ATS" />
      </td>
      <td className="px-6 py-4 text-sm text-gray-600">
        {new Date(postulation.createdAt).toLocaleDateString()}
      </td>
      <td className="px-6 py-4">
        <div className="flex gap-2">
          <button
            onClick={onGenerateCV}
            className="px-3 py-1 text-xs bg-blue-100 text-blue-700 hover:bg-blue-200 rounded font-medium transition"
            title="Generate adapted CV for this job"
          >
            📝 CV
          </button>
          <button
            onClick={onReportOutcome}
            className="px-3 py-1 text-xs bg-green-100 text-green-700 hover:bg-green-200 rounded font-medium transition"
            title="Report interview, offer, or rejection"
          >
            ✓ Outcome
          </button>
        </div>
      </td>
    </tr>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colorClass = {
    blue: 'bg-blue-100 text-blue-800',
    green: 'bg-green-100 text-green-800',
    yellow: 'bg-yellow-100 text-yellow-800',
    purple: 'bg-purple-100 text-purple-800',
    gray: 'bg-gray-100 text-gray-800',
  }[color];

  return (
    <div className={`${colorClass} rounded-lg p-4 text-center`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs font-medium mt-1">{label}</p>
    </div>
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
      className={`px-3 py-1 rounded-full text-xs font-semibold ${
        colors[estado as keyof typeof colors] || 'bg-gray-100'
      }`}
    >
      {estado}
    </span>
  );
}

function ScoreBadge({ score, label }: { score?: number; label: string }) {
  if (!score) return <span className="text-gray-400 text-sm">—</span>;

  const color = score >= 75 ? 'green' : score >= 50 ? 'yellow' : 'red';
  const colorClass = {
    green: 'bg-green-100 text-green-800',
    yellow: 'bg-yellow-100 text-yellow-800',
    red: 'bg-red-100 text-red-800',
  }[color];

  return (
    <span className={`px-3 py-1 rounded-full text-sm font-semibold ${colorClass}`}>
      {score}%
    </span>
  );
}

function CVAdapterModal({
  postulation,
  onClose,
}: {
  postulation: Postulation;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [adapted, setAdapted] = useState<any>(null);

  const handleGenerateCV = async () => {
    setLoading(true);
    try {
      const result = await api.generateAdaptedCV(postulation.id);
      setAdapted(result);
    } catch (err) {
      console.error('Failed to generate CV:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal onClose={onClose} title="Generate Adapted CV">
      {adapted ? (
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-green-800 font-semibold">✓ CV Generated Successfully</p>
            <p className="text-green-700 text-sm">ATS Score: {adapted.atsScore}%</p>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900 mb-2">Optimized CV</h3>
            <div className="bg-gray-50 p-4 rounded-lg max-h-80 overflow-y-auto font-mono text-sm">
              <pre className="text-gray-700 whitespace-pre-wrap">{adapted.adaptedCV}</pre>
            </div>
          </div>

          {adapted.keywords && (
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">Key Keywords Used</h3>
              <div className="flex flex-wrap gap-2">
                {adapted.keywords.map((kw: string) => (
                  <span key={kw} className="bg-blue-100 text-blue-800 px-3 py-1 rounded text-sm">
                    {kw}
                  </span>
                ))}
              </div>
            </div>
          )}

          {adapted.changes && (
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">Changes Made</h3>
              <ul className="space-y-2">
                {adapted.changes.map((change: string) => (
                  <li key={change} className="flex gap-2 text-sm text-gray-700">
                    <span className="text-green-600">✓</span>
                    <span>{change}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button
            onClick={onClose}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg transition"
          >
            Close
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-gray-700">
            Generate a CV adapted specifically for this job. The AI will optimize it for ATS scanning and highlight relevant skills.
          </p>

          <button
            onClick={handleGenerateCV}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-3 rounded-lg transition flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Generating with AI...
              </>
            ) : (
              '📝 Generate Adapted CV'
            )}
          </button>

          <button
            onClick={onClose}
            className="w-full bg-gray-200 hover:bg-gray-300 text-gray-900 font-semibold py-2 rounded-lg transition"
          >
            Cancel
          </button>
        </div>
      )}
    </Modal>
  );
}

function OutcomeReporterModal({
  postulation,
  onClose,
  onSuccess,
}: {
  postulation: Postulation;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [outcome, setOutcome] = useState('');
  const [feedback, setFeedback] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!outcome) {
      alert('Please select an outcome');
      return;
    }

    setLoading(true);
    try {
      await api.reportOutcome(postulation.id, outcome, feedback);
      onSuccess();
    } catch (err) {
      console.error('Failed to report outcome:', err);
      alert('Failed to report outcome');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal onClose={onClose} title="Report Application Outcome">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-900 mb-2">Outcome *</label>
          <div className="space-y-2">
            {['interview', 'offer', 'rejection', 'unknown'].map(opt => (
              <label key={opt} className="flex items-center gap-3">
                <input
                  type="radio"
                  name="outcome"
                  value={opt}
                  checked={outcome === opt}
                  onChange={e => setOutcome(e.target.value)}
                  className="w-4 h-4"
                />
                <span className="text-gray-700 font-medium capitalize">{opt}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-900 mb-2">
            Feedback (Optional)
          </label>
          <textarea
            value={feedback}
            onChange={e => setFeedback(e.target.value)}
            placeholder="e.g., Interviewer asked about microservices..."
            rows={4}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <p className="text-xs text-gray-600 bg-blue-50 p-3 rounded">
          💡 Your feedback helps our system learn and provide better recommendations next time.
        </p>

        <div className="flex gap-3">
          <button
            onClick={handleSubmit}
            disabled={loading || !outcome}
            className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold py-2 rounded-lg transition"
          >
            {loading ? 'Saving...' : '✓ Report'}
          </button>
          <button
            onClick={onClose}
            className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-900 font-semibold py-2 rounded-lg transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Modal({
  onClose,
  title,
  children,
}: {
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-96 overflow-y-auto">
        <div className="sticky top-0 bg-white border-b p-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl"
          >
            ✕
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
