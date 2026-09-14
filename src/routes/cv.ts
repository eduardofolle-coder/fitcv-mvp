import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/client.js';
import { EncryptionService } from '../services/encryption.js';
import { ProfileAnalyzerService, type ProfileAnalysisResult } from '../services/profileAnalyzer.js';
import { AgentInvokerService } from '../services/agentInvoker.js';
import { normalizeExperience, normalizeLanguages, normalizeCertifications } from '../services/cvComposer.js';
import rateLimit from 'express-rate-limit';

const router = Router();

// Las columnas JSON pueden venir nulas o corruptas de perfiles antiguos; un
// JSON.parse directo tumbaba la request entera.
function safeParse<T>(value: any, fallback: T): T {
  if (typeof value !== 'string' || value.length === 0) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function flattenSkills(raw: any): string[] {
  if (Array.isArray(raw)) return raw.filter(s => typeof s === 'string');
  if (raw && typeof raw === 'object') {
    return Object.values(raw)
      .flat()
      .filter((s): s is string => typeof s === 'string');
  }
  return [];
}

// ✅ Rate limiting por usuario: cada subida cuesta una llamada al modelo.
// El límite anterior de 5/hora lo alcanzaba cualquiera corrigiendo su CV, y
// respondía sin campo `error`, así que el frontend mostraba "Request failed
// (429)" en vez de explicar qué pasó.
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => req.user?.id || req.ip,
  message: {
    error: 'You have reached the CV analysis limit for this hour. Please try again later.'
  }
});

// ✅ POST /api/cv/upload
router.post(
  '/upload',
  requireAuth,
  uploadLimiter,
  asyncHandler(async (req: any, res: any) => {
    const { cvContent, fullName } = req.body;

    if (!cvContent || cvContent.length < 50) {
      throw new AppError(400, 'CV content is required and must be at least 50 characters');
    }

    // ✅ Encriptar CV
    const encryptedCV = EncryptionService.encrypt(cvContent);

    // ✅ Analizar perfil con Agent
    const agentResult = await AgentInvokerService.invoke('cv-analyzer', { cvText: cvContent }, req.user.id);

    if (!agentResult.success || !agentResult.output) {
      // El motivo importa: truncado, ilegible o rechazo del modelo son cosas
      // distintas, y un 'Failed to analyze CV' pelado no permite distinguirlas.
      throw new AppError(502, `Could not analyze the CV: ${agentResult.error ?? 'the AI returned an unusable response'}`);
    }

    const profile = agentResult.output.profile || agentResult.output;

    // El agente puede omitir secciones si el CV no las trae; se normaliza para
    // que el guardado y el JSON.parse posterior no dependan de su forma exacta.
    const education = Array.isArray(profile.education) ? profile.education : [];
    const skills = profile.skills ?? {};
    const yearsExperience = Number.isFinite(profile.yearsExperience)
      ? profile.yearsExperience
      : 0;

    // Datos duros: el adaptador los copia tal cual en cada CV que arma.
    const experience = normalizeExperience(profile.experience);
    const languages = normalizeLanguages(profile.languages);
    const certifications = normalizeCertifications(profile.certifications);
    const contactInfo = EncryptionService.encrypt(JSON.stringify({
      email: typeof profile.email === 'string' ? profile.email : '',
      phone: typeof profile.phone === 'string' ? profile.phone : '',
      location: typeof profile.location === 'string' ? profile.location : '',
    }));

    // ✅ Guardar en BD. userId es UNIQUE: volver a subir el CV debe reemplazar
    // el perfil existente, no fallar con un constraint error.
    const existing = await db.queryOne<{ id: string }>(
      'SELECT id FROM candidate_profiles WHERE userId = $1 LIMIT 1',
      [req.user.id]
    );
    const profileId = existing?.id ?? uuidv4();

    await db.query(`
      INSERT INTO candidate_profiles (
        id, userId, fullName, yearsExperience, education, skills, summary, cvOriginalContent,
        experience, languages, certifications, contactInfo, createdAt, updatedAt
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(userId) DO UPDATE SET
        fullName = excluded.fullName,
        yearsExperience = excluded.yearsExperience,
        education = excluded.education,
        skills = excluded.skills,
        summary = excluded.summary,
        cvOriginalContent = excluded.cvOriginalContent,
        experience = excluded.experience,
        languages = excluded.languages,
        certifications = excluded.certifications,
        contactInfo = excluded.contactInfo,
        updatedAt = CURRENT_TIMESTAMP
    `, [
      profileId,
      req.user.id,
      fullName || profile.fullName || null,
      yearsExperience,
      JSON.stringify(education),
      JSON.stringify(skills),
      profile.summary || null,
      encryptedCV,
      JSON.stringify(experience),
      JSON.stringify(languages),
      JSON.stringify(certifications),
      contactInfo
    ]);

    res.json({
      success: true,
      data: {
        profileId,
        profile: {
          fullName: fullName || profile.fullName || null,
          yearsExperience,
          education,
          skills,
          summary: profile.summary || null
        }
      }
    });
  })
);

// ✅ GET /api/cv/profile
router.get(
  '/profile',
  requireAuth,
  asyncHandler(async (req: any, res: any) => {
    const profile = await db.queryOne<any>(`
      SELECT id, fullName, yearsExperience, education, skills, summary, createdAt
      FROM candidate_profiles
      WHERE userId = $1
      LIMIT 1
    `, [req.user.id]);

    if (!profile) {
      throw new AppError(404, 'Profile not found. Please upload your CV first.');
    }

    res.json({
      success: true,
      data: {
        ...profile,
        education: safeParse(profile.education, []),
        skills: safeParse(profile.skills, {})
      }
    });
  })
);

// ✅ POST /api/cv/suggest-roles
router.post(
  '/suggest-roles',
  requireAuth,
  asyncHandler(async (req: any, res: any) => {
    const profile = await db.queryOne(`
      SELECT * FROM candidate_profiles WHERE userId = $1 LIMIT 1
    `, [req.user.id]);

    if (!profile) {
      throw new AppError(404, 'Profile not found');
    }

    // ✅ Generar sugerencias de roles
    const profileData: ProfileAnalysisResult = {
      fullName: profile.fullName,
      yearsExperience: profile.yearsExperience,
      education: safeParse(profile.education, []),
      // El agente agrupa skills por categoría ({programming:[], tools:[]}),
      // pero suggestRoles espera una lista plana.
      skills: flattenSkills(safeParse<any>(profile.skills, [])),
      industries: [],
      summary: profile.summary
    };

    const suggestedRoles = await ProfileAnalyzerService.suggestRoles(profileData);

    // ✅ Guardar roles sugeridos
    await Promise.all(suggestedRoles.map(role =>
      db.query(`
        INSERT INTO suggested_roles (id, userId, roleTitle, level, description, matchScore, isSelected, createdAt)
        VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
      `, [
        uuidv4(),
        req.user.id,
        role.title,
        role.level,
        role.description,
        role.matchScore,
        false
      ])
    ));

    res.json({
      success: true,
      data: suggestedRoles
    });
  })
);

// ✅ GET /api/cv/roles
router.get(
  '/roles',
  requireAuth,
  asyncHandler(async (req: any, res: any) => {
    const roles = (await db.query(`
      SELECT * FROM suggested_roles WHERE userId = $1 ORDER BY matchScore DESC
    `, [req.user.id])).rows;

    res.json({
      success: true,
      data: roles
    });
  })
);

// ✅ POST /api/cv/select-roles
router.post(
  '/select-roles',
  requireAuth,
  asyncHandler(async (req: any, res: any) => {
    const { roleIds } = req.body;

    if (!Array.isArray(roleIds) || roleIds.length === 0) {
      throw new AppError(400, 'At least one role must be selected');
    }

    // ✅ Actualizar roles seleccionados
    await Promise.all(roleIds.map((roleId: string) =>
      db.query(
        'UPDATE suggested_roles SET isSelected = TRUE WHERE id = $1 AND userId = $2',
        [roleId, req.user.id]
      )
    ));

    res.json({
      success: true,
      message: 'Roles selected successfully'
    });
  })
);

export default router;
