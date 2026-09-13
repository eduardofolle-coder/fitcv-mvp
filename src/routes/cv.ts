import { Router } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/client.js';
import { EncryptionService } from '../services/encryption.js';
import { ProfileAnalyzerService, type ProfileAnalysisResult } from '../services/profileAnalyzer.js';
import { AgentInvokerService } from '../services/agentInvoker.js';
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

// ✅ Rate limiting: máximo 5 uploads por hora
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyGenerator: (req: any) => req.user?.id || req.ip
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
      throw new AppError(500, 'Failed to analyze CV');
    }

    const profile = agentResult.output.profile || agentResult.output;

    // El agente puede omitir secciones si el CV no las trae; se normaliza para
    // que el guardado y el JSON.parse posterior no dependan de su forma exacta.
    const education = Array.isArray(profile.education) ? profile.education : [];
    const skills = profile.skills ?? {};
    const yearsExperience = Number.isFinite(profile.yearsExperience)
      ? profile.yearsExperience
      : 0;

    // ✅ Guardar en BD. userId es UNIQUE: volver a subir el CV debe reemplazar
    // el perfil existente, no fallar con un constraint error.
    const existingStmt = db.prepare('SELECT id FROM candidate_profiles WHERE userId = ? LIMIT 1');
    existingStmt.bind([req.user.id]);
    const hasExisting = existingStmt.step();
    const profileId = hasExisting ? existingStmt.getAsObject().id : uuidv4();
    existingStmt.free();

    const stmt = db.prepare(`
      INSERT INTO candidate_profiles (
        id, userId, fullName, yearsExperience, education, skills, summary, cvOriginalContent, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(userId) DO UPDATE SET
        fullName = excluded.fullName,
        yearsExperience = excluded.yearsExperience,
        education = excluded.education,
        skills = excluded.skills,
        summary = excluded.summary,
        cvOriginalContent = excluded.cvOriginalContent,
        updatedAt = CURRENT_TIMESTAMP
    `);

    stmt.bind([
      profileId,
      req.user.id,
      fullName || profile.fullName || null,
      yearsExperience,
      JSON.stringify(education),
      JSON.stringify(skills),
      profile.summary || null,
      encryptedCV
    ]);
    stmt.step();
    stmt.free();

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
    const stmt = db.prepare(`
      SELECT id, fullName, yearsExperience, education, skills, summary, createdAt
      FROM candidate_profiles
      WHERE userId = ?
      LIMIT 1
    `);

    stmt.bind([req.user.id]);
    const hasProfile = stmt.step();
    const profile = hasProfile ? stmt.getAsObject() : null;
    stmt.free();

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
    const stmt = db.prepare(`
      SELECT * FROM candidate_profiles WHERE userId = ? LIMIT 1
    `);

    stmt.bind([req.user.id]);
    const hasProfile = stmt.step();
    const profile = hasProfile ? stmt.getAsObject() : null;
    stmt.free();

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
    suggestedRoles.forEach(role => {
      const insertStmt = db.prepare(`
        INSERT INTO suggested_roles (id, userId, roleTitle, level, description, matchScore, isSelected, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `);

      insertStmt.bind([
        uuidv4(),
        req.user.id,
        role.title,
        role.level,
        role.description,
        role.matchScore,
        false
      ]);
      insertStmt.step();
      insertStmt.free();
    });

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
    const stmt = db.prepare(`
      SELECT * FROM suggested_roles WHERE userId = ? ORDER BY matchScore DESC
    `);

    stmt.bind([req.user.id]);
    const roles: any[] = [];
    while (stmt.step()) {
      roles.push(stmt.getAsObject());
    }
    stmt.free();

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
    roleIds.forEach(roleId => {
      const stmt = db.prepare(`
        UPDATE suggested_roles SET isSelected = 1 WHERE id = ? AND userId = ?
      `);
      stmt.bind([roleId, req.user.id]);
      stmt.step();
      stmt.free();
    });

    res.json({
      success: true,
      message: 'Roles selected successfully'
    });
  })
);

export default router;
