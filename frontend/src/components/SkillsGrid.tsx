interface SkillsGridProps {
  skills: string[];
  title?: string;
  maxDisplay?: number;
}

export function SkillsGrid({ skills, title = 'Skills', maxDisplay = 30 }: SkillsGridProps) {
  const displaySkills = skills.slice(0, maxDisplay);
  const hiddenCount = skills.length - displaySkills.length;

  const skillColors = [
    'bg-blue-100 text-blue-800',
    'bg-purple-100 text-purple-800',
    'bg-green-100 text-green-800',
    'bg-pink-100 text-pink-800',
    'bg-indigo-100 text-indigo-800',
    'bg-teal-100 text-teal-800',
  ];

  return (
    <div>
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        {title} ({skills.length})
      </h3>
      <div className="flex flex-wrap gap-2">
        {displaySkills.map((skill, idx) => (
          <span
            key={idx}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition hover:shadow-md cursor-default ${
              skillColors[idx % skillColors.length]
            }`}
            title={skill}
          >
            {skill}
          </span>
        ))}
        {hiddenCount > 0 && (
          <span className="px-3 py-1.5 rounded-full text-sm font-medium bg-gray-200 text-gray-800">
            +{hiddenCount} more
          </span>
        )}
      </div>
    </div>
  );
}
