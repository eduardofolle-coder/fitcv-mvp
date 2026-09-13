import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Layout } from '../components/Layout';
import { CandidateProfile } from '../types';

export function CVManagementPage() {
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadCVProfile();
  }, []);

  const loadCVProfile = async () => {
    try {
      const [profileRes, statsRes] = await Promise.all([
        api.getCVProfile(),
        api.getCVStats(),
      ]);
      setProfile(profileRes);
      setStats(statsRes);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load CV profile');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Layout title="CV Management">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading your profile...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout title="CV Management">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <p className="text-red-700 mb-4">{error}</p>
          <a href="/cv-management" className="text-blue-600 hover:underline">
            Upload a CV to get started
          </a>
        </div>
      </Layout>
    );
  }

  if (!profile) {
    return (
      <Layout title="CV Management">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <p className="text-blue-700 mb-4">No CV profile found. Upload your CV to analyze it.</p>
          <a
            href="/cv-upload"
            className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg"
          >
            Upload CV
          </a>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="CV Management">
      <div className="space-y-8">
        {/* Profile Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg shadow-lg p-8 text-white">
          <h1 className="text-3xl font-bold mb-2">{profile.fullName || 'Your Profile'}</h1>
          <p className="text-blue-100 mb-4">{profile.yearsExperience || 0} years of experience</p>
          <div className="flex gap-4 flex-wrap">
            <Button variant="light">📧 Update CV</Button>
            <Button variant="light">🔄 Re-analyze</Button>
          </div>
        </div>

        {/* Quality Metrics */}
        {stats && (
          <div>
            <h2 className="text-2xl font-bold mb-4">Profile Quality</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <MetricCard
                label="Clarity"
                value={stats.clarity || 0}
                max={100}
                color="blue"
              />
              <MetricCard
                label="Completeness"
                value={stats.completeness || 0}
                max={100}
                color="green"
              />
              <MetricCard
                label="Impact"
                value={stats.impact || 0}
                max={100}
                color="purple"
              />
              <MetricCard
                label="Overall"
                value={stats.overall || 0}
                max={100}
                color="orange"
              />
            </div>
          </div>
        )}

        {/* Skills Section */}
        {profile.skills && profile.skills.length > 0 && (
          <div>
            <h2 className="text-2xl font-bold mb-4">Skills ({profile.skills.length})</h2>
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex flex-wrap gap-2">
                {profile.skills.map((skill, idx) => (
                  <span
                    key={idx}
                    className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Experience Section */}
        {profile.experience && profile.experience.length > 0 && (
          <div>
            <h2 className="text-2xl font-bold mb-4">Experience ({profile.experience.length})</h2>
            <div className="space-y-4">
              {profile.experience.map((exp, idx) => (
                <div key={idx} className="bg-white rounded-lg shadow p-6 border-l-4 border-blue-600">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">{exp.title}</h3>
                      <p className="text-gray-600">{exp.company}</p>
                    </div>
                    <span className="text-sm text-gray-500">
                      {exp.startDate} - {exp.endDate || 'Present'}
                    </span>
                  </div>

                  {exp.responsibilities && exp.responsibilities.length > 0 && (
                    <div className="mt-3">
                      <p className="text-sm font-medium text-gray-700 mb-2">Responsibilities:</p>
                      <ul className="text-sm text-gray-600 space-y-1 ml-4">
                        {exp.responsibilities.map((resp, i) => (
                          <li key={i}>• {resp}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {exp.achievements && exp.achievements.length > 0 && (
                    <div className="mt-3">
                      <p className="text-sm font-medium text-gray-700 mb-2">Achievements:</p>
                      <ul className="text-sm text-gray-600 space-y-1 ml-4">
                        {exp.achievements.map((ach, i) => (
                          <li key={i}>✓ {ach}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Education Section */}
        {profile.education && profile.education.length > 0 && (
          <div>
            <h2 className="text-2xl font-bold mb-4">Education</h2>
            <div className="space-y-3">
              {profile.education.map((edu, idx) => (
                <div key={idx} className="bg-white rounded-lg shadow p-4 border-l-4 border-green-600">
                  <h3 className="font-semibold text-gray-900">{edu.degree}</h3>
                  <p className="text-gray-600">{edu.field}</p>
                  <p className="text-sm text-gray-500">{edu.institution} • {edu.graduationYear}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Summary Section */}
        {profile.summary && (
          <div>
            <h2 className="text-2xl font-bold mb-4">Professional Summary</h2>
            <div className="bg-white rounded-lg shadow p-6">
              <p className="text-gray-700 leading-relaxed">{profile.summary}</p>
            </div>
          </div>
        )}

        {/* Recommendations */}
        {stats?.recommendations && (
          <div>
            <h2 className="text-2xl font-bold mb-4">Recommendations</h2>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
              <ul className="space-y-3">
                {stats.recommendations.map((rec: string, idx: number) => (
                  <li key={idx} className="flex items-start gap-3">
                    <span className="text-blue-600 font-bold text-lg">→</span>
                    <span className="text-gray-700">{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-4 justify-center">
          <Button variant="primary">📋 Apply to Jobs</Button>
          <Button variant="secondary">🔄 Update CV</Button>
          <Button variant="secondary">⬇️ Download</Button>
        </div>
      </div>
    </Layout>
  );
}

function MetricCard({
  label,
  value,
  max = 100,
  color
}: {
  label: string;
  value: number;
  max?: number;
  color: string;
}) {
  const percentage = Math.round((value / max) * 100);
  const colorClass = {
    blue: 'bg-blue-600',
    green: 'bg-green-600',
    purple: 'bg-purple-600',
    orange: 'bg-orange-600',
  }[color];

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <p className="text-sm text-gray-600 mb-3">{label}</p>
      <div className="mb-3">
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full ${colorClass} transition-all duration-300`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}

function Button({
  variant = 'primary',
  children
}: {
  variant?: 'primary' | 'secondary' | 'light';
  children: React.ReactNode;
}) {
  const variants = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white',
    secondary: 'bg-gray-200 hover:bg-gray-300 text-gray-900',
    light: 'bg-white/20 hover:bg-white/30 text-white',
  };

  return (
    <button className={`px-6 py-2 rounded-lg font-semibold transition ${variants[variant]}`}>
      {children}
    </button>
  );
}
