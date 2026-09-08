import axios from 'axios';
import { env } from '../env.js';
import { logger } from './logger.js';

export interface CVAdaptationInput {
  originalCV: string; // Text content of CV
  jobOffer: string; // Job offer description
  jobTitle: string;
  company: string;
}

export interface CVAdaptationResult {
  adaptedCV: string; // HTML format
  atsScore: number;
  changes: string[];
  keywords: string[];
}

export class CVAdapterService {
  // ✅ Prompt seguro para Claude API (no inventa datos)
  private static getAdaptationPrompt(input: CVAdaptationInput): string {
    return `Eres un experto en adaptación de CVs. Tu tarea es adaptar el siguiente CV para una oferta laboral específica.

REGLA CRÍTICA: NUNCA inventes experiencia, educación o habilidades que no estén en el CV original. Solo reorganiza, reescribe y enfatiza lo que ya existe de manera que se alinee mejor con la oferta.

CV ORIGINAL:
${input.originalCV}

OFERTA LABORAL:
Posición: ${input.jobTitle}
Empresa: ${input.company}
Descripción: ${input.jobOffer}

TAREAS:
1. Reorganiza el CV para que sea más relevante para esta oferta específica
2. Enfatiza las experiencias que mejor matchean con los requisitos
3. Reescribe los bullets de experience para que usen keywords de la oferta
4. Identifica qué cambios principales hiciste
5. Extrae los top 10 keywords que te ayudaron a adaptar

RESPUESTA EN JSON (válido):
{
  "adaptedCV": "CV reescrito en texto plano (prepara para convertir a HTML después)",
  "atsScore": número entre 0-100 indicando cuán bien el CV matchea la oferta,
  "changes": ["cambio 1", "cambio 2", ...],
  "keywords": ["keyword1", "keyword2", ...]
}

IMPORTANTE:
- atsScore debe ser realista (no siempre 95+)
- Changes deben ser específicos (ej: "Enfatizó experiencia en Python" no "Cambió CV")
- Nunca inventes datos
- Solo adapta lo existente
`;
  }

  static async adaptCV(input: CVAdaptationInput): Promise<CVAdaptationResult> {
    try {
      logger.info('Starting CV adaptation', {
        jobTitle: input.jobTitle,
        company: input.company
      });

      // ✅ Llamar a Claude API
      const response = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 2000,
          messages: [
            {
              role: 'user',
              content: this.getAdaptationPrompt(input)
            }
          ]
        },
        {
          headers: {
            'x-api-key': env.CLAUDE_API_KEY,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
          }
        }
      );

      // ✅ Parsear respuesta
      const content = response.data.content[0].text;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const result = JSON.parse(jsonMatch[0]);

      return {
        adaptedCV: result.adaptedCV,
        atsScore: Math.min(100, Math.max(0, result.atsScore || 50)),
        changes: result.changes || [],
        keywords: result.keywords || []
      };
    } catch (error) {
      logger.error('CV adaptation failed', {error: String(error)});

      // ✅ Fallback a DeepSeek si Claude falla
      return this.adaptCVFallback(input);
    }
  }

  // ✅ Fallback alternativo (no implementado aún, retorna mock)
  private static async adaptCVFallback(input: CVAdaptationInput): Promise<CVAdaptationResult> {
    logger.warn('Using fallback CV adaptation');

    return {
      adaptedCV: input.originalCV, // Retorna CV original como fallback
      atsScore: 45,
      changes: ['API temporarily unavailable, returning original CV'],
      keywords: ['fallback', 'error', 'retry-later']
    };
  }
}
