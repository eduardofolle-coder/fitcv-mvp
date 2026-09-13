import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { Layout } from '../components/Layout';

export function UploadCVPage() {
  const navigate = useNavigate();
  const [cvContent, setCvContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'upload' | 'processing'>('upload');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    setStep('processing');
    setProgress(20);

    try {
      // Step 1: Upload CV
      setProgress(30);
      await api.uploadCV(cvContent);

      // Step 2: Analyze profile (agent processing)
      setProgress(60);
      const profile = await api.getCVProfile();

      // Step 3: Get stats
      setProgress(85);
      await api.getCVStats();

      setProgress(100);
      setTimeout(() => {
        navigate('/cv-management');
      }, 1000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to upload CV');
      setStep('upload');
      setProgress(0);
    } finally {
      setLoading(false);
    }
  };

  if (step === 'processing') {
    return (
      <Layout title="CV Upload">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-lg shadow-lg p-12 text-center">
            <div className="mb-8">
              <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto"></div>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Analyzing Your CV</h2>
            <p className="text-gray-600 mb-8">Our AI agent is extracting your skills, experience, and education...</p>

            {/* Progress Steps */}
            <div className="space-y-4 mb-8">
              <ProgressStep title="Uploading CV" completed={progress >= 30} />
              <ProgressStep title="Extracting Profile" completed={progress >= 60} />
              <ProgressStep title="Analyzing Metrics" completed={progress >= 85} />
              <ProgressStep title="Complete" completed={progress >= 100} />
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-sm text-gray-600">{progress}% complete</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="CV Upload">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Upload Your CV</h2>
          <p className="text-gray-600 mb-6">Paste your CV content to analyze your professional profile</p>

          {error && (
            <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
              <p className="font-semibold">Error: {error}</p>
              <p className="text-sm mt-1">Please check your CV format and try again</p>
            </div>
          )}

          <form onSubmit={handleUpload} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                CV Content *
              </label>
              <textarea
                value={cvContent}
                onChange={(e) => setCvContent(e.target.value)}
                placeholder="Paste your CV content here - plain text, markdown, or formatted text...

Example format:
John Doe
john@example.com | +1-555-1234

EXPERIENCE:
Senior Software Engineer | TechCorp (2020-2024)
- Led team of 5 engineers
- Improved performance by 40%

SKILLS: Python, JavaScript, React, AWS

EDUCATION: BS Computer Science, University XYZ (2018)"
                rows={16}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm resize-none"
              />
              <div className="flex justify-between items-center mt-2">
                <p className="text-xs text-gray-500">
                  Minimum 100 characters required
                </p>
                <p className="text-xs font-semibold text-gray-600">
                  {cvContent.length} / 100
                </p>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || cvContent.length < 100}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-3 rounded-lg transition flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Uploading...
                </>
              ) : (
                <>✓ Upload & Analyze</>
              )}
            </button>
          </form>

          {/* Info Box */}
          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-6 bg-blue-50 rounded-lg">
              <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                🤖 AI Powered Analysis
              </h3>
              <ul className="space-y-2 text-sm text-gray-700">
                <li>✓ Profile extraction</li>
                <li>✓ Skill identification</li>
                <li>✓ Experience summary</li>
                <li>✓ Quality scoring</li>
              </ul>
            </div>

            <div className="p-6 bg-green-50 rounded-lg">
              <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                📊 What You Get
              </h3>
              <ul className="space-y-2 text-sm text-gray-700">
                <li>✓ Profile metrics</li>
                <li>✓ Skill highlights</li>
                <li>✓ Career gaps</li>
                <li>✓ Recommendations</li>
              </ul>
            </div>
          </div>

          {/* Format Tips */}
          <div className="mt-8 p-6 bg-yellow-50 border border-yellow-200 rounded-lg">
            <h3 className="font-semibold text-gray-900 mb-3">💡 Tips for Best Results</h3>
            <ul className="space-y-2 text-sm text-gray-700">
              <li>• Use clear section headers (EXPERIENCE, SKILLS, EDUCATION)</li>
              <li>• Include quantifiable achievements (e.g., "improved by 40%")</li>
              <li>• List all relevant technical skills</li>
              <li>• Include dates in ISO format (YYYY-MM-DD)</li>
            </ul>
          </div>
        </div>
      </div>
    </Layout>
  );
}

function ProgressStep({ title, completed }: { title: string; completed: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm transition ${
          completed
            ? 'bg-green-600 text-white'
            : 'bg-gray-300 text-gray-600'
        }`}
      >
        {completed ? '✓' : '○'}
      </div>
      <span className={`font-medium ${completed ? 'text-green-600' : 'text-gray-600'}`}>
        {title}
      </span>
    </div>
  );
}
