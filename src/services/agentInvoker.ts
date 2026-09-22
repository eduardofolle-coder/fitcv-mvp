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

export type AgentName = 'cv-analyzer' | 'postulation-matcher' | 'cv-adapter' | 'cv-verifier' | 'answer-writer' | 'offer-ranker' | 'postulation-orchestrator';

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
  // Desglosa cada texto en afirmaciones con su cita: con 4000 se cortaba.
  'cv-verifier': { model: DEFAULT_MODEL, maxTokens: 12000 },
  'answer-writer': { model: DEFAULT_MODEL, maxTokens: 4000 },
};

export class AgentInvokerService {
  private static apiKey = env.CLAUDE_API_KEY;
  // Configurable para poder apuntar a un gateway propio, y para que los tests
  // ejerciten el flujo completo contra un upstream simulado.
  private static apiUrl = env.CLAUDE_API_URL;

  // Reintentos ante fallos transitorios del proveedor de IA. A escala (muchos
  // usuarios postulando a la vez) el proveedor devuelve 429; un timeout o un 5xx
  // también son recuperables reintentando. Un 4xx (salvo 429) no se reintenta.
  private static readonly MAX_RETRIES = 3;

  private static async postWithRetry(body: ClaudeAPIRequest): Promise<{ data: ClaudeAPIResponse }> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        return await axios.post<ClaudeAPIResponse>(this.apiUrl, body, {
          headers: { 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01' },
          // Rankear ofertas o reescribir un CV completo tarda; sin holgura el
          // usuario recibía un timeout en vez de su resultado.
          timeout: env.CLAUDE_TIMEOUT_MS,
        });
      } catch (error) {
        lastError = error;
        const status = (error as { response?: { status?: number } })?.response?.status;
        const timedOut = (error as { code?: string })?.code === 'ECONNABORTED';
        const retryable = status === 429 || (typeof status === 'number' && status >= 500) || timedOut;
        if (!retryable || attempt === this.MAX_RETRIES) throw error;

        // Respeta Retry-After si el proveedor lo manda; si no, backoff
        // exponencial con jitter (~1.5s, 3s, 6s) para no golpear en sincronía.
        const retryAfter = Number(
          (error as { response?: { headers?: Record<string, string> } })?.response?.headers?.['retry-after']
        );
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : Math.round(2 ** attempt * 1500 + Math.random() * 800);
        logger.warn('AI call retry', {
          attempt: attempt + 1,
          reason: status ?? (timedOut ? 'timeout' : 'error'),
          waitMs,
        });
        await new Promise(resolve => setTimeout(resolve, waitMs));
      }
    }
    throw lastError;
  }

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

      const response = await this.postWithRetry({
        model: config.model,
        max_tokens: config.maxTokens,
        messages: [{ role: 'user', content: prompt }],
      });

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

      'cv-adapter': `You are the CV Narrative Adapter of FITCV.

Your job is to orient how a candidate's real career is TOLD for one specific job offer. You do not write the CV. FITCV assembles it and copies every hard fact (companies, job titles, dates, education, languages, certifications) verbatim from the candidate's verified data. You only decide the narrative.

INPUT DATA:
${inputJson}

"hardData" is the candidate's verified record. Each experience has an "id" and a zero-based list "details" with the original wording from the CV. "job" is the offer.

Produce:
- headline: one line positioning the candidate toward this role, using only facts present in hardData.
- summary: 2 to 4 sentences telling the candidate's real story as it matters to this offer.
- highlights: for each experience id you want to reshape, the details worth emphasizing, in the order that best serves the offer. Each item restates ONE detail, referenced by its "sourceIndex". You may change emphasis, wording and framing. You may not add facts, technologies, scope, team sizes, metrics or results that the detail does not state.
- skillsFirst: skills from hardData.skills to list first because the offer values them. Only exact entries from that list.
- language: "es" or "en", whichever language the job description is written in.
- rationale: one or two sentences explaining the story you chose. Always in Spanish: it is shown to the candidate in FITCV.
- atsScore: 0-100 estimate of how well the real profile matches the offer. Do not inflate it.
- keywordMatches: offer keywords the candidate genuinely has.

Hard rules:
- Never write company names, job titles, dates, durations, institutions or degrees anywhere in your output. FITCV inserts them.
- Never state a number of years of experience, or any other figure, that is not literally present in hardData.
- If the offer asks for something the candidate does not have, do not claim it. Emphasize real, transferable experience instead.
- Never mention in headline, summary or highlights what the candidate lacks. The CV goes to the employer; gaps belong only in the rationale, which only the candidate sees.
- Write in CV register: implied subject, as CVs are written. Never "this candidate", never third person.
- Highlights restate facts only. Do not append commentary about relevance or ability ("demonstrating strong skills", "directly relevant to").
- Never attribute ownership or leadership ("led", "directed", "drove") unless the detail itself states it.
- Never weaken a detail either: keep the leadership, ownership, team sizes, figures and results it states. "Led a team of 4 engineers" must not become "worked within a team". Write figures as digits, exactly as in the detail.
- Everything you write is checked line by line against the original by an independent verifier, and anything it cannot trace back is replaced by the original wording.
- Write headline, summary and highlights in the language of the job description.

Return ONLY valid JSON:
{
  "success": true,
  "narrative": {
    "headline": "...",
    "summary": "...",
    "highlights": { "exp-0": [{ "text": "...", "sourceIndex": 0 }] },
    "skillsFirst": [],
    "rationale": "...",
    "language": "es"
  },
  "atsScore": 0,
  "keywordMatches": []
}`,

      'cv-verifier': `You are the CV Narrative Verifier of FITCV. You are independent from whoever wrote the narrative, and your only loyalty is to the truth of the candidate's CV.

INPUT DATA:
${inputJson}

"facts" is the candidate's verified record. "highlights" pairs an original line from the CV with a rewritten version of it. "statements" are texts written from those facts: a headline, a summary, or answers to application questions.

"offer", when present, is the job the candidate is applying to. In statements, a claim about the role, the company or what the offer asks for is supported only by text copied exactly from the offer; a claim about the candidate only by an entry of facts. Expressions of interest in the role ("me interesa", "quiero aportar mi experiencia", "me motiva postular") are not claims and need no support: do not list them as claims.

For each highlight decide:
- "supported" if the rewritten version states nothing beyond the original: same actions, same scope, same ownership, same results. Rewording, emphasis and professional phrasing are fine.
- "inflated" if it adds anything the original does not state: ownership or leadership ("led", "directed", "owned", "drove") where the original only names the work; larger scope, impact or results; team sizes, metrics, technologies or tools absent from the original; or evaluative claims about the candidate ("demonstrating strong skills", "expert in") that are not facts.
- "weakened" if it drops something the original does state: leadership or ownership ("led a team" turned into "worked in a team"), team sizes, figures, scope or results. Understating the candidate is also a distortion.

For each statement, break it into every individual claim it makes and judge each one separately. A claim is anything asserted about the candidate: an action, a skill, a result, a quality, a scale or impact, and also any relationship between facts ("during", "while", "as part of", "which allowed me", "leading the team through"). For each claim give "supportedBy": text copied exactly, character for character, from ONE single entry of facts that states that claim, or null if no single entry states it.
- A relationship between two facts is supported only if one single entry states that relationship. Two separate entries do not support a claim that links them.
- Words about scale, impact or quality ("large-scale", "high-traffic", "production-grade", "strong") need an entry that states them.
- Ownership or leadership needs an entry that states it for that specific work.
The statement is "supported" only if every claim is. Mark it "inflated" if any claim is not, including qualities asserted without support, and including any sentence that discloses a gap or missing requirement: the CV goes to the employer, and that belongs in private advice to the candidate.
Your quotes are checked against the record by code. A quote that does not appear in it counts as no support.

Be strict. When in doubt, choose "inflated". Every "inflated" or "weakened" verdict needs a reason: one short sentence, in Spanish, naming exactly what was added or dropped.

Keep the output compact: each "claim" is a few words, not a copy of the sentence; "supportedBy" is the shortest exact fragment that states the claim; leave "reason" empty for supported items; write the JSON without indentation.

Return ONLY valid JSON:
{
  "success": true,
  "highlights": [{ "id": "exp-0#0", "verdict": "supported", "reason": "" }],
  "statements": [{ "id": "summary", "verdict": "inflated", "reason": "...", "claims": [{ "claim": "...", "supportedBy": "exact text from one fact, or null", "verdict": "supported" }] }]
}`,

      'answer-writer': `You are the Application Answer Writer of FITCV.

A job application asks the candidate some questions. Write the candidate's answers using ONLY the facts in their verified record. You answer on the candidate's behalf, so write in first person, as they would, in the language of each question.

INPUT DATA:
${inputJson}

"facts" is the verified record. "job" is the offer, when known. Each item in "questions" has an "id", the question "text", a "kind" and an optional "maxLength" in characters.

By kind:
- "experience": answer with concrete facts from the record that genuinely address the question. If the record contains nothing that answers it, do not stretch unrelated experience to fit: return "answerable": false.
- "capability": the question asks whether the candidate has something. If the record genuinely shows it, return "answerable": true and, as text, one sentence citing the fact that proves it. If it does not, return "answerable": false. Never infer a yes beyond what the record states.
- "motivation": write a short, sincere answer (2 to 4 sentences) connecting the candidate's real experience to what the offer asks for. It can be sent without further review, so every statement about the candidate must come from the record and every statement about the role or the company must come from the job text. You may express interest in the role ("me interesa", "quiero aportar mi experiencia"). Do not invent personal reasons, feelings, values or knowledge of the company beyond the job text.

Hard rules:
- Never state a fact, figure, technology, employer, date, scope or result that is not in the record.
- Never claim ownership or leadership the record does not state.
- Never mention salary, availability, relocation, visas, or anything personal the record does not contain.
- Never mention being unemployed, looking for a job, having been laid off or dismissed, gaps between jobs, or why the candidate left any job, even if the record suggests it.
- Never say or imply the candidate currently works somewhere unless the record's most recent role is ongoing (no end date, or "present").
- Respect maxLength when given.
- Everything you write is checked against the record by an independent verifier, and answers it cannot support are discarded.

Return ONLY valid JSON:
{
  "success": true,
  "answers": [{ "id": "...", "answerable": true, "text": "..." }]
}`,

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
