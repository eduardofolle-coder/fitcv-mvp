/**
 * Asistente de registro en un portal de empleo.
 *
 * El candidato crea su cuenta en su propio navegador; FITCV le completa lo que
 * sale de su CV (nombre, correo, teléfono, RUT, comuna, estudios...). Reglas:
 * - Nunca toca la contraseña, las casillas (términos, publicidad) ni el botón
 *   para registrarse: eso lo hace el candidato.
 * - Nunca pisa lo que el candidato ya escribió.
 * - Ante un CAPTCHA no hace nada distinto: lo resuelve el candidato.
 *
 * Se vuelve a correr en cada página de la pestaña (el perfil del portal suele
 * tener varios pasos), hasta que el candidato pulsa "Terminar".
 */
(() => {
  const send = message =>
    new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, response => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message));
        else if (response && response.error) reject(new Error(response.error));
        else resolve(response ? response.data : undefined);
      });
    });

  const BANNER_ID = 'fitcv-signup-banner';

  function banner(lines) {
    const doc = document;
    let box = doc.getElementById(BANNER_ID);
    if (!box) {
      box = doc.createElement('div');
      box.id = BANNER_ID;
      box.setAttribute('role', 'status');
      box.style.cssText =
        'position:fixed;top:12px;right:12px;z-index:2147483647;max-width:380px;padding:12px 14px;' +
        'background:#1e3a8a;color:#fff;font:14px/1.45 system-ui,sans-serif;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.25)';
      doc.body.appendChild(box);
    }
    box.replaceChildren();
    lines.forEach((line, i) => {
      const p = doc.createElement('p');
      p.style.margin = i === 0 ? '0' : '6px 0 0';
      p.textContent = i === 0 ? `FITCV: ${line}` : line;
      box.appendChild(p);
    });
    const done = doc.createElement('button');
    done.type = 'button';
    done.textContent = 'Terminar ayuda';
    done.style.cssText =
      'display:inline-block;margin-top:8px;padding:6px 10px;border:0;border-radius:6px;background:#fff;color:#1e3a8a;font-weight:600;cursor:pointer';
    done.addEventListener('click', () => {
      send({ type: 'fitcv:signup-stop' }).finally(() => box.remove());
    });
    box.appendChild(done);
  }

  // Lo que el candidato ya escribió o eligió no se toca.
  function hasValue(doc, fieldId) {
    const el = doc.querySelector(`[data-fitcv-id="${fieldId}"]`);
    if (!el) return true;
    const tag = el.tagName.toLowerCase();
    if (tag === 'select') return el.selectedIndex > 0 && el.value !== '';
    if ((el.getAttribute('type') || '').toLowerCase() === 'file') return Boolean(el.files && el.files.length);
    if (tag === 'input' || tag === 'textarea') return String(el.value || '').trim() !== '';
    return false;
  }

  async function step() {
    const form = globalThis.FitcvForm;
    if (!form) return { filled: 0, pending: [] };
    const doc = document;

    const all = form.extractFields(doc);
    // Casillas (términos, publicidad) y lo ya completado quedan para el candidato.
    const fields = all.filter(f => f.type !== 'checkbox' && f.type !== 'radio' && !hasValue(doc, f.id));
    const hasPassword = [...doc.querySelectorAll('input[type="password"]')].some(form.isVisible);
    const hasCaptcha = form.detectBlocker(doc) === 'captcha';

    if (fields.length === 0) {
      if (all.length > 0 || hasPassword) {
        banner([
          'no queda nada que completar con tu CV en esta página.',
          hasPassword ? 'Crea tu contraseña, acepta los términos y regístrate tú.' : 'Revisa y continúa tú.',
        ]);
      }
      return { filled: 0, pending: [] };
    }

    const resolved = await send({ type: 'fitcv:signup-resolve', fields });
    const byId = new Map((resolved.resolutions || []).map(r => [r.fieldId, r]));
    let filled = 0;
    let pdf = null;
    const pending = [];

    for (const field of fields) {
      const r = byId.get(field.id);
      let done = false;
      if (r && r.status === 'filled') {
        done = form.fillField(doc, field.id, r.value);
      } else if (r && r.status === 'use-base-cv' && field.type === 'file') {
        pdf = pdf || (await send({ type: 'fitcv:signup-cv' }));
        done = form.attachFile(doc, field.id, { base64: pdf.pdfBase64, fileName: pdf.fileName });
      }
      if (done) filled++;
      else if (field.required !== false) pending.push(field.label);
    }

    const next = [];
    if (pending.length) next.push(`Completa tú: ${pending.slice(0, 5).join(', ')}.`);
    if (hasPassword) next.push('Crea tu contraseña (FITCV nunca la ve ni la guarda).');
    if (hasCaptcha) next.push('Resuelve el CAPTCHA.');
    next.push('Acepta los términos si estás de acuerdo y pulsa el botón para registrarte o continuar.');
    banner([`completé ${filled} campo(s) con tu CV.`, ...next]);

    return { filled, pending };
  }

  globalThis.FitcvSignup = { step };
})();
