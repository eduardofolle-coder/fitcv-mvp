import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { db } from '../db/client.js';
import { EncryptionService } from '../services/encryption.js';
import { AgentInvokerService } from '../services/agentInvoker.js';
import { SEED_OFFERS } from '../db/seedData.js';
import { safeJsonParse } from '../utils/safeJson.js';

const router = Router();

// ✅ GET /api/offers - Listar ofertas (con filtros)
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req: any, res: any) => {
    const {
      page = 1,
      limit = 20,
      level,
      company,
      location,
      minSalary,
      maxSalary,
      search
    } = req.query;

    // ✅ MVP: Use seed data directly (bypass DB for reliability)
    // Seed offers count: 5 (Amazon, Cornershop, Despegar, NotCo, Banco Estado)
    let offers = [...SEED_OFFERS];

    // ✅ Apply filters
    if (level) {
      offers = offers.filter(o => o.level === level);
    }

    if (company) {
      offers = offers.filter(o => o.company.toLowerCase().includes(company.toLowerCase()));
    }

    if (location) {
      offers = offers.filter(o => o.location?.toLowerCase().includes(location.toLowerCase()));
    }

    if (minSalary) {
      offers = offers.filter(o => o.salaryMin >= Number(minSalary));
    }

    if (maxSalary) {
      offers = offers.filter(o => o.salaryMax <= Number(maxSalary));
    }

    if (search) {
      offers = offers.filter(o =>
        o.title.toLowerCase().includes(search.toLowerCase()) ||
        o.description.toLowerCase().includes(search.toLowerCase())
      );
    }

    const count = offers.length;

    // ✅ Paginate
    const pageNum = Number(page);
    const limitNum = Number(limit);
    const offset = (pageNum - 1) * limitNum;
    const paginatedOffers = offers.slice(offset, offset + limitNum);

    res.json({
      success: true,
      data: paginatedOffers.map((o: any) => ({
        ...o,
        requirements: safeJsonParse(o.requirements, [])
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: count,
        totalPages: Math.ceil(count / limitNum)
      }
    });
  })
);

// ✅ GET /api/offers/stats - Estadísticas de búsqueda
router.get(
  '/stats/summary',
  requireAuth,
  asyncHandler(async (req: any, res: any) => {
    // ✅ MVP: Use seed data directly
    const totalOffers = SEED_OFFERS.length;

    // ✅ Por nivel
    const byLevel = Object.entries(
      SEED_OFFERS.reduce((acc, o) => {
        acc[o.level] = (acc[o.level] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    ).map(([level, count]) => ({ level, count }));

    // ✅ Por empresa
    const byCompany = Object.entries(
      SEED_OFFERS.reduce((acc, o) => {
        acc[o.company] = (acc[o.company] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([company, count]) => ({ company, count }));

    // ✅ Por usuario
    const userPostsStmt = db.prepare(`
      SELECT COUNT(*) as count FROM postulations WHERE userId = ?
    `);
    userPostsStmt.bind([req.user.id]);
    const hasUserResults = userPostsStmt.step();
    const userCount = hasUserResults ? userPostsStmt.getAsObject() : { count: 0 };
    userPostsStmt.free();
    const userPostulations = userCount.count || 0;

    res.json({
      success: true,
      data: {
        totalOffers,
        byLevel,
        topCompanies: byCompany,
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
    const profileStmt = db.prepare(`
      SELECT cvOriginalContent FROM candidate_profiles WHERE userId = ? LIMIT 1
    `);
    profileStmt.bind([req.user.id]);
    const hasProfile = profileStmt.step();
    const profile = hasProfile ? profileStmt.getAsObject() : null;
    profileStmt.free();

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

    const stmt = db.prepare('SELECT * FROM offers WHERE id = ? LIMIT 1');
    stmt.bind([id]);
    const hasOffer = stmt.step();
    const offer = hasOffer ? stmt.getAsObject() : null;
    stmt.free();

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
