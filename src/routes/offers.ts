import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { db } from '../db/client.js';

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

    let query = 'SELECT * FROM offers WHERE 1=1';
    const params: any[] = [];

    if (level) {
      query += ' AND level = ?';
      params.push(level);
    }

    if (company) {
      query += ' AND company LIKE ?';
      params.push(`%${company}%`);
    }

    if (location) {
      query += ' AND location LIKE ?';
      params.push(`%${location}%`);
    }

    if (minSalary) {
      query += ' AND salaryMin >= ?';
      params.push(minSalary);
    }

    if (maxSalary) {
      query += ' AND salaryMax <= ?';
      params.push(maxSalary);
    }

    if (search) {
      query += ' AND (title LIKE ? OR description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    // ✅ Contar total
    const countStmt = db.prepare(query);
    const { count } = countStmt.get(...params) as any || { count: 0 };

    // ✅ Paginar
    query += ' ORDER BY createdAt DESC LIMIT ? OFFSET ?';
    params.push(limit, (page - 1) * limit);

    const stmt = db.prepare(query);
    const offers = stmt.all(...params);

    res.json({
      success: true,
      data: offers.map((o: any) => ({
        ...o,
        requirements: JSON.parse(o.requirements)
      })),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: count,
        totalPages: Math.ceil(count / limit)
      }
    });
  })
);

// ✅ GET /api/offers/:id - Obtener detalles de oferta
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req: any, res: any) => {
    const { id } = req.params;

    const stmt = db.prepare('SELECT * FROM offers WHERE id = ? LIMIT 1');
    const offer = stmt.get(id) as any;

    if (!offer) {
      throw new AppError(404, 'Job offer not found');
    }

    res.json({
      success: true,
      data: {
        ...offer,
        requirements: JSON.parse(offer.requirements)
      }
    });
  })
);

// ✅ GET /api/offers/stats - Estadísticas de búsqueda
router.get(
  '/stats/summary',
  requireAuth,
  asyncHandler(async (req: any, res: any) => {
    // ✅ Total ofertas
    const totalStmt = db.prepare('SELECT COUNT(*) as count FROM offers');
    const { count: totalOffers } = totalStmt.get() as any;

    // ✅ Por nivel
    const byLevelStmt = db.prepare(`
      SELECT level, COUNT(*) as count FROM offers GROUP BY level ORDER BY level
    `);
    const byLevel = byLevelStmt.all();

    // ✅ Por empresa
    const byCompanyStmt = db.prepare(`
      SELECT company, COUNT(*) as count FROM offers GROUP BY company ORDER BY count DESC LIMIT 5
    `);
    const topCompanies = byCompanyStmt.all();

    // ✅ Por usuario
    const userPostsStmt = db.prepare(`
      SELECT COUNT(*) as count FROM postulations WHERE userId = ?
    `);
    const { count: userPostulations } = userPostsStmt.get(req.user.id) as any;

    res.json({
      success: true,
      data: {
        totalOffers,
        byLevel,
        topCompanies,
        userPostulations,
        stats: {
          totalOffers,
          averageSalary: 0, // TODO: Calcular promedio
          topLocations: [] // TODO: Top locations
        }
      }
    });
  })
);

export default router;
