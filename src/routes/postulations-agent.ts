/**
 * Postulations Routes with Agent Integration
 *
 * - POST /api/postulations/:id/generate-cv → Invokes cv-adapter agent
 * - POST /api/postulations/match → Invokes postulation-matcher agent (NEW)
 * - GET /api/offers/ranked → Invokes offer-ranker agent (NEW)
 */

import express, { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { AgentInvokerService } from '../services/agentInvoker.js';
import { AgentTrackerService } from '../services/agentTracker.js';
import { db } from '../db/client.js';
import { logger } from '../services/logger.js';
import { SEED_OFFERS } from '../db/seedData.js';
import { safeJsonParse } from '../utils/safeJson.js';

const router = express.Router();

/**
 * POST /api/postulations/:id/generate-cv
 *
 * Generate adapted CV for specific postulation using cv-adapter agent
 *
 * URL params:
 * - id: Postulation ID
 *
 * Request body:
 * {
 *   "offerId": "offer-123" (optional, uses postulation offerId if not provided)
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "adaptedCvId": "...",
 *   "adaptedCV": "Full CV text...",
 *   "atsScore": 88,
 *   "keywordMatches": [...],
 *   "changes": [...],
 *   "agentCost": 450
 * }
 */
router.post(
  '/:id/generate-cv',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const postulationId = req.params.id;

    // Fetch postulation
    const postulation = await db.queryOne(`
      SELECT p.*, o.title, o.description, o.level
      FROM postulations p
      JOIN offers o ON p.offerId = o.id
      WHERE p.id = $1 AND p.userId = $2
    `, [postulationId, userId]);

    if (!postulation || !postulation.id) {
      return res.status(404).json({
        success: false,
        error: 'Postulation not found',
      });
    }

    // Fetch candidate profile
    const profile = await db.queryOne<any>(
      'SELECT * FROM candidate_profiles WHERE userId = $1 LIMIT 1',
      [userId]
    );

    if (!profile || !profile.id) {
      return res.status(400).json({
        success: false,
        error: 'No CV profile found. Please upload a CV first.',
      });
    }

    logger.info('CV adaptation started', { userId, postulationId });

    // Create tracking record
    const invocationId = await AgentTrackerService.createInvocation('cv-adapter', userId, {
      postulationId,
      offerId: postulation.offerId,
      jobTitle: postulation.title,
    });

    try {
      // Invoke cv-adapter agent
      const invocation = await AgentInvokerService.invoke(
        'cv-adapter',
        {
          originalCV: profile.cvOriginalContent,
          candidateProfile: {
            fullName: profile.fullName,
            yearsExperience: profile.yearsExperience,
            skills: safeJsonParse(profile.skills, {}),
            education: safeJsonParse(profile.education, []),
            summary: profile.summary,
          },
          jobDescription: postulation.description,
          jobTitle: postulation.title,
          jobLevel: postulation.level,
        },
        userId
      );

      // Record success
      await AgentTrackerService.recordSuccess(invocationId, invocation);

      if (!invocation.success || !invocation.output) {
        logger.warn('CV adaptation failed', { userId, postulationId, error: invocation.error });
        return res.status(400).json({
          success: false,
          error: invocation.error || 'Failed to adapt CV',
        });
      }

      // Save adapted CV to database
      const adaptedCvId = uuidv4();
      const adaptation = invocation.output.adaptation;

      await db.query(`
        INSERT INTO adapted_cvs (id, postulationId, userId, offerId, htmlContent, atsScore, changesHighlights, createdAt)
        VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
      `, [
        adaptedCvId,
        postulationId,
        userId,
        postulation.offerId,
        adaptation.adaptedCV, // In production, should be encrypted
        adaptation.atsScore,
        JSON.stringify(adaptation.changes),
      ]);

      // Update postulation with adapted CV reference
      await db.query(`
        UPDATE postulations SET cvAdaptedId = $1, updatedAt = CURRENT_TIMESTAMP WHERE id = $2
      `, [adaptedCvId, postulationId]);

      logger.info('CV adaptation saved', { userId, postulationId, adaptedCvId, atsScore: adaptation.atsScore });

      res.status(201).json({
        success: true,
        adaptedCvId,
        adaptedCV: adaptation.adaptedCV,
        atsScore: adaptation.atsScore,
        keywordMatches: adaptation.keywordMatches,
        changes: adaptation.changes,
        optimizations: adaptation.optimizations,
        quality: invocation.output.quality,
        recommendations: invocation.output.recommendations,
        agentCost: invocation.costTokens,
        agentDuration: invocation.durationMs,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      await AgentTrackerService.recordFailure(
        invocationId,
        errorMsg,
        Math.abs(Date.now() - new Date().getTime())
      );

      logger.error('CV adaptation error', { userId, postulationId, error: errorMsg });

      res.status(500).json({
        success: false,
        error: 'Failed to adapt CV',
        agentId: invocationId,
      });
    }
  })
);

/**
 * POST /api/postulations/match
 *
 * Match candidate profile against a job offer using postulation-matcher agent (NEW)
 *
 * Request body:
 * {
 *   "offerId": "offer-123"
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "matchAnalysis": {
 *     "overallMatch": 85,
 *     "verdict": "Strong candidate"
 *   },
 *   "gaps": [...],
 *   "recommendations": [...]
 * }
 */
router.post(
  '/match',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { offerId } = req.body;

    if (!offerId) {
      return res.status(400).json({
        success: false,
        error: 'offerId is required',
      });
    }

    // Fetch offer
    const offer = SEED_OFFERS.find(o => o.id === offerId) || null;
    if (!offer) {
      return res.status(404).json({
        success: false,
        error: 'Offer not found',
      });
    }

    // Fetch candidate profile
    const profile = await db.queryOne<any>(
      'SELECT * FROM candidate_profiles WHERE userId = $1 LIMIT 1',
      [userId]
    );

    if (!profile) {
      return res.status(400).json({
        success: false,
        error: 'No CV profile found. Please upload a CV first.',
      });
    }

    logger.info('Postulation matching started', { userId, offerId });

    // Create tracking record
    const invocationId = await AgentTrackerService.createInvocation('postulation-matcher', userId, {
      offerId,
      jobTitle: offer.title,
    });

    try {
      // Invoke postulation-matcher agent
      const invocation = await AgentInvokerService.invoke(
        'postulation-matcher',
        {
          candidateProfile: {
            fullName: profile.fullName,
            yearsExperience: profile.yearsExperience,
            skills: safeJsonParse(profile.skills, {}),
            education: safeJsonParse(profile.education, []),
          },
          jobDescription: offer.description,
          jobTitle: offer.title,
          jobLevel: offer.level,
          requirements: offer.requirements,
        },
        userId
      );

      await AgentTrackerService.recordSuccess(invocationId, invocation);

      if (!invocation.success || !invocation.output) {
        return res.status(400).json({
          success: false,
          error: invocation.error || 'Failed to match postulation',
        });
      }

      res.json({
        success: true,
        matchAnalysis: invocation.output.matchAnalysis,
        skillsAnalysis: invocation.output.skillsAnalysis,
        gaps: invocation.output.gaps,
        recommendations: invocation.output.recommendations,
        agentCost: invocation.costTokens,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      await AgentTrackerService.recordFailure(invocationId, errorMsg);

      res.status(500).json({
        success: false,
        error: 'Failed to match postulation',
      });
    }
  })
);

/**
 * GET /api/offers/ranked
 *
 * Rank all offers for candidate using offer-ranker agent (NEW)
 *
 * Query params:
 * - limit: Number of top offers to return (default 10)
 *
 * Response:
 * {
 *   "success": true,
 *   "rankings": [
 *     {
 *       "rank": 1,
 *       "jobTitle": "Senior Backend Engineer",
 *       "overallScore": 92,
 *       "verdict": "Highly Recommended"
 *     }
 *   ]
 * }
 */
router.get(
  '/ranked',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);

    // Fetch candidate profile
    const profile = await db.queryOne<any>(
      'SELECT * FROM candidate_profiles WHERE userId = $1 LIMIT 1',
      [userId]
    );

    if (!profile) {
      return res.status(400).json({
        success: false,
        error: 'No CV profile found. Please upload a CV first.',
      });
    }

    logger.info('Offer ranking started', { userId, offerCount: SEED_OFFERS.length });

    // Create tracking record
    const invocationId = await AgentTrackerService.createInvocation('offer-ranker', userId, {
      offerCount: SEED_OFFERS.length,
    });

    try {
      // Invoke offer-ranker agent
      const invocation = await AgentInvokerService.invoke(
        'offer-ranker',
        {
          candidateProfile: {
            fullName: profile.fullName,
            yearsExperience: profile.yearsExperience,
            skills: safeJsonParse(profile.skills, {}),
            education: safeJsonParse(profile.education, []),
            summary: profile.summary,
          },
          opportunities: SEED_OFFERS.map(o => ({
            jobTitle: o.title,
            company: o.company,
            description: o.description,
            level: o.level,
            salary: { min: o.salaryMin, max: o.salaryMax, currency: o.salaryCurrency },
            location: o.location,
            requirements: o.requirements,
          })),
          candidatePreferences: {
            remote: true, // Default - could be stored in user profile
            growthFocus: true,
          },
        },
        userId
      );

      await AgentTrackerService.recordSuccess(invocationId, invocation);

      if (!invocation.success || !invocation.output) {
        return res.status(400).json({
          success: false,
          error: invocation.error || 'Failed to rank offers',
        });
      }

      // Return top N rankings
      const topRankings = invocation.output.rankings.slice(0, limit);

      res.json({
        success: true,
        rankings: topRankings,
        totalRanked: invocation.output.rankings.length,
        recommendations: invocation.output.recommendations,
        marketContext: invocation.output.marketContext,
        agentCost: invocation.costTokens,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      await AgentTrackerService.recordFailure(invocationId, errorMsg);

      res.status(500).json({
        success: false,
        error: 'Failed to rank offers',
      });
    }
  })
);

export default router;
