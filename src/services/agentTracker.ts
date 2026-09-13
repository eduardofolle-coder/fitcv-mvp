/**
 * Agent Tracker Service
 *
 * Tracks agent invocations in database for monitoring and cost tracking
 */

import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/client.js';
import { AgentInvocation } from './agentInvoker.js';

export interface AgentInvocationRecord {
  id: string;
  agentName: string;
  userId: string;
  status: 'pending' | 'completed' | 'failed';
  input: string;
  output?: string;
  error?: string;
  durationMs?: number;
  costTokens?: number;
  createdAt: Date;
  completedAt?: Date;
}

export class AgentTrackerService {
  /**
   * Create a record before agent invocation
   */
  static async createInvocation(
    agentName: string,
    userId: string,
    input: Record<string, any>
  ): Promise<string> {
    const id = uuidv4();
    const inputJson = JSON.stringify(input);

    try {
      await db.query(`
        INSERT INTO agent_invocations (id, agentName, userId, status, input, createdAt)
        VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
      `, [id, agentName, userId, 'pending', inputJson]);

      return id;
    } catch (error) {
      console.error('Failed to create agent invocation record:', error);
      return id; // Return ID anyway to not block execution
    }
  }

  /**
   * Update record after successful invocation
   */
  static async recordSuccess(
    invocationId: string,
    invocation: AgentInvocation
  ): Promise<void> {
    try {
      const outputJson = JSON.stringify(invocation.output);

      await db.query(`
        UPDATE agent_invocations
        SET status = $1, output = $2, durationMs = $3, costTokens = $4, completedAt = CURRENT_TIMESTAMP
        WHERE id = $5
      `, ['completed', outputJson, invocation.durationMs, invocation.costTokens, invocationId]);
    } catch (error) {
      console.error('Failed to record agent success:', error);
    }
  }

  /**
   * Update record after failed invocation
   */
  static async recordFailure(
    invocationId: string,
    error: string,
    durationMs?: number
  ): Promise<void> {
    try {
      await db.query(`
        UPDATE agent_invocations
        SET status = $1, error = $2, durationMs = $3, completedAt = CURRENT_TIMESTAMP
        WHERE id = $4
      `, ['failed', error, durationMs || 0, invocationId]);
    } catch (error) {
      console.error('Failed to record agent failure:', error);
    }
  }

  /**
   * Get invocation statistics for user
   */
  static async getStatistics(userId: string): Promise<{
    totalInvocations: number;
    succeededInvocations: number;
    failedInvocations: number;
    pendingInvocations: number;
    totalTokensCost: number;
    averageDurationMs: number;
    byAgent: Record<string, { count: number; succeeded: number; failed: number; tokens: number }>;
  }> {
    try {
      const totals = await db.queryOne<any>(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as succeeded,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(COALESCE(costTokens, 0)) as totalTokens,
          AVG(COALESCE(durationMs, 0)) as avgDuration
        FROM agent_invocations
        WHERE userId = $1
      `, [userId]);

      // Get statistics by agent
      const byAgentRows = (await db.query<any>(`
        SELECT
          agentName,
          COUNT(*) as count,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as succeeded,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
          SUM(COALESCE(costTokens, 0)) as tokens
        FROM agent_invocations
        WHERE userId = $1
        GROUP BY agentName
      `, [userId])).rows;

      const byAgent: Record<string, any> = {};
      for (const row of byAgentRows) {
        byAgent[row.agentName as string] = {
          count: row.count,
          succeeded: row.succeeded,
          failed: row.failed,
          tokens: row.tokens || 0,
        };
      }

      return {
        totalInvocations: totals.total || 0,
        succeededInvocations: totals.succeeded || 0,
        failedInvocations: totals.failed || 0,
        pendingInvocations: totals.pending || 0,
        totalTokensCost: totals.totalTokens || 0,
        averageDurationMs: Math.round(totals.avgDuration || 0),
        byAgent,
      };
    } catch (error) {
      console.error('Failed to get statistics:', error);
      return {
        totalInvocations: 0,
        succeededInvocations: 0,
        failedInvocations: 0,
        pendingInvocations: 0,
        totalTokensCost: 0,
        averageDurationMs: 0,
        byAgent: {},
      };
    }
  }

  /**
   * Get recent invocations
   */
  static async getRecentInvocations(userId: string, limit = 20): Promise<AgentInvocationRecord[]> {
    try {
      const invocationRows = (await db.query<any>(`
        SELECT *
        FROM agent_invocations
        WHERE userId = $1
        ORDER BY createdAt DESC
        LIMIT $2
      `, [userId, limit])).rows;

      const records: AgentInvocationRecord[] = [];

      for (const row of invocationRows) {
        records.push({
          id: row.id,
          agentName: row.agentName,
          userId: row.userId,
          status: row.status,
          input: row.input,
          output: row.output,
          error: row.error,
          durationMs: row.durationMs,
          costTokens: row.costTokens,
          createdAt: new Date(row.createdAt),
          completedAt: row.completedAt ? new Date(row.completedAt) : undefined,
        });
      }
      return records;
    } catch (error) {
      console.error('Failed to get recent invocations:', error);
      return [];
    }
  }

  /**
   * Clean up old records (older than 90 days)
   */
  static async cleanupOldRecords(): Promise<number> {
    try {
      // datetime('now','-90 days') es sintaxis de SQLite.
      const res = await db.query(
        "DELETE FROM agent_invocations WHERE createdAt < NOW() - INTERVAL '90 days'"
      );

      return res.rowCount;
    } catch (error) {
      console.error('Failed to cleanup old records:', error);
      return 0;
    }
  }
}
