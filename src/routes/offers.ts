import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { db } from '../db/client.js';
import { EncryptionService } from '../services/encryption.js';
import { AgentInvokerService } from '../services/agentInvoker.js';
import { SEED_OFFERS } from '../db/seedData.js';
import { safeJsonParse } from '../utils/safeJson.js';
import rateLimit from 'express-rate-limit';
import { loadMatchingProfile } from '../services/candidateProfile.js';
import { getCachedMatch, recomputeUserMatches } from '../services/matchCache.js';
import { isMatchTier, searchable } from '../services/offerMatching.js';
import { countByTier, rankOffersForProfile } from '../services/profileOffers.js';
import { runOfferAnalysis } from '../services/dailyAnalysis.js';
import { loadAnswerPreferences } from '../services/savedAnswers.js';
import { regionName, regionOf, regionVerdict, type RegionVerdict } from '../services/regions.js';

// Cada análisis puntúa miles de ofertas: se limita el "analizar ahora".
const analysisLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => req.user?.id || req.ip,
  message: { error: 'You have reached the limit of offer analyses for this hour.' },
});

const router = Router();

type Tier = 'alto' | 'medio' | 'bajo';
const countTiers = (tiers: Tier[]) =>
  tiers.reduce((acc, t) => ({ ...acc, [t]: acc[t] + 1 }), { alto: 0, medio: 0, bajo: 0 } as Record<Tier, number>);

/** Región de la oferta, para mostrarla y para saber si calza con dónde acepta trabajar el candidato. */
function regionFields(offer: { location?: string | null; remoteModality?: string | null }, verdict: RegionVerdict) {
  const code = regionOf(offer.location);
  return { region: code ? regionName(code) : null, regionVerdict: verdict };
}

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
    // Sin tildes: "logistica" encuentra "Logística".
    if (search) add(n => `COALESCE(searchText, LOWER(title)) LIKE $${n}`, likePattern(searchable(search)));
    if (Number.isFinite(minSalary) && req.query.minSalary !== undefined) add(n => `salaryMin >= $${n}`, minSalary);
    if (Number.isFinite(maxSalary) && req.query.maxSalary !== undefined) add(n => `salaryMax <= $${n}`, maxSalary);

    const limitNum = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const pageNum = Math.max(Number(req.query.page) || 1, 1);

    // Ofertas del perfil del candidato, de la más afín a la menos.
    if (req.query.match === 'profile') {
      const profile = await loadMatchingProfile(req.user.id);
      const empty = { page: pageNum, limit: limitNum, total: 0, totalPages: 0 };
      if (!profile) {
        return res.json({
          success: true,
          data: [],
          needsProfile: true,
          profileTerms: [],
          tierCounts: { alto: 0, medio: 0, bajo: 0 },
          pagination: empty,
        });
      }

      const tier = isMatchTier(req.query.tier) ? req.query.tier : null;
      // Por defecto se muestra solo donde el candidato acepta trabajar; ?regions=all muestra todo.
      const prefs = await loadAnswerPreferences(req.user.id);
      const regionFilterActive = Boolean(prefs.workRegions?.length) || !prefs.acceptRemote;
      const showOutside = req.query.regions === 'all';

      // Camino rápido: la vista por defecto (sin filtros de empresa/búsqueda/
      // sueldo) se sirve de la caché precalculada en background — un SELECT, no
      // los ~50s de puntuar todo en vivo. `where` arranca con el filtro de
      // vigencia, así que el indicador de "sin filtros del usuario" es params.
      if (params.length === 0) {
        const cache = await getCachedMatch(req.user.id);
        if (cache) {
          const verdicts = new Map<string, RegionVerdict>();
          if (regionFilterActive && cache.ranked.length) {
            const places = (await db.query<any>('SELECT id, location, remoteModality FROM offers WHERE id = ANY($1)', [cache.ranked.map(r => r.offerId)])).rows;
            for (const place of places) verdicts.set(place.id, regionVerdict(place, prefs));
          }
          const verdictOf = (id: string): RegionVerdict => verdicts.get(id) ?? 'dentro';
          const outside = cache.ranked.filter(r => verdictOf(r.offerId) === 'fuera').length;
          const visible = showOutside ? cache.ranked : cache.ranked.filter(r => verdictOf(r.offerId) !== 'fuera');
          const list = tier ? visible.filter(r => r.tier === tier) : visible;
          const pageRanked = list.slice((pageNum - 1) * limitNum, pageNum * limitNum);
          const ids = pageRanked.map(r => r.offerId);
          const rows = ids.length
            ? (await db.query('SELECT * FROM offers WHERE id = ANY($1)', [ids])).rows
            : [];
          const byId = new Map(rows.map((o: any) => [o.id, o]));
          return res.json({
            success: true,
            data: pageRanked.flatMap(r => {
              const o = byId.get(r.offerId);
              return o ? [{ ...o, ...regionFields(o, verdictOf(r.offerId)), requirements: safeJsonParse(o.requirements, []), match: { score: r.score, tier: r.tier, reasons: r.reasons } }] : [];
            }),
            profileTerms: profile.terms.slice(0, 8).map(t => t.display),
            tierCounts: countTiers(visible.map(r => r.tier as Tier)),
            regionFilter: { active: regionFilterActive, outside, showingOutside: showOutside },
            pagination: { page: pageNum, limit: limitNum, total: list.length, totalPages: Math.ceil(list.length / limitNum) },
          });
        }
        // Sin caché todavía (perfil nuevo o recién cambiado): se calienta para la
        // próxima y esta vez se responde en vivo, lento, una sola vez.
        void recomputeUserMatches(req.user.id);
      }

      const allRanked = await rankOffersForProfile(profile, where, params);
      const verdictOf = (offer: any): RegionVerdict => (regionFilterActive ? regionVerdict(offer, prefs) : 'dentro');
      const outside = allRanked.filter(item => verdictOf(item.offer) === 'fuera').length;
      const ranked = showOutside ? allRanked : allRanked.filter(item => verdictOf(item.offer) !== 'fuera');
      const shown = tier ? ranked.filter(item => item.match.tier === tier) : ranked;

      const total = shown.length;
      const pageItems = shown.slice((pageNum - 1) * limitNum, pageNum * limitNum);

      return res.json({
        success: true,
        data: pageItems.map(({ offer, match }) => ({
          ...offer,
          ...regionFields(offer, verdictOf(offer)),
          requirements: safeJsonParse(offer.requirements, []),
          match: { score: match.score, tier: match.tier, reasons: match.reasons },
        })),
        profileTerms: profile.terms.slice(0, 8).map(t => t.display),
        // Los totales por calce son de todas las afines, sin el filtro de calce.
        tierCounts: countByTier(ranked),
        regionFilter: { active: regionFilterActive, outside, showingOutside: showOutside },
        pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
      });
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

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

// POST /api/offers/analysis/run - Correr ahora el análisis de ofertas del perfil
router.post(
  '/analysis/run',
  requireAuth,
  analysisLimiter,
  asyncHandler(async (req: any, res: any) => {
    const digest = await runOfferAnalysis(req.user.id);
    if (!digest) {
      throw new AppError(409, 'Upload your CV first so FITCV can analyse offers for your profile.');
    }
    res.json({ success: true, data: digest });
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
