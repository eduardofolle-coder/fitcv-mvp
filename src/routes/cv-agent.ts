/**
 * CV Routes with Agent Integration
 *
 * - POST /api/cv/upload → Invokes cv-analyzer agent
 * - GET /api/cv/profile → Returns parsed profile
 * - GET /api/cv/stats → Returns agent statistics
 */

import express, { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { AgentInvokerService } from '../services/agentInvoker.js';
import { AgentTrackerService } from '../services/agentTracker.js';
import { db } from '../db/client.js';
import { logger } from '../services/logger.js';
import { safeJsonParse } from '../utils/safeJson.js';

const router = express.Router();

/**
 * POST /api/cv/upload
 *
 * Upload and analyze CV using cv-analyzer agent
 *
 * Request body:
 * {
 *   "cvText": "Full CV text content...",
 *   "fileName": "resume.txt" (optional)
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "profile": {
 *     "fullName": "...",
 *     "email": "...",
 *     "skills": [...],
 *     "experience": [...],
 *     ...
 *   },
 *   "quality": {
 *     "clarity": 85,
 *     "consistency": 90,
 *     ...
 *   }
 * }
 */
router.post(
  '/upload',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { cvText, fileName } = req.body;

    // Validate input
    if (!cvText || typeof cvText !== 'string' || cvText.length < 100) {
      return res.status(400).json({
        success: false,
        error: 'CV text must be at least 100 characters',
      });
    }

    if (cvText.length > 50000) {
      return res.status(400).json({
        success: false,
        error: 'CV text exceeds maximum length (50,000 characters)',
      });
    }

    logger.info('CV upload started', { userId, fileName });

    // Create tracking record
    const invocationId = await AgentTrackerService.createInvocation('cv-analyzer', userId, {
      cvTextLength: cvText.length,
      fileName,
    });

    try {
      // Invoke cv-analyzer agent
      const invocation = await AgentInvokerService.invoke('cv-analyzer', { cvText }, userId);

      // Record success
      await AgentTrackerService.recordSuccess(invocationId, invocation);

      if (!invocation.success || !invocation.output) {
        logger.warn('CV analysis failed', { userId, error: invocation.error });
        return res.status(400).json({
          success: false,
          error: invocation.error || 'Failed to analyze CV',
        });
      }

      // Save profile to database
      const profileId = uuidv4();
      const profile = invocation.output.profile;

      // Store profile (skills and summary encrypted in production)
      await db.query(`
        INSERT INTO candidate_profiles (id, userId, fullName, yearsExperience, education, skills, summary, cvOriginalContent, updatedAt)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
      `, [
        profileId,
        userId,
        profile.fullName || null,
        profile.yearsExperience || null,
        JSON.stringify(profile.education || []),
        JSON.stringify(profile.skills || {}),
        profile.summary || null,
        cvText, // In production, this should be encrypted
      ]);

      logger.info('CV profile saved', { userId, profileId });

      // Log audit event
      logger.info('CV_UPLOADED', {
        userId,
        profileId,
        fullName: profile.fullName,
        yearsExperience: profile.yearsExperience,
      });

      res.status(201).json({
        success: true,
        profileId,
        profile: invocation.output.profile,
        quality: invocation.output.quality,
        gaps: invocation.output.gaps,
        recommendations: invocation.output.recommendations,
        agentCost: invocation.costTokens,
        agentDuration: invocation.durationMs,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      await AgentTrackerService.recordFailure(
        invocationId,
        errorMsg,
        (Date.now() - new Date().getTime()) * -1
      );

      logger.error('CV analysis error', { userId, error: errorMsg });

      res.status(500).json({
        success: false,
        error: 'Failed to analyze CV',
        agentId: invocationId,
      });
    }
  })
);

/**
 * GET /api/cv/profile
 *
 * Get parsed candidate profile
 */
router.get(
  '/profile',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user.id;

    const profile = await db.queryOne<any>(`
      SELECT id, fullName, yearsExperience, education, skills, summary
      FROM candidate_profiles
      WHERE userId = $1
      LIMIT 1
    `, [userId]);

    if (!profile || !profile.id) {
      return res.status(404).json({
        success: false,
        error: 'No CV profile found. Please upload a CV first.',
      });
    }

    res.json({
      success: true,
      profile: {
        id: profile.id,
        fullName: profile.fullName,
        yearsExperience: profile.yearsExperience,
        education: safeJsonParse(profile.education, []),
        skills: safeJsonParse(profile.skills, {}),
        summary: profile.summary,
      },
    });
  })
);

/**
 * GET /api/cv/stats
 *
 * Get agent invocation statistics
 */
router.get(
  '/stats',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user.id;

    const stats = await AgentTrackerService.getStatistics(userId);
    const recentInvocations = await AgentTrackerService.getRecentInvocations(userId, 10);

    res.json({
      success: true,
      statistics: stats,
      recentInvocations: recentInvocations.map(inv => ({
        id: inv.id,
        agentName: inv.agentName,
        status: inv.status,
        durationMs: inv.durationMs,
        costTokens: inv.costTokens,
        createdAt: inv.createdAt,
        error: inv.error,
      })),
    });
  })
);

export default router;
