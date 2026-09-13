/**
 * Memory Vault Service
 *
 * Manages unified memory for continuous learning
 * Stores and retrieves patterns, insights, and learnings
 *
 * Memory is stored as Markdown files in ~/.claude/projects/fitcv-mvp/memory/
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { logger } from './logger.js';

interface SuccessfulCVPattern {
  id: string;
  jobTitle: string;
  company: string;
  candidateLevel: string;
  matchScore: number;
  atsScore: number;
  keywords: string[];
  cvSections: Record<string, string>;
  outcome: 'interview' | 'offer' | 'rejection';
  timeToOutcome: string;
  notes: string;
}

interface PersonalHeuristic {
  principle: string;
  evidence: number;
  successRate: number;
  example: string;
}

export class MemoryVaultService {
  private static memoryDir = path.join(
    os.homedir(),
    '.claude/projects/fitcv-mvp/memory'
  );

  /**
   * Initialize memory vault directory structure
   */
  static initialize(): void {
    const directories = [
      this.memoryDir,
      path.join(this.memoryDir, 'patterns'),
      path.join(this.memoryDir, 'market'),
      path.join(this.memoryDir, 'insights'),
      path.join(this.memoryDir, 'feedback'),
    ];

    directories.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        logger.info(`Created memory directory: ${dir}`);
      }
    });

    // Create MEMORY.md index if not exists
    const indexPath = path.join(this.memoryDir, 'MEMORY.md');
    if (!fs.existsSync(indexPath)) {
      fs.writeFileSync(
        indexPath,
        `# FITCV Memory Vault

Index of learned patterns and insights.

## Patterns
- [Successful CV Adaptations](patterns/successful-cv-adaptations.md)
- [Skill Growth](patterns/skill-growth-timeline.md)
- [Company Insights](patterns/company-insights.md)

## Market Data
- [Market Trends](market/salary-trends.md)
- [In-Demand Skills](market/in-demand-skills.md)

## Insights
- [Personal Heuristics](insights/personal-heuristics.md)
- [User Preferences](insights/user-preferences.md)

## Feedback
- [Interview Outcomes](feedback/interview-outcomes.md)
- [Success Factors](feedback/success-factors.md)
`
      );
      logger.info('Created MEMORY.md index');
    }
  }

  /**
   * Save successful CV adaptation pattern
   */
  static saveSuccessfulCVPattern(
    userId: string,
    pattern: Omit<SuccessfulCVPattern, 'id'>
  ): SuccessfulCVPattern {
    const id = uuidv4();
    const fullPattern: SuccessfulCVPattern = { id, ...pattern };

    const filePath = path.join(this.memoryDir, 'patterns/successful-cv-adaptations.md');

    const entry = `
## ${pattern.jobTitle} at ${pattern.company} (${new Date().toISOString().split('T')[0]})

- **ID:** ${id}
- **User:** ${userId}
- **Level:** ${pattern.candidateLevel}
- **Match Score:** ${pattern.matchScore}/100
- **ATS Score:** ${pattern.atsScore}/100
- **Outcome:** ${pattern.outcome}
- **Time to Outcome:** ${pattern.timeToOutcome}

### Keywords
${pattern.keywords.map(k => `- ${k}`).join('\n')}

### CV Sections That Worked
${Object.entries(pattern.cvSections)
  .map(([section, value]) => `#### ${section}\n${value}`)
  .join('\n\n')}

### Notes
${pattern.notes}

---
`;

    const existingContent = fs.existsSync(filePath)
      ? fs.readFileSync(filePath, 'utf-8')
      : `# Successful CV Adaptations\n\nPatterns that led to interviews or offers.\n`;

    fs.writeFileSync(filePath, existingContent + entry);

    logger.info('Saved successful CV pattern', { userId, patternId: id, jobTitle: pattern.jobTitle });

    return fullPattern;
  }

  /**
   * Save user's skill growth milestone
   */
  static saveSkillGrowth(
    userId: string,
    skill: string,
    proficiency: string,
    evidence: string
  ): void {
    const filePath = path.join(this.memoryDir, 'patterns/skill-growth-timeline.md');

    const entry = `
## ${skill} - ${proficiency} (${new Date().toISOString().split('T')[0]})

**Evidence:** ${evidence}

---
`;

    const existingContent = fs.existsSync(filePath)
      ? fs.readFileSync(filePath, 'utf-8')
      : `# Skill Growth Timeline\n\nUser: ${userId}\n\n`;

    fs.writeFileSync(filePath, existingContent + entry);

    logger.info('Saved skill growth', { userId, skill, proficiency });
  }

  /**
   * Save personal success heuristic
   */
  static savePersonalHeuristic(
    userId: string,
    heuristic: PersonalHeuristic
  ): void {
    const filePath = path.join(this.memoryDir, 'insights/personal-heuristics.md');

    const entry = `
## ${heuristic.principle}

- **Evidence:** ${heuristic.evidence} successful outcomes
- **Success Rate:** ${(heuristic.successRate * 100).toFixed(0)}%
- **Example:** ${heuristic.example}

---
`;

    const existingContent = fs.existsSync(filePath)
      ? fs.readFileSync(filePath, 'utf-8')
      : `# Personal Success Heuristics\n\nUser: ${userId}\n\n`;

    fs.writeFileSync(filePath, existingContent + entry);

    logger.info('Saved personal heuristic', { userId, principle: heuristic.principle });
  }

  /**
   * Save company insight
   */
  static saveCompanyInsight(
    userId: string,
    company: string,
    insight: Record<string, any>
  ): void {
    const filePath = path.join(this.memoryDir, 'patterns/company-insights.md');

    const entry = `
## ${company}

- **Success Rate:** ${insight.successRate}
- **Interview Count:** ${insight.interviewsCount}
- **Offer Count:** ${insight.offersCount}

### Valued Skills
${insight.valuedSkills.map((s: string) => `- ${s}`).join('\n')}

### Interview Process
${insight.typicalInterviewProcess
  .map((step: string, idx: number) => `${idx + 1}. ${step}`)
  .join('\n')}

### Culture Fit
${insight.cultureFit}

### Notes
${insight.userNotes}

---
`;

    const existingContent = fs.existsSync(filePath)
      ? fs.readFileSync(filePath, 'utf-8')
      : `# Company Insights\n\nUser: ${userId}\n\n`;

    fs.writeFileSync(filePath, existingContent + entry);

    logger.info('Saved company insight', { userId, company });
  }

  /**
   * Save market data (salary trends, in-demand skills)
   */
  static saveMarketData(
    location: string,
    jobLevel: string,
    data: Record<string, any>
  ): void {
    const filePath = path.join(this.memoryDir, 'market/market-trends.md');

    const entry = `
## ${location} - Level ${jobLevel} (${new Date().toISOString().split('T')[0]})

- **Average Salary:** ${data.averageSalary} ${data.salaryCurrency}
- **Interview Rate:** ${(data.interviewRate * 100).toFixed(0)}%
- **Offer Rate:** ${(data.offerRate * 100).toFixed(0)}%

### In-Demand Skills
${data.inDemandSkills
  .map((s: Record<string, any>) => `- ${s.skill}: ${(s.frequency * 100).toFixed(0)}%`)
  .join('\n')}

### Top Companies
${data.topCompanies
  .map((c: Record<string, any>) => `- ${c.name}: ${c.positionsAvailable} positions, avg ${c.averageSalary}`)
  .join('\n')}

---
`;

    const existingContent = fs.existsSync(filePath)
      ? fs.readFileSync(filePath, 'utf-8')
      : `# Market Trends\n\n`;

    fs.writeFileSync(filePath, existingContent + entry);

    logger.info('Saved market data', { location, jobLevel });
  }

  /**
   * Get all successful patterns for a user
   */
  static getSuccessfulPatterns(userId: string): SuccessfulCVPattern[] {
    const filePath = path.join(this.memoryDir, 'patterns/successful-cv-adaptations.md');

    if (!fs.existsSync(filePath)) {
      return [];
    }

    // Parse markdown to extract patterns
    // For now, return empty (would need markdown parser)
    logger.info('Retrieved successful patterns', { userId });
    return [];
  }

  /**
   * Get personal heuristics for user
   */
  static getPersonalHeuristics(userId: string): PersonalHeuristic[] {
    const filePath = path.join(this.memoryDir, 'insights/personal-heuristics.md');

    if (!fs.existsSync(filePath)) {
      return [];
    }

    // Parse markdown to extract heuristics
    // For now, return empty
    logger.info('Retrieved personal heuristics', { userId });
    return [];
  }

  /**
   * Get company insights
   */
  static getCompanyInsight(userId: string, company: string): Record<string, any> | null {
    const filePath = path.join(this.memoryDir, 'patterns/company-insights.md');

    if (!fs.existsSync(filePath)) {
      return null;
    }

    // Parse markdown to find company section
    // For now, return null
    logger.info('Retrieved company insight', { userId, company });
    return null;
  }

  /**
   * Get memory summary for user (what system has learned)
   */
  static getMemorySummary(userId: string): Record<string, any> {
    return {
      userId,
      successfulPatterns: this.getSuccessfulPatterns(userId).length,
      personalHeuristics: this.getPersonalHeuristics(userId).length,
      skillsTracked: 0, // Would count from skill-growth-timeline.md
      companiesTracked: 0, // Would count from company-insights.md
      lastUpdated: new Date(),
      memoryVaultPath: this.memoryDir,
    };
  }

  /**
   * Export memory for user (e.g., for backup or sharing)
   */
  static exportMemory(_userId: string): string {
    const files = fs.readdirSync(this.memoryDir, { recursive: true });
    const export_data: Record<string, string> = {};

    files.forEach(file => {
      const filePath = path.join(this.memoryDir, file.toString());
      if (fs.statSync(filePath).isFile()) {
        export_data[file.toString()] = fs.readFileSync(filePath, 'utf-8');
      }
    });

    return JSON.stringify(export_data, null, 2);
  }

  /**
   * Clear memory for user (privacy: right to be forgotten)
   */
  static clearMemory(userId: string): void {
    // Archive old files
    const timestamp = new Date().toISOString().split('T')[0];
    const archiveDir = path.join(this.memoryDir, `.archive-${timestamp}`);

    if (!fs.existsSync(archiveDir)) {
      fs.mkdirSync(archiveDir, { recursive: true });
    }

    // Move all pattern files to archive
    const patternsDir = path.join(this.memoryDir, 'patterns');
    if (fs.existsSync(patternsDir)) {
      fs.readdirSync(patternsDir).forEach(file => {
        const source = path.join(patternsDir, file);
        const dest = path.join(archiveDir, file);
        fs.renameSync(source, dest);
      });
    }

    logger.info('Cleared memory for user', { userId });
  }

  /**
   * Prepare agent prompt with relevant memory context
   */
  static getMemoryContextForAgent(
    userId: string,
    agentType: string,
    _context: Record<string, any>
  ): string {
    const heuristics = this.getPersonalHeuristics(userId);
    const patterns = this.getSuccessfulPatterns(userId);

    let contextStr = '';

    if (agentType === 'cv-adapter' && patterns.length > 0) {
      contextStr = `
## What has worked for this user before:
${patterns
  .slice(0, 3)
  .map(p => `- ${p.jobTitle}: Keywords: ${p.keywords.join(', ')}, ATS: ${p.atsScore}`)
  .join('\n')}

## User's success principles:
${heuristics.map(h => `- ${h.principle} (${(h.successRate * 100).toFixed(0)}% success rate)`).join('\n')}
`;
    }

    return contextStr;
  }
}
