import { useEffect, useState } from 'react';
import { useAPI } from '../hooks';
import { useAuthStore } from '../store/authStore';

interface JobOffer {
  id: string;
  title: string;
  company: string;
  level: string;
  salaryMin?: number;
  salaryMax?: number;
  location?: string;
  description: string;
}

interface Postulation {
  id: string;
  offerId: string;
  title: string;
  company: string;
  estado: string;
  prioridad: string;
  postulationWeight: number;
  createdAt: string;
}

export function DashboardPage() {
  const api = useAPI();
  const user = useAuthStore(s => s.user);
  const logout = useAuthStore(s => s.logout);
  const [offers, setOffers] = useState<JobOffer[]>([]);
  const [postulations, setPostulations] = useState<Postulation[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [offersRes, statsRes, postulationsRes] = await Promise.all([
        api.get('/offers?limit=50'),
        api.get('/offers/stats/summary'),
        api.get('/postulations?limit=50')
      ]);

      setOffers(offersRes.data.data || []);
      setStats(statsRes.data.data || {});
      setPostulations(postulationsRes.data.data || []);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePostulate = async (offerId: string) => {
    setPosting(true);
    try {
      await api.post('/postulations', {
        offerId,
        estado: 'Por revisar',
        prioridad: 'Media',
        notes: ''
      });
      loadData();
    } catch (err: any) {
      alert('Error: ' + (err.response?.data?.message || 'Failed to apply'));
    } finally {
      setPosting(false);
    }
  };

  const isPosted = (offerId: string) => postulations.some(p => p.offerId === offerId);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">FITCV Dashboard</h1>
            <p className="text-sm text-gray-600">Welcome back, {user?.email}</p>
          </div>
          <button
            onClick={() => {
              logout?.();
              window.location.href = '/login';
            }}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Logout
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow p-6">
              <p className="text-sm text-gray-600">Total Job Offers</p>
              <p className="text-3xl font-bold text-blue-600">{stats.totalOffers || 0}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <p className="text-sm text-gray-600">My Postulations</p>
              <p className="text-3xl font-bold text-green-600">{postulations.length}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <p className="text-sm text-gray-600">Success Rate</p>
              <p className="text-3xl font-bold text-purple-600">
                {postulations.length > 0 ? Math.round((postulations.filter(p => p.estado === 'Aceptado').length / postulations.length) * 100) : 0}%
              </p>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <p className="text-sm text-gray-600">Total Weight</p>
              <p className="text-3xl font-bold text-orange-600">
                {postulations.reduce((sum, p) => sum + p.postulationWeight, 0)}
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Available Jobs</h2>
            {offers.length === 0 ? (
              <div className="bg-white rounded-lg shadow p-8 text-center text-gray-600">
                No jobs available
              </div>
            ) : (
              <div className="space-y-4">
                {offers.map(offer => (
                  <div key={offer.id} className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">{offer.title}</h3>
                        <p className="text-gray-600">{offer.company}</p>
                      </div>
                      <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-3 py-1 rounded">
                        {offer.level}
                      </span>
                    </div>
                    <p className="text-gray-700 text-sm mb-3">{offer.description}</p>
                    <div className="flex gap-4 mb-4 text-sm text-gray-600">
                      {offer.location && <span>📍 {offer.location}</span>}
                      {offer.salaryMin && <span>💰 CLP ${offer.salaryMin.toLocaleString()}</span>}
                    </div>
                    <button
                      onClick={() => handlePostulate(offer.id)}
                      disabled={isPosted(offer.id) || posting}
                      className={`w-full py-2 px-4 rounded font-semibold transition ${
                        isPosted(offer.id)
                          ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
                          : 'bg-blue-600 hover:bg-blue-700 text-white'
                      }`}
                    >
                      {isPosted(offer.id) ? '✓ Applied' : 'Apply Now'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">My Applications</h2>
            {postulations.length === 0 ? (
              <div className="bg-white rounded-lg shadow p-8 text-center text-gray-600 text-sm">
                No applications yet
              </div>
            ) : (
              <div className="space-y-3">
                {postulations.map(post => (
                  <div key={post.id} className="bg-white rounded-lg shadow p-4">
                    <h4 className="font-semibold text-gray-900 text-sm">{post.title}</h4>
                    <p className="text-xs text-gray-600">{post.company}</p>
                    <div className="mt-2 flex gap-2 text-xs">
                      <span className={`px-2 py-1 rounded ${
                        post.estado === 'Aceptado' ? 'bg-green-100 text-green-700' :
                        post.estado === 'Rechazado' ? 'bg-red-100 text-red-700' :
                        'bg-yellow-100 text-yellow-700'
                      }`}>
                        {post.estado}
                      </span>
                      <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded">
                        Wt: {post.postulationWeight}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
