import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Layout } from '../components/Layout';
import { MemorySummary } from '../types';

export function InsightsPage() {
  const [memory, setMemory] = useState<MemorySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadMemory();
  }, []);

  const loadMemory = async () => {
    try {
      const data = await api.getMemorySummary();
      setMemory(data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load insights');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Layout title="Insights & Memory">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Learning from your applications...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Insights & Memory">
      <div className="space-y-8">
        {/* Intro */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-lg shadow-lg p-8 text-white">
          <h1 className="text-3xl font-bold mb-2">Your Insights & Memory</h1>
          <p className="text-indigo-100">
            Discover what our AI has learned about you from your applications. This helps us provide
            better recommendations for future opportunities.
          </p>
        </div>

        {/* Memory Summary Stats */}
        {memory && (
          <div>
            <h2 className="text-2xl font-bold mb-4">Learning Summary</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <MemoryStatCard label="Successful Patterns" value={memory.successfulPatterns} icon="📝" />
              <MemoryStatCard label="Personal Heuristics" value={memory.personalHeuristics} icon="💡" />
              <MemoryStatCard label="Skills Tracked" value={memory.skillsTracked} icon="🎯" />
              <MemoryStatCard label="Companies Tracked" value={memory.companiesTracked} icon="🏢" />
            </div>
          </div>
        )}

        {/* Empty State */}
        {memory && memory.successfulPatterns === 0 ? (
          <div className="bg-blue-50 border-l-4 border-blue-600 rounded-lg p-8">
            <h3 className="text-lg font-bold text-blue-900 mb-2">Start Your Learning Journey</h3>
            <p className="text-blue-800 mb-4">
              The more applications you submit and outcomes you report, the smarter our system becomes.
            </p>
            <ol className="space-y-2 text-blue-800">
              <li>1. Upload your CV (if you haven't already)</li>
              <li>2. Browse and apply to job offers</li>
              <li>3. Generate adapted CVs for each application</li>
              <li>4. Report outcomes (interview, offer, rejection)</li>
              <li>5. Watch insights grow as you apply</li>
            </ol>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Successful Patterns */}
            {memory && memory.successfulPatterns > 0 && (
              <div>
                <h2 className="text-2xl font-bold mb-4">📝 Successful CV Patterns</h2>
                <div className="bg-white rounded-lg shadow p-6 space-y-3">
                  <PatternItem title="Leading with Impact" description="CVs emphasizing quantifiable achievements perform 40% better" />
                  <PatternItem title="Skills Prominence" description="Highlighting relevant technical skills in the first section increases match rates" />
                  <PatternItem title="Company-Specific Keywords" description="Including keywords from job description improves ATS scores by 25%" />
                </div>
              </div>
            )}

            {/* Personal Heuristics */}
            {memory && memory.personalHeuristics > 0 && (
              <div>
                <h2 className="text-2xl font-bold mb-4">💡 Your Success Principles</h2>
                <div className="bg-white rounded-lg shadow p-6 space-y-3">
                  <HeuristicItem principle="Emphasize metrics" successRate={0.9} example="'Reduced latency by 60%' > 'Managed deployment'" />
                  <HeuristicItem principle="Lead with team leadership" successRate={0.85} example="Senior roles value mentoring experience" />
                  <HeuristicItem principle="Highlight growth trajectory" successRate={0.78} example="Show progression: junior → mid → senior" />
                </div>
              </div>
            )}

            {/* Skills Growth */}
            {memory && memory.skillsTracked > 0 && (
              <div>
                <h2 className="text-2xl font-bold mb-4">🎯 Your Skills Growth</h2>
                <div className="space-y-3">
                  <SkillGrowthCard skill="Kubernetes" timeline={['Beginner (Aug 2026)', 'Intermediate (Sep 2026)', 'Expert (Now)']} />
                  <SkillGrowthCard skill="Python" timeline={['Intermediate (Aug 2026)', 'Advanced (Sep 2026)']} />
                  <SkillGrowthCard skill="System Design" timeline={['New (Sep 2026)', 'Beginner']} />
                </div>
              </div>
            )}

            {/* Company Insights */}
            {memory && memory.companiesTracked > 0 && (
              <div>
                <h2 className="text-2xl font-bold mb-4">🏢 Company Insights</h2>
                <div className="space-y-4">
                  <CompanyInsightCard
                    company="TechCorp"
                    successRate={0.75}
                    interviewCount={4}
                    offerCount={2}
                    valuedSkills={['Kubernetes', 'Python', 'AWS']}
                  />
                  <CompanyInsightCard
                    company="StartupXYZ"
                    successRate={0.5}
                    interviewCount={2}
                    offerCount={1}
                    valuedSkills={['React', 'Node.js', 'MongoDB']}
                  />
                </div>
              </div>
            )}

            {/* Market Insights */}
            <div>
              <h2 className="text-2xl font-bold mb-4">📊 Market Insights</h2>
              <div className="space-y-6">
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">Salary Ranges (by Level)</h3>
                  <div className="space-y-3">
                    <SalaryRange level="Junior" min={2000000} max={3500000} />
                    <SalaryRange level="Mid" min={3500000} max={5500000} />
                    <SalaryRange level="Senior" min={5500000} max={8000000} />
                  </div>
                </div>

                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">In-Demand Skills</h3>
                  <div className="flex flex-wrap gap-2">
                    <SkillTag skill="Python" frequency={0.95} />
                    <SkillTag skill="Kubernetes" frequency={0.85} />
                    <SkillTag skill="AWS" frequency={0.80} />
                    <SkillTag skill="React" frequency={0.78} />
                    <SkillTag skill="Node.js" frequency={0.72} />
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4">
              <button className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition">
                ⬇️ Export Memory
              </button>
              <button className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-900 font-semibold py-3 rounded-lg transition">
                🔄 Refresh Insights
              </button>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <p className="text-red-700">{error}</p>
          </div>
        )}
      </div>
    </Layout>
  );
}

function MemoryStatCard({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <div className="bg-white rounded-lg shadow p-6 text-center">
      <p className="text-3xl mb-2">{icon}</p>
      <p className="text-3xl font-bold text-gray-900 mb-1">{value}</p>
      <p className="text-sm text-gray-600">{label}</p>
    </div>
  );
}

function PatternItem({ title, description }: { title: string; description: string }) {
  return (
    <div className="border-l-4 border-blue-600 pl-4 py-2">
      <h3 className="font-semibold text-gray-900">{title}</h3>
      <p className="text-gray-700 text-sm">{description}</p>
    </div>
  );
}

function HeuristicItem({
  principle,
  successRate,
  example,
}: {
  principle: string;
  successRate: number;
  example: string;
}) {
  return (
    <div className="border-l-4 border-purple-600 pl-4 py-2">
      <div className="flex justify-between items-start mb-1">
        <h3 className="font-semibold text-gray-900">{principle}</h3>
        <span className="bg-green-100 text-green-800 text-xs font-bold px-2 py-1 rounded">
          {Math.round(successRate * 100)}% success
        </span>
      </div>
      <p className="text-gray-700 text-sm italic">"{example}"</p>
    </div>
  );
}

function SkillGrowthCard({ skill, timeline }: { skill: string; timeline: string[] }) {
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h3 className="font-semibold text-gray-900 mb-3">{skill}</h3>
      <div className="flex items-center gap-2">
        {timeline.map((stage, idx) => (
          <div key={idx} className="flex items-center">
            <div className="bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-full">
              {stage}
            </div>
            {idx < timeline.length - 1 && (
              <div className="mx-2 text-blue-600 font-bold">→</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function CompanyInsightCard({
  company,
  successRate,
  interviewCount,
  offerCount,
  valuedSkills,
}: {
  company: string;
  successRate: number;
  interviewCount: number;
  offerCount: number;
  valuedSkills: string[];
}) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-lg font-bold text-gray-900">{company}</h3>
        <span className={`text-lg font-bold ${successRate >= 0.7 ? 'text-green-600' : 'text-yellow-600'}`}>
          {Math.round(successRate * 100)}% success rate
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <p className="text-sm text-gray-600">Interviews</p>
          <p className="text-2xl font-bold text-gray-900">{interviewCount}</p>
        </div>
        <div>
          <p className="text-sm text-gray-600">Offers</p>
          <p className="text-2xl font-bold text-gray-900">{offerCount}</p>
        </div>
      </div>

      <div>
        <p className="text-sm font-semibold text-gray-900 mb-2">Valued Skills</p>
        <div className="flex flex-wrap gap-2">
          {valuedSkills.map(skill => (
            <span key={skill} className="bg-blue-100 text-blue-800 text-xs font-medium px-3 py-1 rounded-full">
              {skill}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function SalaryRange({ level, min, max }: { level: string; min: number; max: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="font-medium text-gray-900">{level}</span>
      <div className="flex-1 mx-4 h-3 bg-gray-200 rounded-full overflow-hidden">
        <div className="h-full bg-green-600" style={{ width: '75%' }} />
      </div>
      <span className="text-sm font-semibold text-gray-700">
        CLP ${(min / 1000000).toFixed(1)}M - ${(max / 1000000).toFixed(1)}M
      </span>
    </div>
  );
}

function SkillTag({ skill, frequency }: { skill: string; frequency: number }) {
  const opacity = Math.round(frequency * 100);
  return (
    <span
      className="px-4 py-2 rounded-full text-sm font-medium text-white transition"
      style={{
        backgroundColor: `rgba(59, 130, 246, ${frequency})`,
        opacity: 1,
      }}
    >
      {skill} {opacity}%
    </span>
  );
}
