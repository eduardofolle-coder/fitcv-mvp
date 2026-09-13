/**
 * Agent Invoker Service
 *
 * Invokes FITCV agents via Claude API
 * Handles serialization of input/output and error handling
 */

import axios from 'axios';
import { logger } from './logger';

export type AgentName = 'cv-analyzer' | 'postulation-matcher' | 'cv-adapter' | 'offer-ranker' | 'postulation-orchestrator';

export interface AgentInvocation {
  agentName: AgentName;
  input: Record<string, any>;
  userId: string;
  startTime: Date;
  endTime?: Date;
  durationMs?: number;
  success: boolean;
  output?: Record<string, any>;
  error?: string;
  costTokens?: number;
}

interface ClaudeAPIRequest {
  model: string;
  max_tokens: number;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
}

interface ClaudeAPIResponse {
  content: Array<{
    type: string;
    text: string;
  }>;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

// Agent configurations
const AGENT_CONFIG: Record<AgentName, { model: string; maxTokens: number }> = {
  'cv-analyzer': { model: 'claude-3-5-sonnet-20241022', maxTokens: 2000 },
  'postulation-matcher': { model: 'claude-3-5-sonnet-20241022', maxTokens: 1500 },
  'cv-adapter': { model: 'claude-3-5-sonnet-20241022', maxTokens: 3000 },
  'offer-ranker': { model: 'claude-3-5-sonnet-20241022', maxTokens: 2000 },
  'postulation-orchestrator': { model: 'claude-opus-4-1-20250805', maxTokens: 4000 },
};

export class AgentInvokerService {
  private static apiKey = process.env.CLAUDE_API_KEY;
  private static apiUrl = 'https://api.anthropic.com/v1/messages';

  /**
   * Invoke a FITCV agent
   */
  static async invoke(
    agentName: AgentName,
    input: Record<string, any>,
    userId: string
  ): Promise<AgentInvocation> {
    const invocation: AgentInvocation = {
      agentName,
      input,
      userId,
      startTime: new Date(),
      success: false,
    };

    try {
      // Validate API key
      if (!this.apiKey) {
        throw new Error('CLAUDE_API_KEY not configured');
      }

      // Get agent config
      const config = AGENT_CONFIG[agentName];
      if (!config) {
        throw new Error(`Unknown agent: ${agentName}`);
      }

      // Build prompt for agent
      const prompt = this.buildPrompt(agentName, input);

      // Call Claude API
      logger.info(`Invoking agent: ${agentName}`, { userId, agentName });

      const response = await axios.post<ClaudeAPIResponse>(
        this.apiUrl,
        {
          model: config.model,
          max_tokens: config.maxTokens,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
        } as ClaudeAPIRequest,
        {
          headers: {
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01',
          },
          timeout: 30000,
        }
      );

      // Extract response
      const responseText = response.data.content[0].text;
      const output = this.parseOutput(responseText);

      invocation.success = output.success !== false;
      invocation.output = output;
      invocation.costTokens = (response.data.usage?.input_tokens || 0) + (response.data.usage?.output_tokens || 0);

      logger.info(`Agent invocation successful: ${agentName}`, {
        userId,
        agentName,
        tokens: invocation.costTokens,
      });

      return invocation;
    } catch (error) {
      invocation.success = false;
      invocation.error = error instanceof Error ? error.message : String(error);

      logger.error(`Agent invocation failed: ${agentName}`, {
        userId,
        agentName,
        error: invocation.error,
      });

      throw error;
    } finally {
      invocation.endTime = new Date();
      invocation.durationMs = invocation.endTime.getTime() - invocation.startTime.getTime();
    }
  }

  /**
   * Build prompt for agent based on input
   */
  private static buildPrompt(agentName: AgentName, input: Record<string, any>): string {
    const inputJson = JSON.stringify(input, null, 2);

    const prompts: Record<AgentName, string> = {
      'cv-analyzer': `You are the CV Analyzer Agent from the FITCV project.

Your role: Parse CV content and extract structured profile data.

INPUT DATA:
${inputJson}

Process:
1. Parse the CV text provided
2. Extract all sections (experience, education, skills, certifications, languages)
3. Validate completeness (required fields, date formats, email)
4. Assess quality (clarity, consistency, grammar, completeness on 0-100 scale)
5. Identify gaps and provide recommendations

Return ONLY valid JSON matching this structure:
{
  "success": true,
  "profile": {
    "fullName": "...",
    "email": "...",
    "phone": "...",
    "location": "...",
    "summary": "...",
    "yearsExperience": number,
    "experience": [{"company": "...", "title": "...", "startDate": "YYYY-MM", "endDate": "YYYY-MM", "duration": "...", "responsibilities": [], "achievements": []}],
    "education": [{"institution": "...", "degree": "...", "field": "...", "graduationDate": "YYYY-MM", "honors": "..."}],
    "skills": {"programming": [], "frameworks": [], "tools": [], "soft": []},
    "languages": [{"language": "...", "proficiency": "..."}],
    "certifications": [{"name": "...", "issuer": "...", "date": "YYYY-MM", "expiresDate": "YYYY-MM"}]
  },
  "quality": {"clarity": 0-100, "consistency": 0-100, "grammar": 0-100, "completeness": 0-100},
  "gaps": [],
  "recommendations": []
}

CRITICAL: Return only JSON, no explanation. If parsing fails, return {"success": false, "error": "..."}`,

      'postulation-matcher': `You are the Postulation Matcher Agent from the FITCV project.

Your role: Match CV against job requirements and score fit.

INPUT DATA:
${inputJson}

Process:
1. Extract job requirements from the job description
2. Extract candidate capabilities from their profile
3. Score alignment on each dimension (0-100):
   - Skills match (90-100: all skills, 70-89: most, 50-69: some, 30-49: few, 0-29: missing most)
   - Experience match (same scale)
   - Education match (same scale)
4. Calculate overall match as weighted average
5. Identify gaps and provide recommendations

Return ONLY valid JSON matching this structure:
{
  "success": true,
  "matchAnalysis": {
    "jobTitle": "...",
    "candidateName": "...",
    "jobLevel": "L1-L6",
    "candidateLevel": "L1-L6",
    "scores": {"skillsMatch": 0-100, "experienceMatch": 0-100, "educationMatch": 0-100, "overallMatch": 0-100},
    "verdict": "...",
    "matchPercentile": 0-100
  },
  "skillsAnalysis": {
    "required": [{"skill": "...", "importance": "critical|important|nice-to-have", "candidateHas": true|false}],
    "preferred": [],
    "matchedSkills": number,
    "totalRequired": number,
    "skillsGapPercentage": 0-100
  },
  "gaps": [{"gap": "...", "importance": "...", "timeToClosure": "...", "recommendation": "..."}],
  "recommendations": []
}

CRITICAL: Return only JSON, no explanation. Scores are 0-100 integers.`,

      'cv-adapter': `You are the CV Adapter Agent from the FITCV project.

Your role: Adapt CV for specific job role while maintaining truthfulness.

INPUT DATA:
${inputJson}

Process:
1. Analyze source CV and target job requirements
2. Identify alignment opportunities
3. Rewrite sections to emphasize relevant skills (WITHOUT INVENTING)
4. Optimize for ATS (keywords, formatting, standard headers)
5. Verify NO information was invented or exaggerated
6. Calculate ATS score (0-100) based on keyword match and format

CRITICAL RULES:
- NEVER invent skills or experience that don't exist in original CV
- NEVER exaggerate dates or achievements
- NEVER hallucinate information
- Keep all factual information from original CV
- Only reframe and reorganize existing content

Return ONLY valid JSON:
{
  "success": true,
  "adaptation": {
    "jobTitle": "...",
    "adaptedCV": "...[full CV text]...",
    "atsScore": 0-100,
    "keywordMatches": [],
    "changes": [],
    "optimizations": []
  },
  "quality": {"truthfulness": 0-100, "relevanceScore": 0-100},
  "warnings": [],
  "recommendations": []
}

CRITICAL: Return only JSON. truthfulness must be 100 if no information was added/changed (only reorganized).`,

      'offer-ranker': `You are the Offer Ranker Agent from the FITCV project.

Your role: Rank job opportunities by fit to candidate profile.

INPUT DATA:
${inputJson}

Process:
1. Understand candidate profile (skills, experience, preferences)
2. For each opportunity, analyze:
   - Skills fit (30 weight)
   - Career growth potential (25 weight)
   - Compensation appropriateness (20 weight)
   - Location & lifestyle match (15 weight)
   - Company stability (10 weight)
3. Calculate overall score = (skillsFit*0.3) + (growth*0.25) + (salary*0.2) + (location*0.15) + (stability*0.1)
4. Rank opportunities by overall score (highest first)
5. For each opportunity identify strengths, concerns, and red flags

Return ONLY valid JSON:
{
  "success": true,
  "rankings": [
    {
      "rank": 1,
      "jobTitle": "...",
      "company": "...",
      "overallScore": 0-100,
      "scores": {"skillsFit": 0-100, "careerGrowth": 0-100, "compensation": 0-100, "locationLifestyle": 0-100, "companyStability": 0-100},
      "verdict": "...",
      "reasoning": "...",
      "strengths": [],
      "concerns": [],
      "redFlags": []
    }
  ],
  "candidateSummary": {"name": "...", "currentRole": "...", "yearsExperience": number, "topSkills": []},
  "recommendations": [],
  "marketContext": {}
}

CRITICAL: Return only JSON. Rankings sorted by overallScore descending.`,

      'postulation-orchestrator': `You are the Postulation Orchestrator Agent from the FITCV project.

Your role: Coordinate full postulation workflow.

INPUT DATA:
${inputJson}

Based on the action requested, orchestrate the appropriate agents:
- "analyze": Call cv-analyzer
- "match": Call postulation-matcher for each opportunity
- "adapt": Call cv-adapter for specific role
- "rank": Call offer-ranker for multiple opportunities
- "full": Complete workflow from analyze → match → adapt

Return ONLY valid JSON:
{
  "success": true,
  "action": "...",
  "agentsInvoked": ["cv-analyzer", ...],
  "results": {...},
  "nextSteps": [],
  "recommendations": []
}

CRITICAL: Return only JSON. This agent coordinates others.`,
    };

    return prompts[agentName] || '';
  }

  /**
   * Parse agent output (handles JSON in markdown code blocks)
   */
  private static parseOutput(text: string): Record<string, any> {
    try {
      // Try direct JSON parse first
      return JSON.parse(text);
    } catch {
      // Try extracting JSON from markdown code block
      const jsonMatch = text.match(/```(?:json)?\n?([\s\S]*?)\n?```/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1]);
      }

      // Try extracting JSON object
      const objectMatch = text.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        return JSON.parse(objectMatch[0]);
      }

      // Fallback: return error
      return {
        success: false,
        error: 'Could not parse agent response',
        rawResponse: text,
      };
    }
  }
}
