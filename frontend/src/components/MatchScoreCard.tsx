import { MatchResult } from '../types';

interface MatchScoreCardProps {
  match: MatchResult;
  title?: string;
  compact?: boolean;
}

export function MatchScoreCard({ match, title = 'Match Analysis', compact = false }: MatchScoreCardProps) {
  const getColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getBgColor = (score: number) => {
    if (score >= 80) return 'bg-green-50 border-green-200';
    if (score >= 60) return 'bg-yellow-50 border-yellow-200';
    return 'bg-red-50 border-red-200';
  };

  if (compact) {
    return (
      <div className={`border rounded-lg p-4 ${getBgColor(match.overallMatch)}`}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Overall Match</h3>
          <span className={`text-3xl font-bold ${getColor(match.overallMatch)}`}>
            {match.overallMatch}%
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={`border rounded-lg p-6 ${getBgColor(match.overallMatch)}`}>
      <h3 className="text-xl font-semibold text-gray-900 mb-6">{title}</h3>

      {/* Overall Score */}
      <div className="mb-8">
        <div className="flex items-end justify-between mb-2">
          <p className="text-lg font-semibold text-gray-900">Overall Match</p>
          <p className={`text-4xl font-bold ${getColor(match.overallMatch)}`}>
            {match.overallMatch}%
          </p>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${
              match.overallMatch >= 80
                ? 'bg-green-600'
                : match.overallMatch >= 60
                ? 'bg-yellow-600'
                : 'bg-red-600'
            }`}
            style={{ width: `${match.overallMatch}%` }}
          />
        </div>
      </div>

      {/* Component Scores */}
      <div className="space-y-4 mb-6">
        <ScoreBar label="Skills Match" score={match.skillsMatch} />
        <ScoreBar label="Experience Match" score={match.experienceMatch} />
        <ScoreBar label="Education Match" score={match.educationMatch} />
      </div>

      {/* Gaps */}
      {match.gaps && match.gaps.length > 0 && (
        <div className="mb-6">
          <h4 className="font-semibold text-gray-900 mb-3">Identified Gaps</h4>
          <ul className="space-y-2">
            {match.gaps.map((gap, idx) => (
              <li key={idx} className="flex gap-3 text-sm">
                <span className="text-yellow-600 font-bold">⚠</span>
                <div>
                  <p className="font-medium text-gray-900">{gap.title}</p>
                  <p className="text-gray-700">{gap.description}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recommendations */}
      {match.recommendations && match.recommendations.length > 0 && (
        <div>
          <h4 className="font-semibold text-gray-900 mb-3">Recommendations</h4>
          <ul className="space-y-2">
            {match.recommendations.map((rec, idx) => (
              <li key={idx} className="flex gap-3 text-sm">
                <span className="text-green-600 font-bold">✓</span>
                <p className="text-gray-700">{rec}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ScoreBar({ label, score }: { label: string; score: number }) {
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-sm font-medium text-gray-900">{label}</span>
        <span className="text-sm font-semibold text-gray-700">{score}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ${
            score >= 80 ? 'bg-green-600' : score >= 60 ? 'bg-yellow-600' : 'bg-red-600'
          }`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}
