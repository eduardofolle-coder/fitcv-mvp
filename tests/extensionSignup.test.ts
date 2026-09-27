// @vitest-environment jsdom
/**
 * Asistente de registro de la extensión (content/signup.js), sobre un DOM
 * real (jsdom). Lo que se fija: solo completa lo que resuelve FITCV, nunca
 * toca contraseñas, casillas ni lo que el candidato ya escribió.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

const SIGNUP_FORM = `
  <form id="signup">
    <label for="name">Nombre completo</label><input id="name">
    <label for="email">Correo</label><input id="email" type="email">
    <label for="already">Teléfono</label><input id="already" value="+56 9 1234 5678">
    <label for="password">Contraseña</label><input id="password" type="password">
    <label><input type="checkbox" id="terms"> Acepto los términos y condiciones</label>
    <label><input type="checkbox" id="ads"> Quiero recibir novedades por correo</label>
    <label for="cv">Sube tu CV</label><input id="cv" type="file" accept=".pdf">
    <button type="submit">Registrarme</button>
  </form>`;

let S: any;
let resolveReply: (fields: any[]) => any = () => ({ resolutions: [] });
let cvRequested = 0;

function load(html: string) {
  document.body.innerHTML = html;
}

beforeAll(async () => {
  (globalThis as any).chrome = {
    runtime: {
      lastError: undefined,
      sendMessage: (message: any, callback: (response: any) => void) => {
        if (message.type === 'fitcv:signup-resolve') callback({ data: resolveReply(message.fields) });
        else if (message.type === 'fitcv:signup-cv') {
          cvRequested += 1;
          callback({ data: { pdfBase64: Buffer.from('%PDF-1.4 prueba').toString('base64'), fileName: 'CV Juan Perez.pdf' } });
        } else callback({ data: { ok: true } });
      },
    },
  };
  await import('../fitcv-extension/content/formModel.js');
  await import('../fitcv-extension/content/signup.js');
  S = (globalThis as any).FitcvSignup;
});

beforeEach(() => {
  cvRequested = 0;
  load(SIGNUP_FORM);
});

describe('asistente de registro', () => {
  it('completa lo que FITCV resuelve, adjunta el CV base y nunca toca contraseña ni casillas', async () => {
    resolveReply = fields => ({
      resolutions: fields.map((f: any) => {
        if (f.label === 'Nombre completo') return { fieldId: f.id, status: 'filled', value: 'Juan Pérez' };
        if (f.label === 'Correo') return { fieldId: f.id, status: 'filled', value: 'juan@example.com' };
        if (f.label === 'Sube tu CV') return { fieldId: f.id, status: 'use-base-cv' };
        return { fieldId: f.id, status: 'needs-user' };
      }),
    });

    const result = await S.step();

    expect((document.getElementById('name') as HTMLInputElement).value).toBe('Juan Pérez');
    expect((document.getElementById('email') as HTMLInputElement).value).toBe('juan@example.com');
    expect((document.getElementById('password') as HTMLInputElement).value).toBe('');
    expect((document.getElementById('terms') as HTMLInputElement).checked).toBe(false);
    expect((document.getElementById('cv') as HTMLInputElement).files?.length).toBe(1);
    expect(cvRequested).toBe(1);
    expect(result.filled).toBe(3); // nombre, correo y CV

    const banner = document.getElementById('fitcv-signup-banner')!;
    expect(banner.textContent).toMatch(/completé 3 campo/);
    expect(banner.textContent).toMatch(/Crea tu contraseña/);
    expect(banner.textContent).toMatch(/pulsa el botón para registrarte/);
  });

  it('no pisa lo que el candidato ya escribió', async () => {
    let sentFields: any[] = [];
    resolveReply = fields => {
      sentFields = fields;
      return { resolutions: fields.map((f: any) => ({ fieldId: f.id, status: 'filled', value: 'OTRO VALOR' })) };
    };

    await S.step();

    expect(sentFields.some((f: any) => f.label === 'Teléfono')).toBe(false); // ya tenía valor: no se pidió
    expect((document.getElementById('already') as HTMLInputElement).value).toBe('+56 9 1234 5678');
  });

  it('no llama a FITCV si ya no queda nada por completar', async () => {
    load(`<form><label for="name">Nombre completo</label><input id="name" value="Juan">
      <label for="email">Correo</label><input id="email" value="juan@example.com">
      <label><input type="checkbox" id="terms"> Acepto los términos</label>
      <button type="submit">Registrarme</button></form>`);
    resolveReply = () => {
      throw new Error('no debería llamarse');
    };

    const result = await S.step();
    expect(result.filled).toBe(0);
    const banner = document.getElementById('fitcv-signup-banner')!;
    expect(banner.textContent).toMatch(/no queda nada que completar/);
  });
});
