import { describe, expect, it } from 'vitest';
import { extractApplyEmail } from '../src/services/applyEmail';
import { classifyOutcome, cleanScore, isPaused } from '../src/services/portalHealth';
import { makeState, readState, buildMime } from '../src/services/mailAccounts';
import { classifyByKeywords } from '../src/services/inbox';
import { composeApplication } from '../src/services/mailChannel';

const counts = (limpia: number, rest: number) => ({ limpia, asistida: 0, bloqueada: rest, atencion: 0, error: 0 });

describe('E1 salud por portal', () => {
  it('clasifica cada resultado', () => {
    expect(classifyOutcome({ toStatus: 'enviada', mode: 'auto', reason: null })).toBe('limpia');
    expect(classifyOutcome({ toStatus: 'enviada', mode: 'manual', reason: null })).toBe('asistida');
    expect(classifyOutcome({ toStatus: 'requiere-atencion', mode: null, reason: 'captcha' })).toBe('bloqueada');
    expect(classifyOutcome({ toStatus: 'requiere-atencion', mode: null, reason: 'sitio-empresa' })).toBe('atencion');
    expect(classifyOutcome({ toStatus: 'error', mode: null, reason: null })).toBe('error');
    expect(classifyOutcome({ toStatus: 'en-cola', mode: null, reason: null })).toBeNull();
  });

  it('se pausa con evidencia clara, sin depender de un número fijo de intentos', () => {
    // Extremo con pocos intentos: 0 limpias de 5 ya alcanza (como chiletrabajos real).
    expect(isPaused({ attempts: 5, counts: counts(0, 5) })).toBe(true);
    // Muy pocos intentos: ni con 0 limpias hay evidencia suficiente todavía.
    expect(isPaused({ attempts: 2, counts: counts(0, 2) })).toBe(false);
    // Cerca del 50%: con solo 20 intentos no alcanza para estar seguros, aunque el promedio ya esté abajo.
    expect(isPaused({ attempts: 20, counts: counts(9, 11) })).toBe(false);
    // Con más intentos, sí: 30% limpio en 100 intentos es evidencia suficiente.
    expect(isPaused({ attempts: 100, counts: counts(30, 70) })).toBe(true);
    // Buen desempeño no se pausa nunca.
    expect(isPaused({ attempts: 20, counts: counts(10, 10) })).toBe(false);
  });

  it('un portal sin historia pesa 50%', () => {
    expect(cleanScore({ attempts: 0, counts: counts(0, 0) })).toBe(0.5);
    expect(cleanScore({ attempts: 8, counts: counts(8, 0) })).toBeCloseTo(0.9);
  });
});

describe('E3 canal correo', () => {
  it('detecta el correo solo cuando se pide para postular', () => {
    expect(extractApplyEmail('Interesados enviar CV a Seleccion@Empresa.cl indicando pretensiones.')).toBe('seleccion@empresa.cl');
    expect(extractApplyEmail('Dudas del portal: soporte@empresa.cl')).toBeNull();
    expect(extractApplyEmail('Envía tu CV a noreply@empresa.cl')).toBeNull();
    expect(extractApplyEmail('Postula en https://www.computrabajo.cl')).toBeNull();
  });

  it('el state de OAuth no se puede falsificar ni reusar para otro proveedor', () => {
    const state = makeState('user-1', 'google', 1000);
    expect(readState(state, 'google', 2000)).toBe('user-1');
    expect(readState(state, 'microsoft', 2000)).toBeNull();
    expect(readState(state, 'google', 1000 + 11 * 60_000)).toBeNull();
    expect(readState(state.replace(/.$/, c => (c === 'A' ? 'B' : 'A')), 'google', 2000)).toBeNull();
  });

  it('arma el MIME con asunto codificado y el PDF adjunto', () => {
    const mime = buildMime('yo@gmail.com', {
      to: 'rrhh@empresa.cl',
      replyTo: 'c-1@inbox.fitcv.cl',
      subject: 'Postulación: Analista',
      text: 'Hola',
      attachment: { fileName: 'cv.pdf', base64: 'JVBERi0=' },
    });
    expect(mime).toContain('Reply-To: c-1@inbox.fitcv.cl');
    expect(mime).toContain('=?UTF-8?B?');
    expect(mime).toContain('filename="cv.pdf"');
  });

  it('la carta no inventa nada: solo cargo, empresa y contacto', () => {
    const { subject, text } = composeApplication({ title: 'Analista', company: 'ACME' }, { fullName: 'Ana Pérez', phone: '+569', email: 'a@b.cl' });
    expect(subject).toBe('Postulación: Analista - Ana Pérez');
    expect(text).toContain('de ACME');
    expect(text).toContain('Ana Pérez\n+569\na@b.cl');
  });
});

describe('E4 respuestas', () => {
  it('clasifica por palabras clave cuando la IA no responde', () => {
    expect(classifyByKeywords('Nos gustaría coordinar una entrevista el martes')).toBe('entrevista');
    expect(classifyByKeywords('Lamentamos informarte que no has sido seleccionado')).toBe('rechazo');
    expect(classifyByKeywords('Recibimos tu postulación')).toBe('otro');
  });
});
