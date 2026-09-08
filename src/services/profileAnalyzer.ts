import axios from 'axios';
import { env } from '../env.js';
import { logger } from './logger.js';

export interface ProfileAnalysisResult {
  fullName: string;
  yearsExperience: number;
  education: string[];
  skills: string[];
  industries: string[];
  summary: string;
}

export interface SuggestedRole {
  title: string;
  level: string; // L1-L6
  matchScore: number;
  description: string;
}

export class ProfileAnalyzerService {
  private static getAnalysisPrompt(cvContent: string): string {
    return `Analiza el siguiente CV y extrae información estructurada sobre el perfil del candidato.

CV:
${cvContent}

TAREA: Proporciona un análisis JSON con:
1. fullName: Nombre completo
2. yearsExperience: Años totales de experiencia
3. education: Array de grados/certifications
4. skills: Array de top 15 skills identificados
5. industries: Array de industrias donde ha trabajado
6. summary: Resumen de 2-3 líneas del perfil

RESPUESTA EN JSON VÁLIDO:
{
  "fullName": "Nombre",
  "yearsExperience": 8,
  "education": ["degree1", "degree2"],
  "skills": ["skill1", "skill2", ...],
  "industries": ["industry1", "industry2"],
  "summary": "Breve resumen del candidato"
}
`;
  }

  private static getRolesPrompt(profile: ProfileAnalysisResult): string {
    return `Basado en el perfil del candidato, sugiere 5 roles donde sería competitivo.

PERFIL:
- Nombre: ${profile.fullName}
- Años de experiencia: ${profile.yearsExperience}
- Educación: ${profile.education.join(', ')}
- Skills: ${profile.skills.join(', ')}
- Industrias: ${profile.industries.join(', ')}
- Resumen: ${profile.summary}

TAREA: Sugiere roles realistas en LATAM (Chile principalmente), considerando:
1. Roles que matchean su experiencia actual
2. Roles potenciales con un poco de growth
3. Niveles apropiados (L1=junior, L2=junior+, L3=mid, L4=mid+, L5=senior, L6=lead)

RESPUESTA EN JSON:
{
  "roles": [
    {
      "title": "Título del rol",
      "level": "L3",
      "matchScore": 85,
      "description": "Por qué este rol encaja"
    }
  ]
}
`;
  }

  static async analyzeProfile(cvContent: string): Promise<ProfileAnalysisResult> {
    try {
      logger.info('Starting profile analysis');

      // ✅ Llamar a Claude API
      const response = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 1000,
          messages: [
            {
              role: 'user',
              content: this.getAnalysisPrompt(cvContent)
            }
          ]
        },
        {
          headers: {
            'x-api-key': env.CLAUDE_API_KEY,
            'anthropic-version': '2023-06-01'
          }
        }
      );

      const content = response.data.content[0].text;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found');
      }

      return JSON.parse(jsonMatch[0]);
    } catch (error) {
      logger.error('Profile analysis failed', {error: String(error)});

      return {
        fullName: 'Candidato',
        yearsExperience: 5,
        education: ['Educación no especificada'],
        skills: ['Analysis', 'Problem-solving', 'Communication'],
        industries: ['Technology'],
        summary: 'Perfil profesional. Análisis automático no disponible.'
      };
    }
  }

  static async suggestRoles(profile: ProfileAnalysisResult): Promise<SuggestedRole[]> {
    try {
      logger.info('Generating role suggestions');

      const response = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 1000,
          messages: [
            {
              role: 'user',
              content: this.getRolesPrompt(profile)
            }
          ]
        },
        {
          headers: {
            'x-api-key': env.CLAUDE_API_KEY,
            'anthropic-version': '2023-06-01'
          }
        }
      );

      const content = response.data.content[0].text;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found');
      }

      const result = JSON.parse(jsonMatch[0]);
      return result.roles || [];
    } catch (error) {
      logger.error('Role suggestion failed', {error: String(error)});

      // Retornar roles genéricos como fallback
      return [
        {
          title: 'Data Analyst',
          level: 'L3',
          matchScore: 65,
          description: 'Entry-level data analysis role'
        }
      ];
    }
  }
}
