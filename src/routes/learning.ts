/**
 * Learning Routes - Continuous Learning & Memory System
 *
 * - POST /api/learning/record-adaptation - Store successful CV adaptation
 * - POST /api/learning/record-outcome - Track postulation outcome
 * - GET /api/learning/top-keywords - Get user's top keywords by success
 * - GET /api/learning/patterns - Get successful patterns
 * - GET /api/learning/skill-growth - Track skill growth over time
 * - GET /api/learning/recommendations - Get personalized recommendations
 * - GET /api/learning/market-trends - Get market-wide trends
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { db } from '../db/client.js';
import { logger } from '../services/logger.js';
import { safeJsonParse } from '../utils/safeJson.js';

const router = Router();

/**
 * POST /api/learning/record-adaptation
 * Record a successful CV adaptation for learning
 */
router.post(
  '/record-adaptation',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { jobTitle, company, atsScore, keywords, cvChanges } = req.body;

    if (!jobTitle || !company || atsScore === undefined) {
      return res.status(400).json({
        success: false,
        error: 'jobTitle, company, and atsScore are required',
      });
    }

    try {
      const adaptationId = `adapt-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      await db.query(`
        INSERT INTO successful_adaptations (id, userId, jobTitle, company, atsScore, keywords, cvChanges, createdAt)
        VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
      `, [
        adaptationId,
        userId,
        jobTitle,
        company,
        atsScore,
        JSON.stringify(keywords || []),
        JSON.stringify(cvChanges || []),
      ]);

      logger.info('Adaptation recorded', { userId, adaptationId, company, atsScore });

      res.json({
        success: true,
        data: { adaptationId },
        message: `Adaptation for ${company} recorded with ATS score ${atsScore}`,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('Failed to record adaptation', { userId, error: errorMsg });
      res.status(500).json({ success: false, error: 'Failed to record adaptation' });
    }
  })
);

/**
 * POST /api/learning/record-outcome
 * Record postulation outcome (interview, offer, rejection, unknown)
 */
router.post(
  '/record-outcome',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { adaptationId, outcome, feedback } = req.body;

    if (!adaptationId || !outcome) {
      return res.status(400).json({
        success: false,
        error: 'adaptationId and outcome are required',
      });
    }

    if (!['interview', 'offer', 'rejection', 'unknown'].includes(outcome)) {
      return res.status(400).json({
        success: false,
        error: 'outcome must be one of: interview, offer, rejection, unknown',
      });
    }

    try {
      await db.query(`
        INSERT INTO application_outcomes (id, adaptationId, userId, outcome, feedback, createdAt)
        VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
      `, [
        `outcome-${Date.now()}`,
        adaptationId,
        userId,
        outcome,
        feedback || null,
      ]);

      logger.info('Outcome recorded', { userId, adaptationId, outcome });

      res.json({
        success: true,
        outcome,
        message: `Great! We recorded: ${outcome}`,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('Failed to record outcome', { userId, error: errorMsg });
      res.status(500).json({ success: false, error: 'Failed to record outcome' });
    }
  })
);

/**
 * GET /api/learning/top-keywords
 * Get user's top keywords by success rate
 */
router.get(
  '/top-keywords',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user.id;

    try {
      const rows = (await db.query<any>(`
        SELECT keywords, atsScore
        FROM successful_adaptations
        WHERE userId = $1
        ORDER BY atsScore DESC
        LIMIT 10
      `, [userId])).rows;

      // Aggregate keywords
      const keywordMap = new Map<string, number>();
      rows.forEach(row => {
        try {
          const keywords = safeJsonParse<string[]>(row.keywords, []);
          keywords.forEach((k: string) => {
            keywordMap.set(k, (keywordMap.get(k) || 0) + (row.atsScore || 0));
          });
        } catch (e) {
          // Skip parse errors
        }
      });

      const topKeywords = Array.from(keywordMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([keyword]) => keyword);

      logger.info('Top keywords retrieved', { userId, count: topKeywords.length });

      res.json({
        success: true,
        data: { keywords: topKeywords },
        message: `Your top ${topKeywords.length} keywords across successful adaptations`,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('Failed to get top keywords', { userId, error: errorMsg });
      res.status(500).json({ success: false, error: 'Failed to get top keywords' });
    }
  })
);

/**
 * GET /api/learning/patterns
 * Get successful patterns (top companies, roles)
 */
router.get(
  '/patterns',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user.id;

    try {
      // Get all successful adaptations with positive outcomes
      // atsScore se agrega con MAX: al agrupar por empresa y cargo, la fila
      // representa la mejor adaptación de ese grupo. Antes se seleccionaba sin
      // agregar, y SQLite devolvía un valor cualquiera del grupo.
      const rows: any[] = (await db.query(`
        SELECT sa.jobTitle, sa.company, MAX(sa.atsScore) as atsScore, COUNT(ao.id) as outcomeCount
        FROM successful_adaptations sa
        LEFT JOIN application_outcomes ao ON sa.id = ao.adaptationId
        WHERE sa.userId = $1
        GROUP BY sa.company, sa.jobTitle
        ORDER BY atsScore DESC
        LIMIT 20
      `, [userId])).rows;

      const companies = new Set<string>();
      const roles = new Set<string>();
      let totalScore = 0;

      rows.forEach(row => {
        companies.add(row.company);
        roles.add(row.jobTitle);
        totalScore += row.atsScore || 0;
      });

      const avgScore = rows.length > 0 ? totalScore / rows.length : 0;

      logger.info('Patterns retrieved', { userId, companies: companies.size, roles: roles.size });

      res.json({
        success: true,
        data: {
          topCompanies: Array.from(companies),
          topJobTitles: Array.from(roles),
          averageScore: Math.round(avgScore * 100) / 100,
          totalAdaptations: rows.length,
        },
        message: `Found patterns across ${rows.length} successful adaptations`,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('Failed to get patterns', { userId, error: errorMsg });
      res.status(500).json({ success: false, error: 'Failed to get patterns' });
    }
  })
);

/**
 * GET /api/learning/skill-growth
 * Track skill growth over time
 */
router.get(
  '/skill-growth',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user.id;

    try {
      const rows: any[] = (await db.query(`
        SELECT keywords, atsScore, createdAt
        FROM successful_adaptations
        WHERE userId = $1
        ORDER BY createdAt DESC
        LIMIT 30
      `, [userId])).rows;

      // Categorize skills by recency and frequency
      const allSkills = new Set<string>();
      const recentSkills = new Set<string>();
      const strengthenedSkills = new Set<string>();

      rows.forEach((row, idx) => {
        try {
          const keywords = safeJsonParse<string[]>(row.keywords, []);
          keywords.forEach((k: string) => {
            allSkills.add(k);
            if (idx < 10) recentSkills.add(k); // Last 10 adaptations
            if (row.atsScore > 80) strengthenedSkills.add(k);
          });
        } catch (e) {
          // Skip parse errors
        }
      });

      const newSkills = Array.from(recentSkills).filter(s => !strengthenedSkills.has(s)).slice(0, 5);
      const obsolete = Array.from(strengthenedSkills).filter(s => !recentSkills.has(s)).slice(0, 3);

      logger.info('Skill growth detected', { userId, newSkills: newSkills.length });

      res.json({
        success: true,
        data: {
          newSkills: newSkills,
          strengthenedSkills: Array.from(strengthenedSkills).slice(0, 5),
          obsoleteSkills: obsolete,
        },
        message: `Detected ${newSkills.length} new skills and ${obsolete.length} declining skills`,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('Failed to get skill growth', { userId, error: errorMsg });
      res.status(500).json({ success: false, error: 'Failed to get skill growth' });
    }
  })
);

/**
 * GET /api/learning/recommendations
 * Get personalized recommendations based on patterns + market
 */
router.get(
  '/recommendations',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user.id;

    try {
      // Get user's top keywords
      const keywordRows: any[] = (await db.query(`
        SELECT keywords, atsScore
        FROM successful_adaptations
        WHERE userId = $1
        ORDER BY atsScore DESC
        LIMIT 10
      `, [userId])).rows;

      const keywordMap = new Map<string, number>();
      keywordRows.forEach(row => {
        try {
          const keywords = safeJsonParse<string[]>(row.keywords, []);
          keywords.forEach((k: string) => {
            keywordMap.set(k, (keywordMap.get(k) || 0) + 1);
          });
        } catch (e) {
          // Skip
        }
      });

      const topKeywords = Array.from(keywordMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([k]) => k);

      // Get user's successful companies
      const companies = (await db.query<any>(`
        SELECT DISTINCT company
        FROM successful_adaptations
        WHERE userId = $1 AND atsScore >= 80
        LIMIT 5
      `, [userId])).rows.map(row => row.company as string);

      // Get top roles
      const roles = (await db.query<any>(`
        SELECT DISTINCT jobTitle
        FROM successful_adaptations
        WHERE userId = $1 AND atsScore >= 80
        LIMIT 5
      `, [userId])).rows.map(row => row.jobTitle as string);

      logger.info('Recommendations generated', { userId, keywordCount: topKeywords.length });

      res.json({
        success: true,
        data: {
          recommendedKeywords: topKeywords,
          recommendedCompanies: companies,
          recommendedRoles: roles,
          marketOpportunities: ['Growing tech sector', 'High demand for cloud skills'],
        },
        message: 'Personalized recommendations based on your success patterns',
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('Failed to get recommendations', { userId, error: errorMsg });
      res.status(500).json({ success: false, error: 'Failed to get recommendations' });
    }
  })
);

/**
 * GET /api/learning/market-trends
 * Get market-wide trends from aggregated user data
 */
router.get(
  '/market-trends',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    try {
      // Get overall trending keywords across ALL users
      const trendRows = (await db.query<any>(`
        SELECT keywords, AVG(atsScore) as avgScore
        FROM successful_adaptations
        GROUP BY keywords
        ORDER BY avgScore DESC
        LIMIT 50
      `)).rows;

      const hotSkills = new Set<string>();
      trendRows.forEach(row => {
        try {
          const keywords = safeJsonParse<string[]>(row.keywords, []);
          keywords.forEach((k: string) => {
            if (hotSkills.size < 10) hotSkills.add(k);
          });
        } catch (e) {
          // Skip
        }
      });

      // Get hot roles
      const roles = (await db.query<any>(`
        SELECT jobTitle, COUNT(*) as count, AVG(atsScore) as avgScore
        FROM successful_adaptations
        GROUP BY jobTitle
        ORDER BY count DESC
        LIMIT 5
      `)).rows.map(row => row.jobTitle as string);

      // Get hot companies
      const companies = (await db.query<any>(`
        SELECT company, COUNT(*) as count, AVG(atsScore) as avgScore
        FROM successful_adaptations
        GROUP BY company
        ORDER BY count DESC
        LIMIT 5
      `)).rows.map(row => row.company as string);

      logger.info('Market trends analyzed');

      res.json({
        success: true,
        data: {
          hotSkills: Array.from(hotSkills),
          hotRoles: roles,
          hotCompanies: companies,
          marketHealth: 'Strong tech hiring',
        },
        message: 'Market trends from aggregated user data',
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('Failed to get market trends', { error: errorMsg });
      res.status(500).json({ success: false, error: 'Failed to get market trends' });
    }
  })
);

export default router;
