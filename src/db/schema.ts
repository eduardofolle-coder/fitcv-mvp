import { db } from './client.js';

export async function initializeSchema(): Promise<void> {
  // Users table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      passwordHash TEXT NOT NULL,
      createdAt TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      isDeleted BOOLEAN DEFAULT FALSE
    );
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  `);

  // Refresh tokens table (for logout/revocation)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      tokenHash TEXT NOT NULL,
      ipAddress TEXT,
      userAgent TEXT,
      expiresAt TIMESTAMPTZ NOT NULL,
      createdAt TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_userId ON refresh_tokens(userId);
  `);

  // Candidate profiles table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS candidate_profiles (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL UNIQUE,
      fullName TEXT,
      yearsExperience INTEGER,
      education TEXT,
      skills TEXT, -- JSON array, encrypted
      summary TEXT, -- Encrypted
      cvOriginalContent TEXT, -- Encrypted (full CV)
      createdAt TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_candidate_profiles_userId ON candidate_profiles(userId);
  `);

  // Suggested roles table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS suggested_roles (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      roleTitle TEXT NOT NULL,
      level TEXT NOT NULL,
      description TEXT,
      matchScore DOUBLE PRECISION,
      isSelected BOOLEAN DEFAULT FALSE,
      createdAt TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_suggested_roles_userId ON suggested_roles(userId);
  `);

  // Job offers table
  await db.exec(`
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
      createdAt TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_offers_level ON offers(level);
    CREATE INDEX IF NOT EXISTS idx_offers_company ON offers(company);
  `);

  // Postulations table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS postulations (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      offerId TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'Por revisar',
      prioridad TEXT NOT NULL DEFAULT 'Media',
      notes TEXT,
      cvAdaptedId TEXT,
      postulationWeight INTEGER DEFAULT 1,
      postuladoAt TIMESTAMPTZ,
      createdAt TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (offerId) REFERENCES offers(id)
      -- cvAdaptedId apuntaba a adapted_cvs, que a su vez referencia
      -- postulations: una FK circular que SQLite aceptaba en silencio y
      -- Postgres rechaza. La relación ya la modela adapted_cvs.postulationId.
    );
    CREATE INDEX IF NOT EXISTS idx_postulations_userId ON postulations(userId);
    CREATE INDEX IF NOT EXISTS idx_postulations_offerId ON postulations(offerId);
  `);

  // Adapted CVs table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS adapted_cvs (
      id TEXT PRIMARY KEY,
      postulationId TEXT NOT NULL,
      userId TEXT NOT NULL,
      offerId TEXT NOT NULL,
      htmlContent TEXT NOT NULL, -- Encrypted
      atsScore DOUBLE PRECISION,
      changesHighlights TEXT, -- JSON array
      createdAt TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (postulationId) REFERENCES postulations(id) ON DELETE CASCADE,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (offerId) REFERENCES offers(id)
    );
    CREATE INDEX IF NOT EXISTS idx_adapted_cvs_userId ON adapted_cvs(userId);
    CREATE INDEX IF NOT EXISTS idx_adapted_cvs_postulationId ON adapted_cvs(postulationId);
  `);

  // Audit logs table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      eventType TEXT NOT NULL,
      userId TEXT,
      targetUserId TEXT,
      ipAddress TEXT,
      userAgent TEXT,
      timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      detailsEncrypted TEXT,
      yearMonth TEXT,
      month TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_audit_logs_userId ON audit_logs(userId);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);
  `);

  // Support tickets table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS support_tickets (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      supportAgentId TEXT,
      reason TEXT NOT NULL,
      status TEXT DEFAULT 'PENDING',
      createdAt TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      expiresAt TIMESTAMPTZ NOT NULL,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_support_tickets_userId ON support_tickets(userId);
  `);

  // Agent invocations table (for tracking agent calls and costs)
  await db.exec(`
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
      createdAt TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      completedAt TIMESTAMPTZ,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_agent_invocations_userId ON agent_invocations(userId);
    CREATE INDEX IF NOT EXISTS idx_agent_invocations_agentName ON agent_invocations(agentName);
    CREATE INDEX IF NOT EXISTS idx_agent_invocations_status ON agent_invocations(status);
    CREATE INDEX IF NOT EXISTS idx_agent_invocations_createdAt ON agent_invocations(createdAt);
  `);

  // Postulation matches table (results from cv-matcher agent)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS postulation_matches (
      id TEXT PRIMARY KEY,
      postulationId TEXT NOT NULL,
      userId TEXT NOT NULL,
      matchScore DOUBLE PRECISION,
      matchPercentage DOUBLE PRECISION,
      strengths TEXT, -- JSON array
      gaps TEXT, -- JSON array
      recommendation TEXT,
      createdAt TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (postulationId) REFERENCES postulations(id) ON DELETE CASCADE,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_postulation_matches_userId ON postulation_matches(userId);
    CREATE INDEX IF NOT EXISTS idx_postulation_matches_postulationId ON postulation_matches(postulationId);
  `);

  // Successful adaptations table (for memory & learning)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS successful_adaptations (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      jobTitle TEXT NOT NULL,
      company TEXT NOT NULL,
      atsScore DOUBLE PRECISION,
      keywords TEXT, -- JSON array
      cvChanges TEXT, -- JSON array
      createdAt TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_successful_adaptations_userId ON successful_adaptations(userId);
    CREATE INDEX IF NOT EXISTS idx_successful_adaptations_atsScore ON successful_adaptations(atsScore);
  `);

  // Application outcomes table (tracking results)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS application_outcomes (
      id TEXT PRIMARY KEY,
      adaptationId TEXT NOT NULL,
      userId TEXT NOT NULL,
      outcome TEXT NOT NULL, -- applied|interview|offer|rejection
      feedback TEXT,
      createdAt TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (adaptationId) REFERENCES successful_adaptations(id) ON DELETE CASCADE,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_application_outcomes_userId ON application_outcomes(userId);
    CREATE INDEX IF NOT EXISTS idx_application_outcomes_outcome ON application_outcomes(outcome);
  `);

  // Postulation outcomes table (for continuous learning)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS postulation_outcomes (
      id TEXT PRIMARY KEY,
      postulationId TEXT NOT NULL,
      userId TEXT NOT NULL,
      outcome TEXT NOT NULL,
      feedback TEXT,
      createdAt TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (postulationId) REFERENCES postulations(id) ON DELETE CASCADE,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_postulation_outcomes_userId ON postulation_outcomes(userId);
    CREATE INDEX IF NOT EXISTS idx_postulation_outcomes_outcome ON postulation_outcomes(outcome);
  `);

  // Datos duros estructurados. El historial laboral se extraía del CV y se
  // descartaba, así que el adaptador no tenía de dónde copiar empresas y fechas.
  await db.exec(`
    ALTER TABLE candidate_profiles ADD COLUMN IF NOT EXISTS experience TEXT;
    ALTER TABLE candidate_profiles ADD COLUMN IF NOT EXISTS languages TEXT;
    ALTER TABLE candidate_profiles ADD COLUMN IF NOT EXISTS certifications TEXT;
    ALTER TABLE candidate_profiles ADD COLUMN IF NOT EXISTS contactInfo TEXT;
    ALTER TABLE adapted_cvs ADD COLUMN IF NOT EXISTS narrative TEXT;
  `);

  // Ofertas reales: cada fuente trae su propio id, y la misma oferta vuelve en
  // cada sincronización, así que se identifica por fuente + id externo.
  await db.exec(`
    ALTER TABLE offers ADD COLUMN IF NOT EXISTS externalId TEXT;
    ALTER TABLE offers ADD COLUMN IF NOT EXISTS applyUrl TEXT;
    ALTER TABLE offers ADD COLUMN IF NOT EXISTS country TEXT;
    ALTER TABLE offers ADD COLUMN IF NOT EXISTS remoteModality TEXT;
    ALTER TABLE offers ADD COLUMN IF NOT EXISTS publishedAt TIMESTAMPTZ;
    ALTER TABLE offers ADD COLUMN IF NOT EXISTS lastSeenAt TIMESTAMPTZ;
    ALTER TABLE offers ADD COLUMN IF NOT EXISTS validThrough TIMESTAMPTZ;
    ALTER TABLE offers ADD COLUMN IF NOT EXISTS searchTitle TEXT;
    ALTER TABLE offers ADD COLUMN IF NOT EXISTS searchText TEXT;
    CREATE INDEX IF NOT EXISTS idx_offers_source ON offers(source);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_offers_source_externalId ON offers(source, externalId) WHERE externalId IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_offers_publishedAt ON offers(publishedAt);
  `);

  // Envío de postulaciones por la extensión. applyStatus sigue el envío;
  // estado sigue el proceso con el reclutador.
  await db.exec(`
    ALTER TABLE postulations ADD COLUMN IF NOT EXISTS applyStatus TEXT NOT NULL DEFAULT 'pendiente';
    ALTER TABLE postulations ADD COLUMN IF NOT EXISTS applyReason TEXT;
    ALTER TABLE postulations ADD COLUMN IF NOT EXISTS applyDetail TEXT;
    ALTER TABLE postulations ADD COLUMN IF NOT EXISTS applyUrl TEXT;
    ALTER TABLE postulations ADD COLUMN IF NOT EXISTS applyResolution TEXT;
    ALTER TABLE postulations ADD COLUMN IF NOT EXISTS applyAttempts INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE postulations ADD COLUMN IF NOT EXISTS applyQueuedAt TIMESTAMPTZ;
    ALTER TABLE postulations ADD COLUMN IF NOT EXISTS applyClaimedAt TIMESTAMPTZ;
    ALTER TABLE postulations ADD COLUMN IF NOT EXISTS applyUpdatedAt TIMESTAMPTZ;
    ALTER TABLE postulations ADD COLUMN IF NOT EXISTS sentAt TIMESTAMPTZ;
    CREATE INDEX IF NOT EXISTS idx_postulations_apply ON postulations(userId, applyStatus);

    CREATE TABLE IF NOT EXISTS application_events (
      id TEXT PRIMARY KEY,
      postulationId TEXT NOT NULL REFERENCES postulations(id) ON DELETE CASCADE,
      userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      fromStatus TEXT,
      toStatus TEXT NOT NULL,
      mode TEXT,
      reason TEXT,
      detail TEXT,
      createdAt TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_application_events_postulationId ON application_events(postulationId);

    CREATE TABLE IF NOT EXISTS extension_pairing_codes (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      codeHash TEXT NOT NULL UNIQUE,
      expiresAt TIMESTAMPTZ NOT NULL,
      usedAt TIMESTAMPTZ,
      createdAt TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS extension_tokens (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tokenHash TEXT NOT NULL UNIQUE,
      deviceName TEXT,
      createdAt TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      lastUsedAt TIMESTAMPTZ,
      revokedAt TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_extension_tokens_userId ON extension_tokens(userId);

    CREATE TABLE IF NOT EXISTS apply_preferences (
      userId TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      autoSendLinkedIn BOOLEAN NOT NULL DEFAULT FALSE,
      updatedAt TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // "Mis respuestas frecuentes": lo que el candidato decide una vez y FITCV usa
  // en todos los formularios. RUT y dirección se guardan cifrados. La
  // aceptación de términos de los portales es un consentimiento explícito, con
  // la fecha en que se dio. salaryAuthorized marca una postulación bajo el rango
  // de renta que el candidato autorizó igual.
  await db.exec(`
    ALTER TABLE apply_preferences ADD COLUMN IF NOT EXISTS salaryMin INTEGER;
    ALTER TABLE apply_preferences ADD COLUMN IF NOT EXISTS salaryMax INTEGER;
    ALTER TABLE apply_preferences ADD COLUMN IF NOT EXISTS availability TEXT;
    ALTER TABLE apply_preferences ADD COLUMN IF NOT EXISTS rut TEXT;
    ALTER TABLE apply_preferences ADD COLUMN IF NOT EXISTS address TEXT;
    ALTER TABLE apply_preferences ADD COLUMN IF NOT EXISTS comuna TEXT;
    ALTER TABLE apply_preferences ADD COLUMN IF NOT EXISTS region TEXT;
    ALTER TABLE apply_preferences ADD COLUMN IF NOT EXISTS nationality TEXT;
    ALTER TABLE apply_preferences ADD COLUMN IF NOT EXISTS driverLicense TEXT;
    ALTER TABLE apply_preferences ADD COLUMN IF NOT EXISTS willingToTravel BOOLEAN;
    ALTER TABLE apply_preferences ADD COLUMN IF NOT EXISTS shiftWork BOOLEAN;
    ALTER TABLE apply_preferences ADD COLUMN IF NOT EXISTS relocation BOOLEAN;
    ALTER TABLE apply_preferences ADD COLUMN IF NOT EXISTS workPermit BOOLEAN;
    ALTER TABLE apply_preferences ADD COLUMN IF NOT EXISTS acceptPortalTerms BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE apply_preferences ADD COLUMN IF NOT EXISTS acceptPortalTermsAt TIMESTAMPTZ;
    ALTER TABLE postulations ADD COLUMN IF NOT EXISTS salaryAuthorized BOOLEAN NOT NULL DEFAULT FALSE;
  `);

  // Análisis diario de ofertas: la hora la elige el candidato (hora de Chile);
  // cada corrida deja un resumen por calce y un aviso.
  await db.exec(`
    ALTER TABLE apply_preferences ADD COLUMN IF NOT EXISTS dailyAnalysisHour INTEGER;
    ALTER TABLE apply_preferences ADD COLUMN IF NOT EXISTS lastAnalysisDate TEXT;

    CREATE TABLE IF NOT EXISTS offer_digests (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      runDate TEXT NOT NULL,
      summary TEXT NOT NULL,
      createdAt TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_offer_digests_user ON offer_digests(userId, createdAt);

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      link TEXT,
      data TEXT,
      createdAt TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      readAt TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(userId, createdAt);
  `);

  // Recuperar contraseña: enlaces de un solo uso, guardados como hash.
  await db.exec(`
    CREATE TABLE IF NOT EXISTS password_resets (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tokenHash TEXT NOT NULL UNIQUE,
      expiresAt TIMESTAMPTZ NOT NULL,
      usedAt TIMESTAMPTZ,
      createdAt TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Caché del matching por usuario. Puntuar 3.000+ ofertas por request tomaba
  // ~50s y tumbaba el servidor; ahora el ranking y el diagnóstico se calculan en
  // background y se guardan aquí, y las páginas solo hacen un SELECT por userId.
  await db.exec(`
    CREATE TABLE IF NOT EXISTS user_match_cache (
      userId TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      ranked TEXT NOT NULL,      -- [{offerId, score, tier, reasons}] recomendadas, ordenadas
      tierCounts TEXT NOT NULL,  -- {alto, medio, bajo}
      diagnosis TEXT,            -- objeto Diagnosis serializado (o null si no aplica)
      computedAt TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // NO crear el índice GIN de trigramas aquí: sobre decenas de miles de ofertas
  // tarda minutos y cuelga el arranque (el puerto no abre y Render marca el
  // deploy como fallido). La caché de matching sirve las lecturas por id, no
  // necesita ese índice; solo aceleraría el filtro LIKE del recompute (que corre
  // en background). Si hace falta, se crea una vez con CREATE INDEX CONCURRENTLY
  // fuera del arranque.

  // Planes y cuotas de auto-postulación
  await db.exec(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free';

    CREATE TABLE IF NOT EXISTS plan_usage (
      userId TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      quotaUsed INTEGER NOT NULL DEFAULT 0,
      quotaResetAt TIMESTAMPTZ,
      dailyUsed INTEGER NOT NULL DEFAULT 0,
      dailyDate TEXT,
      updatedAt TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    ALTER TABLE postulations ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';
    ALTER TABLE postulations ADD COLUMN IF NOT EXISTS matchScore DOUBLE PRECISION;
    ALTER TABLE plan_usage ADD COLUMN IF NOT EXISTS overageQuota INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS googleId TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(googleId) WHERE googleId IS NOT NULL;
  `);

  console.log('✅ Database schema initialized');
}
