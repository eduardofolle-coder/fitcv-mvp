'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import { useRouter } from 'next/navigation';

interface Postulation {
  id: string;
  jobTitle: string;
  company: string;
  status: 'applied' | 'interview' | 'offer' | 'rejected';
  appliedAt: string;
  notes?: string;
}

export default function PostulationsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [postulations, setPostulations] = useState<Postulation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'applied' | 'interview' | 'offer' | 'rejected'>('all');

  if (authLoading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (!user) {
    router.push('/login');
    return null;
  }

  useEffect(() => {
    // Mock data for demo
    setPostulations([
      {
        id: '1',
        jobTitle: 'Senior Engineer',
        company: 'Google',
        status: 'interview',
        appliedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        notes: 'First round scheduled',
      },
      {
        id: '2',
        jobTitle: 'Tech Lead',
        company: 'Amazon',
        status: 'offer',
        appliedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
        notes: 'Offer received - negotiating',
      },
      {
        id: '3',
        jobTitle: 'Backend Engineer',
        company: 'Microsoft',
        status: 'rejected',
        appliedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
        notes: 'Not enough .NET experience',
      },
      {
        id: '4',
        jobTitle: 'Product Manager',
        company: 'Stripe',
        status: 'applied',
        appliedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        notes: 'Awaiting response',
      },
    ]);
    setLoading(false);
  }, []);

  const filteredPostulations = postulations.filter(
    (p) => filter === 'all' || p.status === filter
  );

  const statusColors = {
    applied: 'bg-blue-100 text-blue-800',
    interview: 'bg-yellow-100 text-yellow-800',
    offer: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
  };

  const statusLabels = {
    applied: 'Applied',
    interview: 'Interview',
    offer: 'Offer',
    rejected: 'Rejected',
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
          {(['all', 'applied', 'interview', 'offer', 'rejected'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition ${
                filter === status
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
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
            <p className="text-sm text-gray-600">Interviews</p>
            <p className="text-3xl font-bold text-yellow-600">
              {postulations.filter((p) => p.status === 'interview').length}
            </p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-600">Offers</p>
            <p className="text-3xl font-bold text-green-600">
              {postulations.filter((p) => p.status === 'offer').length}
            </p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-600">Success Rate</p>
            <p className="text-3xl font-bold text-blue-600">
              {Math.round(
                ((postulations.filter((p) => p.status !== 'rejected').length /
                  postulations.length) *
                  100) as any
              )}
              %
            </p>
          </div>
        </div>

        {/* Postulations List */}
        {loading ? (
          <div className="text-center py-12">Loading...</div>
        ) : filteredPostulations.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg shadow">
            <p className="text-gray-500">No postulations found</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredPostulations.map((post) => (
              <div key={post.id} className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">{post.jobTitle}</h3>
                      <span
                        className={`px-3 py-1 rounded-full text-sm font-medium ${
                          statusColors[post.status]
                        }`}
                      >
                        {statusLabels[post.status]}
                      </span>
                    </div>
                    <p className="text-gray-600 mb-3">{post.company}</p>
                    {post.notes && (
                      <p className="text-sm text-gray-600 mb-2">
                        <strong>Notes:</strong> {post.notes}
                      </p>
                    )}
                    <p className="text-xs text-gray-500">
                      Applied {new Date(post.appliedAt).toLocaleDateString()}
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
