import { Gap } from '../types';

interface CVGapsProps {
  gaps?: Gap[];
  title?: string;
}

export function CVGaps({ gaps, title = 'Profile Gaps' }: CVGapsProps) {
  if (!gaps || gaps.length === 0) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-6">
        <p className="text-green-700 font-semibold">✓ Your profile looks complete!</p>
        <p className="text-green-600 text-sm mt-1">No major gaps detected. Ready to start applying.</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">{title}</h2>
      <div className="space-y-4">
        {gaps.map((gap, idx) => (
          <GapCard key={idx} gap={gap} />
        ))}
      </div>
    </div>
  );
}

function GapCard({ gap }: { gap: Gap }) {
  const severityClass = {
    low: 'border-yellow-200 bg-yellow-50',
    medium: 'border-orange-200 bg-orange-50',
    high: 'border-red-200 bg-red-50',
  };

  const severityBadge = {
    low: 'bg-yellow-200 text-yellow-800',
    medium: 'bg-orange-200 text-orange-800',
    high: 'bg-red-200 text-red-800',
  };

  const severityLabel = {
    low: '⚠️ Low Impact',
    medium: '⚠️ Medium Impact',
    high: '🔴 High Priority',
  };

  return (
    <div className={`border-l-4 rounded-lg p-5 ${severityClass[gap.severity]}`}>
      <div className="flex items-start justify-between mb-2">
        <h3 className="font-semibold text-gray-900">{gap.title}</h3>
        <span className={`text-xs font-semibold px-3 py-1 rounded-full ${severityBadge[gap.severity]}`}>
          {severityLabel[gap.severity]}
        </span>
      </div>
      <p className="text-gray-700 text-sm">{gap.description}</p>
    </div>
  );
}
