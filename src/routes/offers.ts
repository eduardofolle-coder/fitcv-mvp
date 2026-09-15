import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { db } from '../db/client.js';
import { EncryptionService } from '../services/encryption.js';
import { AgentInvokerService } from '../services/agentInvoker.js';
import { SEED_OFFERS } from '../db/seedData.js';
import { safeJsonParse } from '../utils/safeJson.js';

const router = Router();

// Escapa los comodines de LIKE para que un "%" tipeado se busque literal.
const likePattern = (value: string): string => `%${value.replace(/[\\%_]/g, m => `\\${m}`)}%`;

const textParam = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, 200) : null;

// ✅ GET /api/offers - Listar ofertas (con filtros)
// Las ofertas viven en la BD: las de ejemplo y las que traen las fuentes reales.
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req: any, res: any) => {
    // Una oferta vencida ya no recibe postulaciones: no se muestra.
    const where: string[] = ['(validThrough IS NULL OR validThrough > CURRENT_TIMESTAMP)'];
    const params: any[] = [];
    const add = (condition: (n: number) => string, value: unknown) => {
      params.push(value);
      where.push(condition(params.length));
    };

    const level = textParam(req.query.level);
    const company = textParam(req.query.company);
    const location = textParam(req.query.location);
    const source = textParam(req.query.source);
    const country = textParam(req.query.country);
    const search = textParam(req.query.search);
    const minSalary = Number(req.query.minSalary);
    const maxSalary = Number(req.query.maxSalary);

    if (level) add(n => `level = $${n}`, level);
    if (company) add(n => `company ILIKE $${n}`, likePattern(company));
    if (location) add(n => `location ILIKE $${n}`, likePattern(location));
    if (source) add(n => `source = $${n}`, source);
    if (country) add(n => `country = $${n}`, country.toUpperCase());
    if (search) add(n => `(title ILIKE $${n} OR description ILIKE $${n})`, likePattern(search));
    if (Number.isFinite(minSalary) && req.query.minSalary !== undefined) add(n => `salaryMin >= $${n}`, minSalary);
    if (Number.isFinite(maxSalary) && req.query.maxSalary !== undefined) add(n => `salaryMax <= $${n}`, maxSalary);

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const limitNum = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const pageNum = Math.max(Number(req.query.page) || 1, 1);

    const countRow = await db.queryOne<{ count: string }>(`SELECT COUNT(*) AS count FROM offers ${whereSql}`, params);
    const total = Number(countRow?.count ?? 0);

    const offers = (await db.query(`
      SELECT * FROM offers ${whereSql}
      ORDER BY publishedAt DESC NULLS LAST, createdAt DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `, [...params, limitNum, (pageNum - 1) * limitNum])).rows;

    res.json({
      success: true,
      data: offers.map((o: any) => ({
        ...o,
        requirements: safeJsonParse(o.requirements, [])
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  })
);

// ✅ GET /api/offers/stats - Estadísticas de búsqueda
router.get(
  '/stats/summary',
  requireAuth,
  asyncHandler(async (req: any, res: any) => {
    const totalRow = await db.queryOne<{ count: string }>('SELECT COUNT(*) AS count FROM offers');
    const totalOffers = Number(totalRow?.count ?? 0);

    const byLevel = (await db.query<{ level: string; count: string }>(
      'SELECT level, COUNT(*) AS count FROM offers GROUP BY level ORDER BY count DESC'
    )).rows.map(r => ({ level: r.level, count: Number(r.count) }));

    const bySource = (await db.query<{ source: string; count: string }>(
      `SELECT source, COUNT(*) AS count FROM offers
       WHERE validThrough IS NULL OR validThrough > CURRENT_TIMESTAMP
       GROUP BY source ORDER BY count DESC`
    )).rows.map(r => ({ source: r.source, count: Number(r.count) }));

    const topCompanies = (await db.query<{ company: string; count: string }>(
      'SELECT company, COUNT(*) AS count FROM offers GROUP BY company ORDER BY count DESC LIMIT 5'
    )).rows.map(r => ({ company: r.company, count: Number(r.count) }));

    const userCount = await db.queryOne<{ count: string }>(
      'SELECT COUNT(*) as count FROM postulations WHERE userId = $1',
      [req.user.id]
    );
    const userPostulations = Number(userCount?.count ?? 0);

    res.json({
      success: true,
      data: {
        totalOffers,
        byLevel,
        bySource,
        topCompanies,
        userPostulations,
        stats: {
          totalOffers,
          averageSalary: 0,
          topLocations: []
        }
      }
    });
  })
);

// ✅ GET /api/offers/ranked - Rankear ofertas según perfil
router.get(
  '/ranked',
  requireAuth,
  asyncHandler(async (req: any, res: any) => {
    // ✅ Obtener CV del usuario
    const profile = await db.queryOne(`
      SELECT cvOriginalContent FROM candidate_profiles WHERE userId = $1 LIMIT 1
    `, [req.user.id]);

    if (!profile) {
      throw new AppError(404, 'Profile not found. Please upload your CV first.');
    }

    // ✅ Desencriptar CV
    const cvContent = EncryptionService.decrypt(profile.cvOriginalContent);

    // ✅ Usar seed offers (5 offers disponibles)
    const offersForRanking = SEED_OFFERS.map((o, i) => ({
      id: o.id,
      index: i + 1,
      title: o.title,
      company: o.company,
      description: o.description,
      level: o.level,
      salary: `${o.salaryMin}-${o.salaryMax}`,
      location: o.location
    }));

    // ✅ Invocar agent de ranking
    const agentResult = await AgentInvokerService.invoke('offer-ranker', {
      cvText: cvContent,
      offers: offersForRanking
    }, req.user.id);

    if (!agentResult.success || !agentResult.output) {
      throw new AppError(500, 'Failed to rank offers');
    }

    const rankings = agentResult.output.rankings || agentResult.output;

    res.json({
      success: true,
      data: {
        rankings,
        candidateSummary: agentResult.output.candidateSummary
      }
    });
  })
);

// ✅ GET /api/offers/:id - Obtener detalles de oferta
// Debe declararse al final: '/:id' also matches literal paths like '/ranked'.
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req: any, res: any) => {
    const { id } = req.params;

    const offer = await db.queryOne('SELECT * FROM offers WHERE id = $1 LIMIT 1', [id]);

    if (!offer) {
      throw new AppError(404, 'Job offer not found');
    }

    res.json({
      success: true,
      data: {
        ...offer,
        requirements: safeJsonParse(offer.requirements, [])
      }
    });
  })
);

export default router;
