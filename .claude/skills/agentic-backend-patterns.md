---
name: agentic-backend-patterns
description: Patterns for integrating AI agents into Express/Node.js backends safely and efficiently
---

# Agentic Backend Patterns Skill

## When to Use

When implementing or improving:
- Agent invocation from API routes
- Cost tracking for LLM calls
- Error handling for external API failures
- Database storage of agent results
- Request/response serialization

This skill documents proven patterns used in FITCV Phase 2.

---

## Pattern 1: Agent Service Layer

**Why:** Decouple agent logic from routes. Reusable across multiple endpoints.

**Structure:**
```typescript
// ✅ GOOD - Dedicated service
class AgentInvokerService {
  static async invoke(agentName: string, input: Record<string, any>, userId: string) {
    // Validate input
    // Call Claude API with proper error handling
    // Parse response
    // Return standardized AgentInvocation object
  }
}

// ✅ In route
router.post('/upload', async (req, res) => {
  const invocation = await AgentInvokerService.invoke('cv-analyzer', input, userId);
  // Use invocation result
});

// ❌ WRONG - Agent logic in route
router.post('/upload', async (req, res) => {
  const response = await axios.post('https://api.anthropic.com/...', {...});
  // Agent logic scattered in route
});
```

**Benefits:**
- Single source of truth for agent configuration
- Consistent error handling across all agents
- Easy to add new agents (one place to update)
- Testable in isolation

---

## Pattern 2: Tracking Service for Monitoring

**Why:** Monitor agent usage, costs, and performance. Required for billing and optimization.

**Structure:**
```typescript
class AgentTrackerService {
  static createInvocation(agentName, userId, input): string {
    // Create record BEFORE agent invocation
    // Return invocationId
  }

  static recordSuccess(invocationId, invocation): void {
    // Update with: success, output, duration, tokens
  }

  static recordFailure(invocationId, error, duration): void {
    // Update with: failure, error message, duration
  }

  static getStatistics(userId) {
    // Return: total calls, success rate, total tokens, by agent
  }
}

// ✅ In route
const invocationId = AgentTrackerService.createInvocation('cv-analyzer', userId, input);
try {
  const result = await AgentInvokerService.invoke('cv-analyzer', input, userId);
  AgentTrackerService.recordSuccess(invocationId, result);
  // Use result
} catch (error) {
  AgentTrackerService.recordFailure(invocationId, error.message);
  // Handle error
}
```

**Benefits:**
- Track all agent calls (success/failure/cost)
- Monitor performance bottlenecks
- Calculate per-user costs
- Detect reliability issues
- Data for optimization

---

## Pattern 3: Agent Configuration Registry

**Why:** Centralize agent settings (model, max tokens, etc). Easy to adjust without code changes.

**Structure:**
```typescript
const AGENT_CONFIG: Record<AgentName, { model: string; maxTokens: number }> = {
  'cv-analyzer': { 
    model: 'claude-3-5-sonnet-20241022', 
    maxTokens: 2000 
  },
  'cv-adapter': { 
    model: 'claude-3-5-sonnet-20241022', 
    maxTokens: 3000 
  },
  'postulation-orchestrator': { 
    model: 'claude-opus-4-1-20250805', // Use Opus for complex coordination
    maxTokens: 4000 
  },
};

// ✅ Easy to adjust
function invokeAgent(agentName) {
  const config = AGENT_CONFIG[agentName];
  // Use config.model and config.maxTokens
}

// ❌ WRONG - Hardcoded
function invokeAgent(agentName) {
  const model = 'claude-3-5-sonnet-20241022'; // Hardcoded
  const maxTokens = 2000; // Same for all agents
}
```

**Benefits:**
- Single place to adjust models/tokens
- Easy A/B testing (try different models)
- Clear visibility of resource allocation
- Easy to upgrade models when new versions available

---

## Pattern 4: Prompt Builder for Agents

**Why:** Separate prompts from code. Easier to iterate prompts without changing code.

**Structure:**
```typescript
private static buildPrompt(agentName: AgentName, input: Record<string, any>): string {
  const inputJson = JSON.stringify(input, null, 2);

  const prompts: Record<AgentName, string> = {
    'cv-analyzer': `You are the CV Analyzer Agent...
INPUT DATA:
${inputJson}
Process: [detailed steps]
Return ONLY valid JSON: {...}`,
    
    'cv-adapter': `You are the CV Adapter Agent...
INPUT DATA:
${inputJson}
Process: [detailed steps]
Return ONLY valid JSON: {...}`,
  };

  return prompts[agentName] || '';
}
```

**Benefits:**
- Prompts co-located with agent logic
- Easy to update/improve prompts
- Clear instructions for each agent
- Reduce hallucination with explicit output format

---

## Pattern 5: Graceful Degradation on Agent Failure

**Why:** External API calls can fail. Have fallbacks.

**Structure:**
```typescript
try {
  const result = await AgentInvokerService.invoke('cv-adapter', input, userId);
  
  if (!result.success) {
    // Agent returned error response
    return res.status(400).json({
      success: false,
      error: result.error,
      // Don't block user, provide fallback
    });
  }
  
  res.json(result.output);
} catch (error) {
  // Network error or timeout
  
  // Option 1: Try to use previous result from database
  const previousResult = db.query('SELECT output FROM agent_invocations WHERE ... ORDER BY createdAt DESC LIMIT 1');
  if (previousResult) {
    return res.json({
      success: true,
      cached: true,
      ...previousResult,
      warning: 'Using cached result due to API error'
    });
  }
  
  // Option 2: Return error with invocation ID for retry
  return res.status(500).json({
    success: false,
    error: 'Agent service temporarily unavailable',
    retryId: invocationId, // User can retry
  });
}
```

**Benefits:**
- Don't fail user experience on API errors
- Provide warning if using cached data
- Allow retries with invocation ID
- Better resilience

---

## Pattern 6: Input Validation Before Agent Call

**Why:** Avoid wasting tokens on invalid input. Catch errors early.

**Structure:**
```typescript
// ✅ Validate BEFORE calling agent
if (!cvText || typeof cvText !== 'string' || cvText.length < 100) {
  return res.status(400).json({
    success: false,
    error: 'CV text must be at least 100 characters',
  });
}

if (cvText.length > 50000) {
  return res.status(400).json({
    success: false,
    error: 'CV text exceeds maximum length',
  });
}

// Only call agent if input is valid
const result = await AgentInvokerService.invoke('cv-analyzer', { cvText }, userId);

// ❌ WRONG - Let agent handle invalid input
const result = await AgentInvokerService.invoke('cv-analyzer', { cvText }, userId);
if (!result.success) {
  // Agent wasted tokens parsing invalid input
  return res.status(400).json(result);
}
```

**Benefits:**
- Reduce wasted tokens
- Fail fast with clear error messages
- Better user experience
- Lower API costs

---

## Pattern 7: Store Agent Results in Database

**Why:** Avoid re-running same agent for same input. Enable offline analysis.

**Structure:**
```typescript
// ✅ After successful agent call
const result = await AgentInvokerService.invoke('cv-adapter', input, userId);

if (result.success) {
  // Store in database
  const adaptedCvId = uuidv4();
  
  const stmt = db.prepare(`
    INSERT INTO adapted_cvs (id, userId, htmlContent, atsScore, changesHighlights)
    VALUES (?, ?, ?, ?, ?)
  `);
  
  stmt.bind([
    adaptedCvId,
    userId,
    result.output.adaptation.adaptedCV,
    result.output.adaptation.atsScore,
    JSON.stringify(result.output.adaptation.changes),
  ]);
  
  stmt.step();
  stmt.free();
  
  // Return with ID for future reference
  res.json({
    success: true,
    adaptedCvId, // Client can retrieve later
    ...result.output,
  });
}
```

**Benefits:**
- Avoid duplicate agent calls
- Audit trail of all agents results
- Can analyze agent output over time
- Enable offline report generation

---

## Pattern 8: Error Response Standardization

**Why:** Consistent error responses make debugging easier.

**Structure:**
```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  errorId?: string; // For support tickets
  agentId?: string; // If agent-related
  retryable?: boolean;
}

// ✅ Consistent error responses
router.post('/upload', async (req, res) => {
  try {
    const result = await AgentInvokerService.invoke('cv-analyzer', input, userId);
    
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        agentId: result.invocationId,
        retryable: true, // Can try again
      });
    }
    
    res.json({
      success: true,
      data: result.output,
      agentId: result.invocationId, // For support
    });
  } catch (error) {
    const errorId = uuidv4(); // For support reference
    
    res.status(500).json({
      success: false,
      error: 'Failed to process request',
      errorId, // User reports this to support
      retryable: true,
    });
  }
});
```

**Benefits:**
- Clear error handling for clients
- Support can trace issues with errorId
- Users know if they can retry

---

## Pattern 9: Async Agent Invocation with Webhooks

**Why:** Some agent calls take >10s. Don't block user. Return async ID.

**Structure:**
```typescript
// ✅ For long-running agents
router.post('/generate-report', async (req, res) => {
  const taskId = uuidv4();
  
  // Return immediately with task ID
  res.status(202).json({
    success: true,
    taskId, // Client polls this
    statusUrl: `/api/tasks/${taskId}`,
    estimatedSeconds: 30,
  });
  
  // Run agent in background (don't await)
  (async () => {
    try {
      const result = await AgentInvokerService.invoke('complex-agent', input, userId);
      // Store result in database by taskId
      db.query(`UPDATE tasks SET result = ? WHERE id = ?`, [JSON.stringify(result), taskId]);
    } catch (error) {
      db.query(`UPDATE tasks SET error = ? WHERE id = ?`, [error.message, taskId]);
    }
  })();
});

// ✅ Client polls for result
router.get('/tasks/:taskId', async (req, res) => {
  const task = db.query(`SELECT * FROM tasks WHERE id = ?`, [req.params.taskId]);
  
  res.json({
    taskId: task.id,
    status: task.result ? 'completed' : task.error ? 'failed' : 'processing',
    result: task.result ? JSON.parse(task.result) : null,
    error: task.error,
  });
});
```

**Benefits:**
- Don't block user on slow agents
- User can check progress
- Better UX for long operations
- Scalable (can run agents in queue)

---

## Pattern 10: Cost Optimization Strategy

**Why:** LLM costs add up. Monitor and optimize.

**Levels (fastest → best quality):**

1. **Cache if possible**
   ```typescript
   // Check if we've analyzed this exact CV before
   const cached = db.query(`
     SELECT output FROM agent_invocations 
     WHERE agentName = 'cv-analyzer' AND input_hash = ? 
     ORDER BY createdAt DESC LIMIT 1
   `, [hashInput(input)]);
   
   if (cached) return cached; // Free!
   ```

2. **Use cheaper model first**
   ```typescript
   // Use Sonnet for simple tasks, Opus only when needed
   const model = complexity > 0.7 ? 'opus' : 'sonnet';
   ```

3. **Batch operations**
   ```typescript
   // Rank 10 offers in one call instead of 10 separate calls
   const result = await AgentInvokerService.invoke('offer-ranker', 
     { opportunities: allOffers }, userId
   );
   ```

4. **Reduce max tokens if safe**
   ```typescript
   // CV analyzer only needs 2000 tokens, not 4000
   const config = {
     ...AGENT_CONFIG['cv-analyzer'],
     maxTokens: Math.min(2000, estimatedLength),
   };
   ```

---

## Checklist for New Agent Routes

When adding a new agent endpoint:

- [ ] Create service method in AgentInvokerService
- [ ] Add agent config to AGENT_CONFIG registry
- [ ] Create route in appropriate routes file
- [ ] Add input validation before agent call
- [ ] Create tracking record before invoke
- [ ] Record success/failure after invoke
- [ ] Store result in database if needed
- [ ] Return standardized response
- [ ] Handle errors gracefully
- [ ] Test with various inputs (happy path + edge cases)
- [ ] Verify costs are reasonable
- [ ] Update API documentation

---

## Example: Complete Agent Route

```typescript
router.post('/upload', requireAuth, asyncHandler(async (req, res) => {
  const userId = (req as any).user.id;
  const { cvText } = req.body;

  // 1. VALIDATE input
  if (!cvText || cvText.length < 100 || cvText.length > 50000) {
    return res.status(400).json({
      success: false,
      error: 'Invalid CV text length',
    });
  }

  // 2. CREATE tracking record
  const invocationId = AgentTrackerService.createInvocation(
    'cv-analyzer', userId, { textLength: cvText.length }
  );

  try {
    // 3. INVOKE agent
    const invocation = await AgentInvokerService.invoke(
      'cv-analyzer', { cvText }, userId
    );

    // 4. RECORD success
    AgentTrackerService.recordSuccess(invocationId, invocation);

    if (!invocation.success) {
      return res.status(400).json({
        success: false,
        error: invocation.error,
        agentId: invocationId,
      });
    }

    // 5. STORE result
    const profileId = uuidv4();
    const profile = invocation.output.profile;
    
    const stmt = db.prepare(
      `INSERT INTO candidate_profiles (...) VALUES (...)`
    );
    stmt.bind([profileId, userId, profile.fullName, ...]);
    stmt.step();
    stmt.free();

    // 6. RETURN response
    res.status(201).json({
      success: true,
      profileId,
      profile: invocation.output.profile,
      agentCost: invocation.costTokens,
    });

  } catch (error) {
    // 7. RECORD failure
    AgentTrackerService.recordFailure(invocationId, error.message);

    res.status(500).json({
      success: false,
      error: 'Failed to analyze CV',
      errorId: invocationId,
      retryable: true,
    });
  }
}));
```

All 10 patterns demonstrated!
