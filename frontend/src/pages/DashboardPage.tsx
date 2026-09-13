import { useEffect, useState } from 'react';
import { useAuth } from '../hooks';
import { api } from '../services/api';
import { Layout } from '../components/Layout';
import { Offer, Postulation } from '../types';

export function DashboardPage() {
  const { user } = useAuth();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [postulations, setPostulations] = useState<Postulation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [offersRes, postulationsRes] = await Promise.all([
        api.getOffers(),
        api.getPostulations(),
      ]);
      setOffers(offersRes);
      setPostulations(postulationsRes);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Layout title="Dashboard">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Dashboard">
      <div className="space-y-8">
        {/* Welcome Card */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg shadow-lg p-8 text-white">
          <h1 className="text-3xl font-bold mb-2">Welcome, {user?.email}!</h1>
          <p className="text-blue-100">Start by uploading your CV or exploring job opportunities</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatCard label="Total Postulations" value={postulations.length} color="blue" />
          <StatCard label="Interview Rate" value={`${Math.round((postulations.filter(p => p.estado === 'Entrevista').length / Math.max(postulations.length, 1)) * 100)}%`} color="green" />
          <StatCard label="Offers Received" value={postulations.filter(p => p.estado === 'Oferta').length} color="purple" />
        </div>

        {/* Quick Actions */}
        <div>
          <h2 className="text-xl font-bold mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <QuickActionCard href="/cv-upload" title="Upload CV" description="Analyze your CV" />
            <QuickActionCard href="/cv-management" title="View Profile" description="See your analysis" />
            <QuickActionCard href="/offers" title="Find Offers" description="Discover opportunities" />
          </div>
        </div>

        {/* Recent Postulations */}
        <div>
          <h2 className="text-xl font-bold mb-4">Recent Applications</h2>
          {postulations.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-8 text-center text-gray-600">
              No applications yet. Start by exploring offers!
            </div>
          ) : (
            <div className="space-y-3">
              {postulations.slice(0, 5).map(p => (
                <div key={p.id} className="bg-white rounded-lg shadow p-4 flex justify-between items-center">
                  <div>
                    <h3 className="font-semibold text-gray-900">Postulation {p.offerId}</h3>
                    <p className="text-sm text-gray-600">Created {new Date(p.createdAt).toLocaleDateString()}</p>
                  </div>
                  <StatusBadge estado={p.estado} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  const colorClass = {
    blue: 'from-blue-50 to-blue-100 text-blue-600',
    green: 'from-green-50 to-green-100 text-green-600',
    purple: 'from-purple-50 to-purple-100 text-purple-600',
  }[color];

  return (
    <div className={`bg-gradient-to-br ${colorClass} rounded-lg shadow p-6`}>
      <p className="text-sm font-medium opacity-75">{label}</p>
      <p className="text-3xl font-bold mt-2">{value}</p>
    </div>
  );
}

function QuickActionCard({ href, title, description }: { href: string; title: string; description: string }) {
  return (
    <a href={href} className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition hover:bg-blue-50">
      <h3 className="font-bold text-gray-900 mb-1">{title}</h3>
      <p className="text-sm text-gray-600">{description}</p>
      <p className="text-blue-600 font-semibold text-sm mt-3">→ Go</p>
    </a>
  );
}

function StatusBadge({ estado }: { estado: string }) {
  const colors = {
    'Por revisar': 'bg-yellow-100 text-yellow-800',
    'Preparar': 'bg-blue-100 text-blue-800',
    'Aplicado': 'bg-gray-100 text-gray-800',
    'Entrevista': 'bg-purple-100 text-purple-800',
    'Oferta': 'bg-green-100 text-green-800',
  };

  return (
    <span className={`px-3 py-1 rounded-full text-sm font-semibold ${colors[estado as keyof typeof colors] || 'bg-gray-100'}`}>
      {estado}
    </span>
  );
}
