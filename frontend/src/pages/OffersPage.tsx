import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Layout } from '../components/Layout';
import { Offer, OfferRanking } from '../types';

export function OffersPage() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [rankings, setRankings] = useState<OfferRanking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterLevel, setFilterLevel] = useState<string>('');
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState<OfferRanking | null>(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    loadOffers();
  }, []);

  const loadOffers = async () => {
    try {
      const [offersRes, rankingsRes] = await Promise.all([
        api.getOffers(),
        api.getRankedOffers(),
      ]);

      setOffers(offersRes);
      setRankings(rankingsRes);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load offers');
    } finally {
      setLoading(false);
    }
  };

  const filteredRankings = filterLevel
    ? rankings.filter(r => r.offer?.level === filterLevel)
    : rankings;

  const levels = ['Junior', 'Mid', 'Senior', 'Lead', 'Principal'];

  const handleApply = async (offerRanking: OfferRanking) => {
    if (!offerRanking.offer) return;
    setApplying(true);

    try {
      // Create postulation
      await api.createPostulation(offerRanking.offerId);

      // Show success
      alert(`✓ Application created for ${offerRanking.offer.title} at ${offerRanking.offer.company}`);

      // Close modal
      setShowDetailModal(false);
      setSelectedOffer(null);

      // Refresh
      loadOffers();
    } catch (err: any) {
      alert('Failed to apply: ' + (err.response?.data?.error || 'Unknown error'));
    } finally {
      setApplying(false);
    }
  };

  if (loading) {
    return (
      <Layout title="Discover Offers">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Ranking offers for you...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Discover Offers">
      <div className="space-y-8">
        {/* Intro Card */}
        <div className="bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg shadow-lg p-8 text-white">
          <h1 className="text-3xl font-bold mb-2">Find Your Next Opportunity</h1>
          <p className="text-purple-100 mb-4">
            Browse and apply to ranked job offers tailored to your skills and preferences
          </p>
          <p className="text-sm text-purple-200">
            💡 Offers are ranked by our AI based on skills match (30%), career growth (25%),
            compensation (20%), location (15%), and company stability (10%)
          </p>
        </div>

        {/* Filters */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Filter by Level</h2>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setFilterLevel('')}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                filterLevel === ''
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-900 hover:bg-gray-300'
              }`}
            >
              All ({filteredRankings.length})
            </button>
            {levels.map(level => {
              const count = rankings.filter(r => r.offer?.level === level).length;
              return (
                <button
                  key={level}
                  onClick={() => setFilterLevel(level)}
                  className={`px-4 py-2 rounded-lg font-medium transition ${
                    filterLevel === level
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-900 hover:bg-gray-300'
                  }`}
                >
                  {level} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {/* Offers List */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Top Opportunities {filterLevel ? `- ${filterLevel}` : ''}
          </h2>

          {error && (
            <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
              {error}
            </div>
          )}

          {filteredRankings.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <p className="text-gray-600 text-lg mb-4">
                No offers available {filterLevel ? `for ${filterLevel} level` : ''}
              </p>
              <button
                onClick={() => setFilterLevel('')}
                className="text-blue-600 hover:underline font-medium"
              >
                View all offers
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredRankings.map((ranking, idx) => (
                <OfferRankingCard
                  key={ranking.offerId}
                  ranking={ranking}
                  rank={idx + 1}
                  onViewDetails={() => {
                    setSelectedOffer(ranking);
                    setShowDetailModal(true);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detail Modal */}
      {showDetailModal && selectedOffer && (
        <OfferDetailModal
          ranking={selectedOffer}
          onClose={() => {
            setShowDetailModal(false);
            setSelectedOffer(null);
          }}
          onApply={handleApply}
          applying={applying}
        />
      )}
    </Layout>
  );
}

function OfferRankingCard({
  ranking,
  rank,
  onViewDetails,
}: {
  ranking: OfferRanking;
  rank: number;
  onViewDetails: () => void;
}) {
  if (!ranking.offer) return null;

  const offer = ranking.offer;
  const scoreColor =
    ranking.overallScore >= 80
      ? 'text-green-600 bg-green-50'
      : ranking.overallScore >= 60
      ? 'text-yellow-600 bg-yellow-50'
      : 'text-red-600 bg-red-50';

  return (
    <div className="bg-white rounded-lg shadow hover:shadow-lg transition p-6 border-l-4 border-blue-600">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Left: Job Info */}
        <div className="md:col-span-2">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h3 className="text-lg font-bold text-gray-900">
                #{rank} · {offer.title}
              </h3>
              <p className="text-gray-600">{offer.company}</p>
            </div>
            <span className="bg-blue-100 text-blue-800 text-xs font-bold px-3 py-1 rounded">
              {offer.level}
            </span>
          </div>

          <p className="text-gray-600 text-sm mb-3 line-clamp-2">{offer.description}</p>

          <div className="flex flex-wrap gap-3 text-sm text-gray-600">
            {offer.location && <span>📍 {offer.location}</span>}
            {offer.salary && (
              <span>
                💰 CLP ${offer.salary.min.toLocaleString()} - ${offer.salary.max.toLocaleString()}
              </span>
            )}
          </div>
        </div>

        {/* Right: Score & Actions */}
        <div className="md:col-span-2 flex flex-col gap-4">
          {/* Overall Score */}
          <div className={`rounded-lg p-4 ${scoreColor}`}>
            <p className="text-sm font-medium opacity-75 mb-1">Your Fit Score</p>
            <p className="text-4xl font-bold">{ranking.overallScore}%</p>
          </div>

          {/* Score Breakdown */}
          <div className="space-y-2">
            <ScoreBar label="Skills" score={ranking.scores.skillsFit} />
            <ScoreBar label="Growth" score={ranking.scores.careerGrowth} />
            <ScoreBar label="Pay" score={ranking.scores.compensation} />
            <ScoreBar label="Location" score={ranking.scores.locationLifestyle} />
            <ScoreBar label="Stability" score={ranking.scores.companyStability} />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <button
              onClick={onViewDetails}
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-900 font-semibold py-2 rounded-lg transition"
            >
              ℹ️ Details
            </button>
            <button
              onClick={() => onViewDetails()}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg transition"
            >
              → Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScoreBar({ label, score }: { label: string; score: number }) {
  const color = score >= 80 ? 'bg-green-600' : score >= 60 ? 'bg-yellow-600' : 'bg-red-600';

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium text-gray-600 w-12">{label}</span>
      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full ${color} transition-all duration-300`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-semibold text-gray-700 w-8 text-right">{score}%</span>
    </div>
  );
}

function OfferDetailModal({
  ranking,
  onClose,
  onApply,
  applying,
}: {
  ranking: OfferRanking;
  onClose: () => void;
  onApply: (ranking: OfferRanking) => void;
  applying: boolean;
}) {
  if (!ranking.offer) return null;

  const offer = ranking.offer;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full my-8">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white p-8">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h2 className="text-3xl font-bold mb-2">{offer.title}</h2>
              <p className="text-purple-100 text-lg">{offer.company}</p>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:bg-white/20 w-10 h-10 rounded-full flex items-center justify-center transition"
            >
              ✕
            </button>
          </div>

          {/* Quick Info */}
          <div className="flex flex-wrap gap-4">
            <InfoBadge label="Level" value={offer.level} />
            {offer.location && <InfoBadge label="Location" value={offer.location} />}
            {offer.salary && (
              <InfoBadge
                label="Salary"
                value={`CLP $${offer.salary.min.toLocaleString()}`}
              />
            )}
          </div>
        </div>

        {/* Content */}
        <div className="p-8 space-y-8 max-h-96 overflow-y-auto">
          {/* Match Score */}
          <div>
            <h3 className="text-xl font-bold text-gray-900 mb-4">Your Fit Score: {ranking.overallScore}%</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <ScoreCard label="Skills" score={ranking.scores.skillsFit} />
              <ScoreCard label="Growth" score={ranking.scores.careerGrowth} />
              <ScoreCard label="Compensation" score={ranking.scores.compensation} />
              <ScoreCard label="Location" score={ranking.scores.locationLifestyle} />
              <ScoreCard label="Stability" score={ranking.scores.companyStability} />
            </div>
          </div>

          {/* Description */}
          <div>
            <h3 className="text-xl font-bold text-gray-900 mb-3">About This Role</h3>
            <p className="text-gray-700 leading-relaxed">{offer.description}</p>
          </div>

          {/* Requirements */}
          {offer.requirements && offer.requirements.length > 0 && (
            <div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Requirements</h3>
              <ul className="space-y-2">
                {offer.requirements.map((req, idx) => (
                  <li key={idx} className="flex gap-3 text-gray-700">
                    <span className="text-blue-600 font-bold">✓</span>
                    <span>{req}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Why This Fit */}
          <div>
            <h3 className="text-xl font-bold text-gray-900 mb-3">Why This Fits You</h3>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-gray-700">{ranking.verdict}</p>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="border-t p-8 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-900 font-semibold py-3 rounded-lg transition"
          >
            Close
          </button>
          <button
            onClick={() => onApply(ranking)}
            disabled={applying}
            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-3 rounded-lg transition flex items-center justify-center gap-2"
          >
            {applying ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Applying...
              </>
            ) : (
              '→ Apply Now'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function InfoBadge({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white/20 px-3 py-1 rounded">
      <p className="text-xs text-purple-200">{label}</p>
      <p className="text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function ScoreCard({ label, score }: { label: string; score: number }) {
  const color = score >= 80 ? 'text-green-600 bg-green-50' : score >= 60 ? 'text-yellow-600 bg-yellow-50' : 'text-red-600 bg-red-50';

  return (
    <div className={`rounded-lg p-3 text-center ${color}`}>
      <p className="text-xs text-gray-600 mb-1">{label}</p>
      <p className="text-2xl font-bold">{score}%</p>
    </div>
  );
}
