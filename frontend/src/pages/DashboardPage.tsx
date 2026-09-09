import { useEffect, useState } from 'react';
import { useAuth, useAPI, useFetch } from '../hooks';
import { usePostulationsStore } from '../store/postulationsStore';

interface Offer {
  id: string;
  title: string;
  company: string;
  level: string;
  salary: { min: number; max: number; currency: string };
  location: string;
}

interface Postulation {
  id: string;
  offerId: string;
  status: string;
  priority: string;
  createdAt: string;
}

export function DashboardPage() {
  const { user, logout } = useAuth();
  const api = useAPI();
  const postulations = usePostulationsStore(s => s.postulations);
  const setPostulations = usePostulationsStore(s => s.setPostulations);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [stats, setStats] = useState({
    totalOffers: 0,
    userPostulations: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [offersRes, statsRes, postulationsRes] = await Promise.all([
          api.get('/offers?limit=10'),
          api.get('/offers/stats/summary'),
          api.get('/postulations')
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

    loadData();
  }, [api, setPostulations]);

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
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">FITCV Dashboard</h1>
            <p className="text-sm text-gray-600">Welcome back, {user?.email}</p>
          </div>
          <button
            onClick={logout}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm text-gray-600">Total Job Offers</p>
            <p className="text-3xl font-bold text-gray-900">{stats.totalOffers || 0}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm text-gray-600">My Postulations</p>
            <p className="text-3xl font-bold text-gray-900">{postulations.length}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm text-gray-600">Success Rate</p>
            <p className="text-3xl font-bold text-gray-900">-</p>
          </div>
        </div>

        {/* Recent Offers */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Recent Job Offers</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Title</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Company</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Level</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Salary</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {offers.map(offer => (
                  <tr key={offer.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-900">{offer.title}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{offer.company}</td>
                    <td className="px-6 py-4 text-sm">
                      <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium">
                        {offer.level}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      ${offer.salary.min.toLocaleString()} - ${offer.salary.max.toLocaleString()} {offer.salary.currency}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <button className="text-blue-600 hover:underline">View</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
