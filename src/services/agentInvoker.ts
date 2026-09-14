/**
 * Agent Invoker Service
 *
 * Invokes FITCV agents via Claude API
 * Handles serialization of input/output and error handling
 */

import axios from 'axios';
import { logger } from './logger';
import { env } from '../env';
import { AppError } from '../middleware/errorHandler';
import { extractJson } from '../utils/safeJson';

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
// Los identificadores de modelo caducan: los anteriores (Sonnet 3.5 de 2024)
// fueron retirados y la API respondía "model: ..." aunque la clave fuera
// válida. Se dejan configurables por entorno para que la próxima rotación sea
// una variable y no un redespliegue.
const DEFAULT_MODEL = env.CLAUDE_MODEL;
const ORCHESTRATOR_MODEL = env.CLAUDE_ORCHESTRATOR_MODEL;

// Los límites anteriores (1500-3000) eran menores que el JSON que los propios
// prompts exigen: la respuesta se cortaba a mitad y llegaba como "no se pudo
// parsear". El analizador debe emitir perfil, experiencia, educación, skills,
// idiomas, certificaciones, calidad, gaps y recomendaciones; el adaptador
// devuelve un CV completo dentro del JSON.
const AGENT_CONFIG: Record<AgentName, { model: string; maxTokens: number }> = {
  'cv-analyzer': { model: DEFAULT_MODEL, maxTokens: 8000 },
  'postulation-matcher': { model: DEFAULT_MODEL, maxTokens: 4000 },
  'cv-adapter': { model: DEFAULT_MODEL, maxTokens: 16000 },
  'offer-ranker': { model: DEFAULT_MODEL, maxTokens: 8000 },
  // El orquestador coordina a los demás, así que usa el modelo más capaz.
  'postulation-orchestrator': { model: ORCHESTRATOR_MODEL, maxTokens: 8000 },
};

export class AgentInvokerService {
  private static apiKey = env.CLAUDE_API_KEY;
  // Configurable para poder apuntar a un gateway propio, y para que los tests
  // ejerciten el flujo completo contra un upstream simulado.
  private static apiUrl = env.CLAUDE_API_URL;

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
          // 30s no alcanzaba: rankear varias ofertas o reescribir un CV
          // completo tarda más, y el usuario recibía un timeout en vez de su
          // resultado.
          timeout: env.CLAUDE_TIMEOUT_MS,
        }
      );

      // La respuesta trae una lista de bloques y no todos son texto: los
      // modelos actuales pueden anteponer otros tipos. Tomar content[0].text a
      // ciegas devolvía undefined y el fallo aparecía como "no se pudo parsear"
      // sin ninguna pista de que el texto ni siquiera se había extraído.
      const blocks = Array.isArray(response.data.content) ? response.data.content : [];
      const responseText = blocks
        .filter(b => b?.type === 'text' && typeof b.text === 'string')
        .map(b => b.text)
        .join('\n')
        .trim();

      if (!responseText) {
        logger.error(`Agent response had no text block: ${agentName}`, {
          userId,
          agentName,
          blockTypes: blocks.map(b => b?.type),
        });
      }

      const output = this.parseOutput(responseText);

      invocation.success = output.success !== false;
      invocation.output = output;
      invocation.costTokens = (response.data.usage?.input_tokens || 0) + (response.data.usage?.output_tokens || 0);

      if (invocation.success) {
        logger.info(`Agent invocation successful: ${agentName}`, {
          userId,
          agentName,
          tokens: invocation.costTokens,
          stopReason: (response.data as any).stop_reason,
        });
      } else {
        // Antes se registraba "successful" igual, porque solo se miraba si la
        // llamada HTTP había ido bien. Un modelo que devuelve algo ilegible
        // quedaba indistinguible de uno que funcionó.
        // Un JSON cortado a la mitad no es lo mismo que un modelo que no supo
        // responder, y "no se pudo parsear" los confunde.
        const truncated = (response.data as any).stop_reason === 'max_tokens';
        invocation.error = truncated
          ? `The AI response was cut off at the ${config.maxTokens} token limit before it finished.`
          : String(output.error || 'Agent returned success: false');
        logger.error(`Agent returned a failure: ${agentName}`, {
          userId,
          agentName,
          reason: invocation.error,
          // stop_reason === 'max_tokens' delata una respuesta truncada, que es
          // la causa habitual de un JSON que no parsea.
          stopReason: (response.data as any).stop_reason,
          outputTokens: response.data.usage?.output_tokens,
          rawResponse: String(output.rawResponse || '').slice(0, 400),
        });
      }

      return invocation;
    } catch (error) {
      invocation.success = false;
      invocation.error = this.describeError(error);

      logger.error(`Agent invocation failed: ${agentName}`, {
        userId,
        agentName,
        error: invocation.error,
      });

      // Un 401/403 del upstream es un fallo de configuración nuestro, no del
      // cliente: se reporta como 503 para no confundirlo con su propia sesión.
      const status = (error as any)?.response?.status;
      throw new AppError(status === 429 ? 429 : 503, invocation.error);
    } finally {
      invocation.endTime = new Date();
      invocation.durationMs = invocation.endTime.getTime() - invocation.startTime.getTime();
    }
  }

  /**
   * Traduce fallos del upstream a algo accionable. Sin esto, una API key
   * inválida llegaba al cliente como "Request failed with status code 401".
   */
  private static describeError(error: unknown): string {
    const status = (error as any)?.response?.status;
    const upstream = (error as any)?.response?.data?.error?.message;

    if (status === 401 || status === 403) {
      return 'AI service rejected the credentials (CLAUDE_API_KEY is missing, invalid or expired).';
    }
    if (status === 429) {
      return 'AI service rate limit reached. Please retry in a moment.';
    }
    if (status >= 500) {
      return 'AI service is temporarily unavailable. Please retry in a moment.';
    }
    if ((error as any)?.code === 'ECONNABORTED') {
      return 'AI service timed out while analyzing. Please retry.';
    }
    if (upstream) return `AI service error: ${upstream}`;
    return error instanceof Error ? error.message : String(error);
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
    // Los reintentos previos hacían JSON.parse sin protección dentro del catch,
    // así que un bloque markdown malformado lanzaba en vez de degradar.
    const parsed = extractJson<Record<string, any>>(text);

    if (parsed && typeof parsed === 'object') {
      return parsed;
    }

    return {
      success: false,
      error: 'Could not parse agent response',
      rawResponse: typeof text === 'string' ? text.slice(0, 500) : '',
    };
  }
}
