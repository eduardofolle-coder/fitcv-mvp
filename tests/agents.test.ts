/**
 * Integración de los agentes de IA.
 *
 * La llamada HTTP al modelo es una línea; todo lo demás —armar el prompt,
 * parsear la respuesta, normalizar el perfil, cifrar, persistir y traducir los
 * errores— es código propio y hasta acá no tenía ninguna prueba.
 *
 * El upstream se simula con un servidor local: eso NO valida que la API real
 * responda lo que esperamos (para eso hace falta una CLAUDE_API_KEY válida),
 * pero sí valida todo lo que ocurre a ambos lados de esa llamada, que es donde
 * están los bugs que el usuario sufre.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const PORT = 3200;
const STUB_PORT = 3201;
const API = `http://localhost:${PORT}/api`;
const DB_DIR = path.resolve(process.cwd(), 'tests', '.tmp-agents');

let server: ChildProcess | undefined;
let stub: http.Server | undefined;
let token = '';
let offerId = '';

/** Lo que devolverá el upstream simulado en la próxima llamada. */
let stubReply: { status: number; body: unknown; delayMs?: number } = {
  status: 200,
  body: null,
};
let lastPrompt = '';

const claudeText = (payload: unknown) => ({
  content: [{ type: 'text', text: typeof payload === 'string' ? payload : JSON.stringify(payload) }],
  usage: { input_tokens: 1200, output_tokens: 800 },
});

function startStub(): Promise<void> {
  return new Promise(resolve => {
    stub = http.createServer((req, res) => {
      let body = '';
      req.on('data', c => (body += c));
      req.on('end', () => {
        try {
          lastPrompt = JSON.parse(body).messages[0].content;
        } catch {
          lastPrompt = '';
        }
        const send = () => {
          res.writeHead(stubReply.status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(stubReply.body));
        };
        if (stubReply.delayMs) setTimeout(send, stubReply.delayMs);
        else send();
      });
    });
    stub.listen(STUB_PORT, () => resolve());
  });
}

function startServer(): Promise<void> {
  server = spawn(process.execPath, ['dist/server.js'], {
    env: {
      ...process.env,
      NODE_ENV: 'development',
      PORT: String(PORT),
      DATABASE_URL: `pglite://${path.relative(process.cwd(), DB_DIR).split(path.sep).join('/')}/pg`,
      CLAUDE_API_KEY: 'test-key-that-the-stub-accepts',
      CLAUDE_API_URL: `http://localhost:${STUB_PORT}/v1/messages`,
    },
    stdio: 'ignore',
  });

  return waitForHealth();
}

async function waitForHealth(): Promise<void> {
  // Arrancar PGlite en frío bajo carga puede superar con holgura los 30s.
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${PORT}/health`);
      if (res.ok) return;
    } catch {
      // arrancando
    }
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error('Server did not become healthy');
}

async function call(method: string, endpoint: string, body?: unknown) {
  const res = await fetch(`${API}${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  return { status: res.status, data };
}

const CV_TEXT = `Juan Perez
juan.perez@example.com
Santiago, Chile

RESUMEN
Ingeniero de software con 6 anos de experiencia en backend y cloud.

EXPERIENCIA
Senior Backend Engineer - Mercado Libre (2021-2024)
Backend Engineer - Falabella (2018-2020)

EDUCACION
Ingenieria Civil en Computacion - Universidad de Chile (2017)

HABILIDADES
JavaScript, TypeScript, Node.js, PostgreSQL, AWS, Docker`;

const ANALYZER_OK = {
  success: true,
  profile: {
    fullName: 'Juan Perez',
    email: 'juan.perez@example.com',
    phone: '+56 9 1234 5678',
    location: 'Santiago, Chile',
    summary: 'Ingeniero de software con 6 anos de experiencia.',
    yearsExperience: 6,
    education: [{ institution: 'Universidad de Chile', degree: 'Ingenieria Civil en Computacion' }],
    skills: { programming: ['TypeScript', 'JavaScript'], tools: ['Docker', 'AWS'] },
    experience: [
      {
        company: 'Mercado Libre',
        title: 'Senior Backend Engineer',
        startDate: '2021-01',
        endDate: '2024-06',
        responsibilities: ['Microservicios en Node.js y TypeScript'],
        achievements: ['Migracion de monolito a AWS'],
      },
      {
        company: 'Falabella',
        title: 'Backend Engineer',
        startDate: '2018-03',
        endDate: '2020-12',
        responsibilities: ['APIs REST con Express y PostgreSQL'],
      },
    ],
    languages: [{ language: 'Espanol', proficiency: 'Nativo' }],
  },
};

beforeAll(async () => {
  fs.rmSync(DB_DIR, { recursive: true, force: true });
  fs.mkdirSync(DB_DIR, { recursive: true });
  await startStub();
  await startServer();

  const reg = await call('POST', '/auth/register', {
    email: `agents-${Date.now()}@example.com`,
    password: 'AgentTestPass123!',
  });
  token = reg.data.data.accessToken;

  const offers = await call('GET', '/offers');
  offerId = offers.data.data[0].id;
}, 120_000);

afterAll(async () => {
  server?.kill();
  await new Promise<void>(r => (stub ? stub.close(() => r()) : r()));
});

describe('cv-analyzer', () => {
  it('sends the CV text to the model and stores the profile it returns', async () => {
    stubReply = { status: 200, body: claudeText(ANALYZER_OK) };

    const upload = await call('POST', '/cv/upload', { cvContent: CV_TEXT });
    expect(upload.status).toBe(200);

    // El CV del usuario tiene que llegar realmente al prompt.
    expect(lastPrompt).toContain('Mercado Libre');
    expect(lastPrompt).toContain('CV Analyzer Agent');

    expect(upload.data.data.profile.fullName).toBe('Juan Perez');
    expect(upload.data.data.profile.yearsExperience).toBe(6);

    // Y tiene que sobrevivir el viaje de ida y vuelta a la base.
    const profile = await call('GET', '/cv/profile');
    expect(profile.status).toBe(200);
    expect(profile.data.data.fullName).toBe('Juan Perez');
    expect(profile.data.data.skills.programming).toContain('TypeScript');
  }, 30_000);

  it('accepts JSON wrapped in a markdown block, which models emit constantly', async () => {
    stubReply = {
      status: 200,
      body: claudeText('```json\n' + JSON.stringify(ANALYZER_OK) + '\n```'),
    };

    const upload = await call('POST', '/cv/upload', { cvContent: CV_TEXT });
    expect(upload.status).toBe(200);
    expect(upload.data.data.profile.fullName).toBe('Juan Perez');
  }, 30_000);

  it('survives a profile with sections missing', async () => {
    // Un CV sin educación ni skills no puede tumbar la subida.
    stubReply = {
      status: 200,
      body: claudeText({ success: true, profile: { fullName: 'Sin Secciones' } }),
    };

    const upload = await call('POST', '/cv/upload', { cvContent: CV_TEXT });
    expect(upload.status).toBe(200);
    expect(upload.data.data.profile.education).toEqual([]);
    expect(upload.data.data.profile.yearsExperience).toBe(0);
  }, 30_000);

  it('replaces the profile when the CV is uploaded again', async () => {
    stubReply = {
      status: 200,
      body: claudeText({ success: true, profile: { ...ANALYZER_OK.profile, fullName: 'Juan Perez Actualizado' } }),
    };

    const upload = await call('POST', '/cv/upload', { cvContent: CV_TEXT });
    expect(upload.status).toBe(200);

    const profile = await call('GET', '/cv/profile');
    expect(profile.data.data.fullName).toBe('Juan Perez Actualizado');
  }, 30_000);
});

describe('offer-ranker', () => {
  it('ranks the seeded offers against the stored CV', async () => {
    stubReply = {
      status: 200,
      body: claudeText({
        success: true,
        rankings: [
          { rank: 1, jobTitle: 'ML Engineer', company: 'NotCo', overallScore: 88, verdict: 'Strong fit' },
          { rank: 2, jobTitle: 'Senior Data Analyst', company: 'Amazon', overallScore: 71, verdict: 'Decent fit' },
        ],
        candidateSummary: { name: 'Juan Perez', yearsExperience: 6 },
      }),
    };

    const ranked = await call('GET', '/offers/ranked');
    expect(ranked.status).toBe(200);
    expect(ranked.data.data.rankings).toHaveLength(2);
    expect(ranked.data.data.rankings[0].overallScore).toBe(88);

    // Las ofertas reales deben viajar en el prompt, no una lista vacía.
    expect(lastPrompt).toContain('Offer Ranker Agent');
    expect(lastPrompt).toContain('NotCo');
  }, 30_000);
});

describe('cv-adapter', () => {
  let postulationId = '';
  let generated: { status: number; data: any } = { status: 0, data: null };

  it('lets the model shape the story while FITCV copies every hard fact', async () => {
    const created = await call('POST', '/postulations', {
      offerId,
      estado: 'Por revisar',
      prioridad: 'Alta',
    });
    expect(created.status).toBe(201);
    postulationId = created.data.data.postulationId;

    stubReply = {
      status: 200,
      body: claudeText({
        success: true,
        narrative: {
          headline: 'Backend Engineer orientado a sistemas distribuidos',
          summary: 'Ingeniero backend que ha llevado sistemas de un monolito a la nube.',
          highlights: {
            'exp-0': [
              { text: 'Diseñó microservicios en Node.js y TypeScript', sourceIndex: 0 },
              { text: 'Dirigió una organización de 50 personas', sourceIndex: 99 },
            ],
          },
          skillsFirst: ['AWS', 'Salesforce'],
          rationale: 'La oferta prioriza arquitectura distribuida.',
        },
        atsScore: 91,
        keywordMatches: ['TypeScript', 'AWS'],
      }),
    };

    generated = await call('POST', `/postulations/${postulationId}/generate-cv`);
    expect(generated.status).toBe(200);
    expect(generated.data.data.atsScore).toBe(91);
    expect(generated.data.data.rationale).toContain('arquitectura distribuida');

    // El modelo recibe los datos duros estructurados, sin nombre ni contacto.
    expect(lastPrompt).toContain('CV Narrative Adapter');
    expect(lastPrompt).toContain('Mercado Libre');
    expect(lastPrompt).not.toContain('+56 9 1234 5678');
  }, 40_000);

  it('reports the narrative it refused because the CV does not support it', () => {
    const adjustments: string[] = generated.data.data.adjustments;
    expect(adjustments.some(a => a.includes('no correspondía'))).toBe(true);
    expect(adjustments.some(a => a.includes('Salesforce'))).toBe(true);
  });

  it('stores the assembled CV encrypted, with hard facts verbatim', async () => {
    const cv = await call('GET', `/postulations/${postulationId}/cv`);
    expect(cv.status).toBe(200);

    const content: string = cv.data.data.content;
    expect(content).toContain('Senior Backend Engineer — Mercado Libre');
    expect(content).toContain('2021-01 – 2024-06');
    expect(content).toContain('Backend Engineer — Falabella');
    expect(content).toContain('Universidad de Chile');
    expect(content).toContain('Diseñó microservicios en Node.js y TypeScript');
    expect(content).not.toContain('50 personas');
    expect(content).not.toContain('Salesforce');

    // La narrativa también se guarda cifrada; si no se descifrara, no llegaría.
    expect(cv.data.data.narrative.headline).toContain('sistemas distribuidos');
  }, 30_000);
});

describe('cuando el modelo o el servicio fallan', () => {
  // El límite de subidas es por usuario, así que este bloque usa uno propio en
  // vez de gastar el presupuesto del usuario de los tests anteriores.
  beforeAll(async () => {
    stubReply = { status: 200, body: claudeText(ANALYZER_OK) };
    const reg = await call('POST', '/auth/register', {
      email: `agent-errors-${Date.now()}@example.com`,
      password: 'AgentTestPass123!',
    });
    token = reg.data.data.accessToken;
  }, 30_000);

  it('reports credentials as 503, never as the user being unauthorized', async () => {
    stubReply = { status: 401, body: { error: { message: 'invalid x-api-key' } } };

    const upload = await call('POST', '/cv/upload', { cvContent: CV_TEXT });
    expect(upload.status).toBe(503);
    expect(String(upload.data.error)).toMatch(/credentials/i);
    // Un 401 acá haría que el frontend cerrara la sesión del usuario.
    expect(upload.status).not.toBe(401);
  }, 30_000);

  it('passes rate limiting through as 429 so the client can retry', async () => {
    stubReply = { status: 429, body: { error: { message: 'rate_limit_error' } } };

    const upload = await call('POST', '/cv/upload', { cvContent: CV_TEXT });
    expect(upload.status).toBe(429);
    expect(String(upload.data.error)).toMatch(/rate limit/i);
  }, 30_000);

  it('reports an upstream outage as 503', async () => {
    stubReply = { status: 500, body: { error: { message: 'overloaded' } } };

    const upload = await call('POST', '/cv/upload', { cvContent: CV_TEXT });
    expect(upload.status).toBe(503);
    expect(String(upload.data.error)).toMatch(/unavailable/i);
  }, 30_000);

  it('does not crash on unparseable model output', async () => {
    stubReply = { status: 200, body: claudeText('Lo siento, no puedo procesar este CV.') };

    const upload = await call('POST', '/cv/upload', { cvContent: CV_TEXT });
    expect(upload.status).toBeGreaterThanOrEqual(400);

    const health = await fetch(`http://localhost:${PORT}/health`);
    expect(health.ok).toBe(true);
  }, 30_000);

  it('stays healthy after every failure above', async () => {
    stubReply = { status: 200, body: claudeText(ANALYZER_OK) };

    const upload = await call('POST', '/cv/upload', { cvContent: CV_TEXT });
    expect(upload.status).toBe(200);
  }, 30_000);
});
