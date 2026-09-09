import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAPI } from '../hooks';

interface Role {
  id: string;
  title: string;
  level: string;
  matchScore: number;
  description: string;
  isSelected?: boolean;
}

export function UploadCVPage() {
  const navigate = useNavigate();
  const api = useAPI();
  const [cvContent, setCvContent] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'upload' | 'roles'>('upload');
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [error, setError] = useState('');

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await api.post('/cv/upload', {
        cvContent,
        fullName: fullName || 'User'
      });

      const rolesRes = await api.post('/cv/suggest-roles', {});
      setRoles(rolesRes.data.data || []);
      setStep('roles');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to upload CV');
    } finally {
      setLoading(false);
    }
  };

  const toggleRole = (roleId: string) => {
    setSelectedRoles(prev =>
      prev.includes(roleId)
        ? prev.filter(id => id !== roleId)
        : [...prev, roleId]
    );
  };

  const handleConfirmRoles = async () => {
    if (selectedRoles.length === 0) {
      setError('Select at least one role');
      return;
    }

    setLoading(true);
    try {
      await api.post('/cv/select-roles', {
        roleIds: selectedRoles
      });
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save roles');
    } finally {
      setLoading(false);
    }
  };

  if (step === 'roles') {
    return (
      <div className="min-h-screen bg-gray-50 py-12 px-4">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">Select Your Roles</h1>

          {error && (
            <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
              {error}
            </div>
          )}

          <div className="space-y-4">
            {roles.map(role => (
              <div
                key={role.id}
                className="border-2 rounded-lg p-4 cursor-pointer transition"
                style={{
                  borderColor: selectedRoles.includes(role.id) ? '#3b82f6' : '#e5e7eb',
                  backgroundColor: selectedRoles.includes(role.id) ? '#eff6ff' : 'white'
                }}
                onClick={() => toggleRole(role.id)}
              >
                <div className="flex items-start">
                  <input
                    type="checkbox"
                    checked={selectedRoles.includes(role.id)}
                    onChange={() => toggleRole(role.id)}
                    className="mt-1 w-4 h-4"
                  />
                  <div className="ml-4 flex-1">
                    <h3 className="font-semibold text-gray-900">{role.title}</h3>
                    <p className="text-sm text-gray-600">{role.description}</p>
                    <div className="mt-2 flex gap-4">
                      <span className="text-xs bg-gray-100 px-2 py-1 rounded">{role.level}</span>
                      <span className="text-xs text-blue-600">Match: {role.matchScore}%</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={handleConfirmRoles}
            disabled={loading}
            className="mt-8 w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-3 rounded-lg transition"
          >
            {loading ? 'Saving...' : 'Continue to Dashboard'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Upload Your CV</h1>
        <p className="text-gray-600 mb-8">Paste your CV content to get started</p>

        {error && (
          <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        )}

        <form onSubmit={handleUpload} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Full Name (Optional)
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your full name"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              CV Content
            </label>
            <textarea
              value={cvContent}
              onChange={(e) => setCvContent(e.target.value)}
              placeholder="Paste your CV content here..."
              rows={12}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
              required
            />
            <p className="text-xs text-gray-500 mt-2">
              Minimum 50 characters required
            </p>
          </div>

          <button
            type="submit"
            disabled={loading || cvContent.length < 50}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-3 rounded-lg transition"
          >
            {loading ? 'Analyzing CV...' : 'Upload & Analyze'}
          </button>
        </form>
      </div>
    </div>
  );
}
