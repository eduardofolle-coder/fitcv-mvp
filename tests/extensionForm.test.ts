// @vitest-environment jsdom
/**
 * Lector de formularios y flujo de postulación de la extensión, sobre un DOM
 * real (jsdom). Lo que se fija aquí es lo que no se negocia: nunca se envía
 * con respuestas sin respaldo, y ante CAPTCHA o sitio de empresa se detiene.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

const FORM = `
  <header><input type="text" name="q" placeholder="Buscar empleos"></header>
  <form id="apply">
    <label for="name">Nombre completo *</label><input id="name" name="name" required>
    <label>Correo electrónico <input type="email" name="email" required></label>
    <div><span id="exp-label">Años de experiencia</span>
      <select name="years" aria-labelledby="exp-label">
        <option value="">Selecciona</option><option value="a">0-2</option><option value="b">3-5</option><option value="c">6-10</option>
      </select>
    </div>
    <p>¿Tienes experiencia en AWS?</p>
    <div><label><input type="radio" name="aws" value="1"> Sí</label><label><input type="radio" name="aws" value="0"> No</label></div>
    <label for="cv">Adjunta tu CV</label><input id="cv" type="file" accept=".pdf,.doc" style="display:none">
    <label for="letter">Carta de presentación (opcional)</label><textarea id="letter"></textarea>
    <input type="text" name="website" style="display:none" tabindex="-1">
    <input type="hidden" name="csrf" value="x">
    <button type="submit">Enviar postulación</button>
  </form>`;

let F: any;
let A: any;
let messages: any[] = [];
let resolveReply: (fields: any[]) => any = () => ({ resolutions: [], autoSendable: true });
let submitted = 0;

function load(html: string) {
  document.body.innerHTML = html;
  submitted = 0;
  document.querySelector('form')?.addEventListener('submit', event => {
    event.preventDefault();
    submitted += 1;
  });
}

const byLabel = (fields: any[], label: string) => fields.find(f => f.label === label);

beforeAll(async () => {
  (globalThis as any).chrome = {
    runtime: {
      lastError: undefined,
      sendMessage: (message: any, callback: (response: any) => void) => {
        messages.push(message);
        if (message.type === 'fitcv:resolve') callback({ data: resolveReply(message.fields) });
        else if (message.type === 'fitcv:cv') {
          callback({ data: { pdfBase64: Buffer.from('%PDF-1.4 prueba').toString('base64'), fileName: 'CV Juan Perez.pdf' } });
        } else callback({ data: { ok: true } });
      },
    },
  };
  await import('../fitcv-extension/content/formModel.js');
  await import('../fitcv-extension/content/apply.js');
  F = (globalThis as any).FitcvForm;
  A = (globalThis as any).FitcvApply;
});

beforeEach(() => {
  messages = [];
  load(FORM);
});

describe('extractFields', () => {
  it('reads the application form, not the site search or hidden traps', () => {
    const fields = F.extractFields(document);
    expect(fields.map((f: any) => f.label)).toEqual([
      'Nombre completo',
      'Correo electrónico',
      'Años de experiencia',
      '¿Tienes experiencia en AWS?',
      'Adjunta tu CV',
      'Carta de presentación (opcional)',
    ]);
  });

  it('keeps types, options and whether a field is required', () => {
    const fields = F.extractFields(document);
    expect(byLabel(fields, 'Nombre completo')).toMatchObject({ type: 'text', required: true });
    expect(byLabel(fields, 'Años de experiencia')).toMatchObject({ type: 'select', options: ['0-2', '3-5', '6-10'] });
    expect(byLabel(fields, 'Años de experiencia').required).toBeUndefined();
    expect(byLabel(fields, '¿Tienes experiencia en AWS?')).toMatchObject({ type: 'radio', options: ['Sí', 'No'] });
    expect(byLabel(fields, 'Adjunta tu CV')).toMatchObject({ type: 'file' });
    expect(byLabel(fields, 'Carta de presentación (opcional)')).toMatchObject({ type: 'textarea', required: false });
  });
});

describe('combobox sin ARIA (react-select y clones)', () => {
  // El widget más común en portales de empleo: un <input> de solo lectura sin
  // role="combobox" (solo aria-autocomplete) y opciones sin role="option",
  // ocultas hasta que un mousedown en el control las revela. Visto en
  // HiringRoom (custom-hr-select__*) y muchos "trabaja con nosotros" propios.
  const REACT_SELECT_FORM = `
    <form id="apply">
      <label for="doc_type">Tipo de documento *</label>
      <div>
        <div class="rs__control">
          <input id="doc_type" readonly aria-autocomplete="list" value="">
        </div>
        <div class="rs__menu" style="display:none">
          <div class="rs__option">Cédula de identidad</div>
          <div class="rs__option">Pasaporte</div>
        </div>
      </div>
      <button type="submit">Postular</button>
    </form>`;

  beforeEach(() => {
    load(REACT_SELECT_FORM);
    const control = document.querySelector('.rs__control') as HTMLElement;
    const menu = document.querySelector('.rs__menu') as HTMLElement;
    const input = document.getElementById('doc_type') as HTMLInputElement;
    control.addEventListener('mousedown', () => (menu.style.display = 'block'));
    input.addEventListener('keydown', e => {
      if ((e as KeyboardEvent).key === 'Escape') menu.style.display = 'none';
    });
    menu.querySelectorAll('.rs__option').forEach(opt =>
      opt.addEventListener('click', () => {
        (document.getElementById('doc_type') as HTMLInputElement).value = opt.textContent || '';
        menu.style.display = 'none';
      })
    );
  });

  it('lo detecta como combobox y lee sus opciones abriendo y cerrando el desplegable', () => {
    const fields = F.extractFields(document);
    expect(byLabel(fields, 'Tipo de documento')).toMatchObject({
      type: 'combobox',
      options: ['Cédula de identidad', 'Pasaporte'],
      required: true,
    });
    // No deja el desplegable abierto tras leerlo.
    expect((document.querySelector('.rs__menu') as HTMLElement).style.display).toBe('none');
  });

  it('elige la opción por su texto, sin depender de role="option"', () => {
    const fields = F.extractFields(document);
    const id = byLabel(fields, 'Tipo de documento').id;
    expect(F.fillField(document, id, 'Pasaporte')).toBe(true);
    expect((document.getElementById('doc_type') as HTMLInputElement).value).toBe('Pasaporte');
  });

  it('no inventa una opción que no está en la lista', () => {
    const fields = F.extractFields(document);
    const id = byLabel(fields, 'Tipo de documento').id;
    expect(F.fillField(document, id, 'Licencia de conducir')).toBe(false);
  });
});

describe('filling', () => {
  it('sets text so that framework listeners see it', () => {
    const fields = F.extractFields(document);
    const input = document.getElementById('name') as HTMLInputElement;
    let events = 0;
    input.addEventListener('input', () => (events += 1));

    expect(F.fillField(document, byLabel(fields, 'Nombre completo').id, 'Juan Perez')).toBe(true);
    expect(input.value).toBe('Juan Perez');
    expect(events).toBe(1);
  });

  it('chooses select and radio options by their visible text', () => {
    const fields = F.extractFields(document);
    expect(F.fillField(document, byLabel(fields, 'Años de experiencia').id, '6-10')).toBe(true);
    expect((document.querySelector('select') as HTMLSelectElement).value).toBe('c');

    expect(F.fillField(document, byLabel(fields, '¿Tienes experiencia en AWS?').id, 'Sí')).toBe(true);
    expect((document.querySelector('input[value="1"]') as HTMLInputElement).checked).toBe(true);
  });

  it('refuses a value the field does not offer', () => {
    const fields = F.extractFields(document);
    expect(F.fillField(document, byLabel(fields, 'Años de experiencia').id, 'Más de 20')).toBe(false);
  });

  it('attaches the CV as a PDF file, and only where PDFs are accepted', () => {
    const fields = F.extractFields(document);
    const id = byLabel(fields, 'Adjunta tu CV').id;
    const pdf = { base64: Buffer.from('%PDF').toString('base64'), fileName: 'CV Juan.pdf' };

    expect(F.attachFile(document, id, pdf)).toBe(true);
    expect((document.getElementById('cv') as HTMLInputElement).files?.[0]?.name).toBe('CV Juan.pdf');

    (document.getElementById('cv') as HTMLInputElement).setAttribute('accept', '.doc,.docx');
    expect(F.attachFile(document, id, pdf)).toBe(false);
  });
});

describe('page state', () => {
  it('detects a CAPTCHA challenge and a login wall', () => {
    expect(F.detectBlocker(document)).toBeNull();

    load(`${FORM}<iframe src="https://www.google.com/recaptcha/api2/anchor?k=x"></iframe>`);
    expect(F.detectBlocker(document)).toBe('captcha');

    load('<form><input type="email"><input type="password"><button>Ingresar</button></form>');
    expect(F.detectBlocker(document)).toBe('login');
  });

  it('finds the apply trigger, the next step and the final submit', () => {
    expect(F.findSubmit(document)?.textContent).toBe('Enviar postulación');

    load('<main><h1>Backend Engineer</h1><a href="/apply">Postular</a></main>');
    expect(F.findApplyTrigger(document)?.textContent).toBe('Postular');

    load('<form><label>Teléfono <input name="tel"></label><button type="button">Siguiente</button></form>');
    expect(F.findNextStep(document)?.textContent).toBe('Siguiente');
    expect(F.findSubmit(document)).toBeNull();
  });

  it('recognises a confirmation and validation errors', () => {
    load('<h1>¡Postulación enviada con éxito!</h1>');
    expect(F.detectSuccess(document)).toBe(true);

    load('<form><label for="p">Teléfono</label><input id="p" aria-invalid="true"><div role="alert">Este campo es obligatorio</div></form>');
    expect(F.detectValidationErrors(document)).toEqual(['Teléfono', 'Este campo es obligatorio']);
  });
});

describe('apply step', () => {
  const session = { step: 0, submitted: false, autoSend: true, source: 'getonbrd', sourceHost: null };

  const reply = (statuses: Record<string, string>, autoSendable: boolean) => (fields: any[]) => ({
    autoSendable,
    resolutions: fields.map((f: any) => {
      const status = statuses[f.label] ?? 'needs-user';
      const values: Record<string, string> = {
        'Nombre completo': 'Juan Perez',
        'Correo electrónico': 'juan@example.com',
        'Años de experiencia': '6-10',
        '¿Tienes experiencia en AWS?': 'Sí',
      };
      return { fieldId: f.id, status, value: values[f.label] ?? 'borrador' };
    }),
  });

  const allBacked = {
    'Nombre completo': 'filled',
    'Correo electrónico': 'filled',
    'Años de experiencia': 'filled',
    '¿Tienes experiencia en AWS?': 'filled',
    'Adjunta tu CV': 'use-adapted-cv',
    'Carta de presentación (opcional)': 'needs-approval',
  };

  it('fills and sends a form the CV fully backs, leaving the optional draft blank', async () => {
    resolveReply = reply(allBacked, true);

    const result = await A.step(session);

    expect(result).toEqual({ kind: 'clicked', submitted: true });
    expect(submitted).toBe(1);
    expect((document.getElementById('name') as HTMLInputElement).value).toBe('Juan Perez');
    expect((document.getElementById('cv') as HTMLInputElement).files?.[0]?.name).toBe('CV Juan Perez.pdf');
    expect((document.getElementById('letter') as HTMLTextAreaElement).value).toBe('');
  });

  it('never sends when a required answer is not backed by the CV', async () => {
    resolveReply = reply({ ...allBacked, '¿Tienes experiencia en AWS?': 'needs-approval' }, false);

    const result = await A.step(session);

    expect(result.outcome).toBe('requiere-atencion');
    expect(result.payload.reason).toBe('preguntas-sin-respaldo');
    expect(result.payload.detail).toContain('¿Tienes experiencia en AWS?');
    expect(submitted).toBe(0);
    // Lo que sí está respaldado queda completado para el candidato.
    expect((document.getElementById('name') as HTMLInputElement).value).toBe('Juan Perez');
    expect(document.getElementById('fitcv-banner')).not.toBeNull();
  });

  it('fills but does not send where automatic sending is off', async () => {
    resolveReply = reply(allBacked, true);

    const result = await A.step({ ...session, autoSend: false, source: 'linkedin' });

    expect(result.payload.reason).toBe('envio-automatico-desactivado');
    expect(submitted).toBe(0);
  });

  it('confirms the send once the portal shows its confirmation', async () => {
    load('<h1>¡Gracias por postular!</h1>');
    expect(await A.step({ ...session, step: 1, submitted: true })).toEqual({
      kind: 'report',
      outcome: 'enviada',
      payload: { mode: 'auto' },
    });
  });

  it('stops at a CAPTCHA without touching the form', async () => {
    load(`${FORM}<div class="h-captcha" data-sitekey="x"></div>`);
    const result = await A.step(session);

    expect(result.payload.reason).toBe('captcha');
    expect(messages.some(m => m.type === 'fitcv:resolve')).toBe(false);
    expect(submitted).toBe(0);
  });

  it('leaves a redirect to the company site pending, with its link', async () => {
    const result = await A.step({ ...session, source: 'computrabajo', sourceHost: 'computrabajo.com' });

    expect(result.payload.reason).toBe('sitio-empresa');
    expect(result.payload.applyUrl).toBe(location.href);
    expect(submitted).toBe(0);
  });

  it('opens the application form from the offer page', async () => {
    load('<main><h1>Backend Engineer</h1><button type="button">Postular</button></main>');
    let clicked = false;
    (document.querySelector('button') as HTMLButtonElement).addEventListener('click', () => (clicked = true));

    const result = await A.step(session);

    expect(result).toEqual({ kind: 'clicked', submitted: false });
    expect(clicked).toBe(true);
    // Antes del clic queda registrado que no había nada que responder.
    expect(messages).toContainEqual({ type: 'fitcv:resolve', fields: [] });
  });
});
