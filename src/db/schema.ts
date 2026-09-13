import { db } from './client.js';

export function initializeSchema() {
  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      passwordHash TEXT NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      isDeleted BOOLEAN DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  `);

  // Refresh tokens table (for logout/revocation)
  db.exec(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      tokenHash TEXT NOT NULL,
      ipAddress TEXT,
      userAgent TEXT,
      expiresAt DATETIME NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_userId ON refresh_tokens(userId);
  `);

  // Candidate profiles table
  db.exec(`
    CREATE TABLE IF NOT EXISTS candidate_profiles (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL UNIQUE,
      fullName TEXT,
      yearsExperience INTEGER,
      education TEXT,
      skills TEXT, -- JSON array, encrypted
      summary TEXT, -- Encrypted
      cvOriginalContent TEXT, -- Encrypted (full CV)
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_candidate_profiles_userId ON candidate_profiles(userId);
  `);

  // Suggested roles table
  db.exec(`
    CREATE TABLE IF NOT EXISTS suggested_roles (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      roleTitle TEXT NOT NULL,
      level TEXT NOT NULL,
      description TEXT,
      matchScore REAL,
      isSelected BOOLEAN DEFAULT 0,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_suggested_roles_userId ON suggested_roles(userId);
  `);

  // Job offers table
  db.exec(`
    CREATE TABLE IF NOT EXISTS offers (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      company TEXT NOT NULL,
      level TEXT NOT NULL,
      salaryMin INTEGER,
      salaryMax INTEGER,
      salaryCurrency TEXT DEFAULT 'CLP',
      location TEXT,
      description TEXT,
      requirements TEXT, -- JSON array
      source TEXT NOT NULL,
      url TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_offers_level ON offers(level);
    CREATE INDEX IF NOT EXISTS idx_offers_company ON offers(company);
  `);

  // Postulations table
  db.exec(`
    CREATE TABLE IF NOT EXISTS postulations (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      offerId TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'Por revisar',
      prioridad TEXT NOT NULL DEFAULT 'Media',
      notes TEXT,
      cvAdaptedId TEXT,
      postulationWeight INTEGER DEFAULT 1,
      postuladoAt DATETIME,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (offerId) REFERENCES offers(id),
      FOREIGN KEY (cvAdaptedId) REFERENCES adapted_cvs(id)
    );
    CREATE INDEX IF NOT EXISTS idx_postulations_userId ON postulations(userId);
    CREATE INDEX IF NOT EXISTS idx_postulations_offerId ON postulations(offerId);
  `);

  // Adapted CVs table
  db.exec(`
    CREATE TABLE IF NOT EXISTS adapted_cvs (
      id TEXT PRIMARY KEY,
      postulationId TEXT NOT NULL,
      userId TEXT NOT NULL,
      offerId TEXT NOT NULL,
      htmlContent TEXT NOT NULL, -- Encrypted
      atsScore REAL,
      changesHighlights TEXT, -- JSON array
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (postulationId) REFERENCES postulations(id) ON DELETE CASCADE,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (offerId) REFERENCES offers(id)
    );
    CREATE INDEX IF NOT EXISTS idx_adapted_cvs_userId ON adapted_cvs(userId);
    CREATE INDEX IF NOT EXISTS idx_adapted_cvs_postulationId ON adapted_cvs(postulationId);
  `);

  // Audit logs table
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      eventType TEXT NOT NULL,
      userId TEXT,
      targetUserId TEXT,
      ipAddress TEXT,
      userAgent TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      detailsEncrypted TEXT,
      yearMonth TEXT,
      month TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_audit_logs_userId ON audit_logs(userId);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);
  `);

  // Support tickets table
  db.exec(`
    CREATE TABLE IF NOT EXISTS support_tickets (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      supportAgentId TEXT,
      reason TEXT NOT NULL,
      status TEXT DEFAULT 'PENDING',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      expiresAt DATETIME NOT NULL,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_support_tickets_userId ON support_tickets(userId);
  `);

  // Agent invocations table (for tracking agent calls and costs)
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_invocations (
      id TEXT PRIMARY KEY,
      agentName TEXT NOT NULL,
      userId TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      input TEXT NOT NULL,
      output TEXT,
      error TEXT,
      durationMs INTEGER,
      costTokens INTEGER,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      completedAt DATETIME,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_agent_invocations_userId ON agent_invocations(userId);
    CREATE INDEX IF NOT EXISTS idx_agent_invocations_agentName ON agent_invocations(agentName);
    CREATE INDEX IF NOT EXISTS idx_agent_invocations_status ON agent_invocations(status);
    CREATE INDEX IF NOT EXISTS idx_agent_invocations_createdAt ON agent_invocations(createdAt);
  `);

  // Postulation matches table (results from cv-matcher agent)
  db.exec(`
    CREATE TABLE IF NOT EXISTS postulation_matches (
      id TEXT PRIMARY KEY,
      postulationId TEXT NOT NULL,
      userId TEXT NOT NULL,
      matchScore REAL,
      matchPercentage REAL,
      strengths TEXT, -- JSON array
      gaps TEXT, -- JSON array
      recommendation TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (postulationId) REFERENCES postulations(id) ON DELETE CASCADE,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_postulation_matches_userId ON postulation_matches(userId);
    CREATE INDEX IF NOT EXISTS idx_postulation_matches_postulationId ON postulation_matches(postulationId);
  `);

  // Successful adaptations table (for memory & learning)
  db.exec(`
    CREATE TABLE IF NOT EXISTS successful_adaptations (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      jobTitle TEXT NOT NULL,
      company TEXT NOT NULL,
      atsScore REAL,
      keywords TEXT, -- JSON array
      cvChanges TEXT, -- JSON array
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_successful_adaptations_userId ON successful_adaptations(userId);
    CREATE INDEX IF NOT EXISTS idx_successful_adaptations_atsScore ON successful_adaptations(atsScore);
  `);

  // Application outcomes table (tracking results)
  db.exec(`
    CREATE TABLE IF NOT EXISTS application_outcomes (
      id TEXT PRIMARY KEY,
      adaptationId TEXT NOT NULL,
      userId TEXT NOT NULL,
      outcome TEXT NOT NULL, -- applied|interview|offer|rejection
      feedback TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (adaptationId) REFERENCES successful_adaptations(id) ON DELETE CASCADE,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_application_outcomes_userId ON application_outcomes(userId);
    CREATE INDEX IF NOT EXISTS idx_application_outcomes_outcome ON application_outcomes(outcome);
  `);

  // Postulation outcomes table (for continuous learning)
  db.exec(`
    CREATE TABLE IF NOT EXISTS postulation_outcomes (
      id TEXT PRIMARY KEY,
      postulationId TEXT NOT NULL,
      userId TEXT NOT NULL,
      outcome TEXT NOT NULL,
      feedback TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (postulationId) REFERENCES postulations(id) ON DELETE CASCADE,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_postulation_outcomes_userId ON postulation_outcomes(userId);
    CREATE INDEX IF NOT EXISTS idx_postulation_outcomes_outcome ON postulation_outcomes(outcome);
  `);

  console.log('✅ Database schema initialized');
}
