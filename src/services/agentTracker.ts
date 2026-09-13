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
  static createInvocation(
    agentName: string,
    userId: string,
    input: Record<string, any>
  ): string {
    const id = uuidv4();
    const inputJson = JSON.stringify(input);

    try {
      const stmt = db.prepare(`
        INSERT INTO agent_invocations (id, agentName, userId, status, input, createdAt)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `);

      stmt.bind([id, agentName, userId, 'pending', inputJson]);
      stmt.step();
      stmt.free();

      return id;
    } catch (error) {
      console.error('Failed to create agent invocation record:', error);
      return id; // Return ID anyway to not block execution
    }
  }

  /**
   * Update record after successful invocation
   */
  static recordSuccess(
    invocationId: string,
    invocation: AgentInvocation
  ): void {
    try {
      const outputJson = JSON.stringify(invocation.output);

      const stmt = db.prepare(`
        UPDATE agent_invocations
        SET status = ?, output = ?, durationMs = ?, costTokens = ?, completedAt = CURRENT_TIMESTAMP
        WHERE id = ?
      `);

      stmt.bind(['completed', outputJson, invocation.durationMs, invocation.costTokens, invocationId]);
      stmt.step();
      stmt.free();
    } catch (error) {
      console.error('Failed to record agent success:', error);
    }
  }

  /**
   * Update record after failed invocation
   */
  static recordFailure(
    invocationId: string,
    error: string,
    durationMs?: number
  ): void {
    try {
      const stmt = db.prepare(`
        UPDATE agent_invocations
        SET status = ?, error = ?, durationMs = ?, completedAt = CURRENT_TIMESTAMP
        WHERE id = ?
      `);

      stmt.bind(['failed', error, durationMs || 0, invocationId]);
      stmt.step();
      stmt.free();
    } catch (error) {
      console.error('Failed to record agent failure:', error);
    }
  }

  /**
   * Get invocation statistics for user
   */
  static getStatistics(userId: string): {
    totalInvocations: number;
    succeededInvocations: number;
    failedInvocations: number;
    pendingInvocations: number;
    totalTokensCost: number;
    averageDurationMs: number;
    byAgent: Record<string, { count: number; succeeded: number; failed: number; tokens: number }>;
  } {
    try {
      const stmt = db.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as succeeded,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(COALESCE(costTokens, 0)) as totalTokens,
          AVG(COALESCE(durationMs, 0)) as avgDuration
        FROM agent_invocations
        WHERE userId = ?
      `);

      stmt.bind([userId]);
      const hasSummary = stmt.step();
      const summary = hasSummary ? stmt.getAsObject() : null;
      stmt.free();

      // Get statistics by agent
      const agentStmt = db.prepare(`
        SELECT
          agentName,
          COUNT(*) as count,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as succeeded,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
          SUM(COALESCE(costTokens, 0)) as tokens
        FROM agent_invocations
        WHERE userId = ?
        GROUP BY agentName
      `);

      agentStmt.bind([userId]);
      const byAgent: Record<string, any> = {};
      while (agentStmt.step()) {
        const row = agentStmt.getAsObject();
        byAgent[row.agentName as string] = {
          count: row.count,
          succeeded: row.succeeded,
          failed: row.failed,
          tokens: row.tokens || 0,
        };
      }
      agentStmt.free();

      return {
        totalInvocations: summary.total || 0,
        succeededInvocations: summary.succeeded || 0,
        failedInvocations: summary.failed || 0,
        pendingInvocations: summary.pending || 0,
        totalTokensCost: summary.totalTokens || 0,
        averageDurationMs: Math.round(summary.avgDuration || 0),
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
  static getRecentInvocations(userId: string, limit = 20): AgentInvocationRecord[] {
    try {
      const stmt = db.prepare(`
        SELECT *
        FROM agent_invocations
        WHERE userId = ?
        ORDER BY createdAt DESC
        LIMIT ?
      `);

      stmt.bind([userId, limit]);
      const records: AgentInvocationRecord[] = [];

      while (stmt.step()) {
        const row = stmt.getAsObject() as any;
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

      stmt.free();
      return records;
    } catch (error) {
      console.error('Failed to get recent invocations:', error);
      return [];
    }
  }

  /**
   * Clean up old records (older than 90 days)
   */
  static cleanupOldRecords(): number {
    try {
      const stmt = db.prepare(`
        DELETE FROM agent_invocations
        WHERE createdAt < datetime('now', '-90 days')
      `);

      stmt.step();
      stmt.free();

      return 0;
    } catch (error) {
      console.error('Failed to cleanup old records:', error);
      return 0;
    }
  }
}
