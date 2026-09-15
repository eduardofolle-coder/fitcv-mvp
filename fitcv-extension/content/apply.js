/**
 * Un paso de la postulación dentro de la página.
 *
 * El background lo llama cada vez que la pestaña termina de cargar (o tras un
 * clic que no navega). Cada llamada mira el estado de la página y devuelve qué
 * pasó: un reporte final, o que hizo clic y hay que volver a mirar.
 *
 * Reglas que no se negocian:
 * - Solo se envía solo si FITCV resolvió todo lo obligatorio con datos del CV.
 * - Ante un CAPTCHA o un login se detiene: no los resuelve.
 * - Si la oferta lleva al sitio de la empresa, deja la postulación pendiente.
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

  const attention = (reason, detail, extra = {}) => ({
    kind: 'report',
    outcome: 'requiere-atencion',
    payload: { reason, ...(detail ? { detail: String(detail).slice(0, 500) } : {}), ...extra },
  });

  const sent = mode => ({ kind: 'report', outcome: 'enviada', payload: { mode } });

  const BANNER_ID = 'fitcv-banner';

  function banner(message, { manualSend = false } = {}) {
    const doc = document;
    let box = doc.getElementById(BANNER_ID);
    if (!box) {
      box = doc.createElement('div');
      box.id = BANNER_ID;
      box.setAttribute('role', 'status');
      box.style.cssText =
        'position:fixed;top:12px;right:12px;z-index:2147483647;max-width:360px;padding:12px 14px;' +
        'background:#1e3a8a;color:#fff;font:14px/1.4 system-ui,sans-serif;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.25)';
      doc.body.appendChild(box);
    }
    box.textContent = `FITCV: ${message}`;

    if (manualSend) {
      const button = doc.createElement('button');
      button.type = 'button';
      button.textContent = 'Ya la envié';
      button.style.cssText =
        'display:block;margin-top:8px;padding:6px 10px;border:0;border-radius:6px;background:#fff;color:#1e3a8a;font-weight:600;cursor:pointer';
      button.addEventListener('click', () => {
        send({ type: 'fitcv:manual-sent' }).then(
          () => (box.textContent = 'FITCV: registrada como enviada por ti.'),
          error => (box.textContent = `FITCV: no se pudo registrar (${error.message}).`)
        );
      });
      box.appendChild(button);
    }
  }

  const hostMatches = sourceHost =>
    !sourceHost || location.hostname === sourceHost || location.hostname.endsWith(`.${sourceHost}`);

  async function step(session) {
    const form = globalThis.FitcvForm;
    if (!form) return attention('formulario-no-reconocido', 'No se cargó el lector de formularios.');
    const doc = document;

    // Después de enviar solo queda confirmar el resultado.
    if (session.submitted) {
      if (form.detectSuccess(doc)) return sent('auto');
      const errors = form.detectValidationErrors(doc);
      if (errors.length > 0) {
        banner('El portal no aceptó el envío. Revisa los campos marcados y envía tú.', { manualSend: true });
        return attention('formulario-no-reconocido', `El portal rechazó el envío: ${errors.join('; ')}`);
      }
      return { kind: 'waiting' };
    }

    const blocker = form.detectBlocker(doc);
    if (blocker) {
      banner(
        blocker === 'captcha'
          ? 'El portal pide un CAPTCHA. FITCV no los resuelve: complétalo y envía tú.'
          : 'El portal pide iniciar sesión. Entra con tu cuenta y FITCV podrá seguir.',
        { manualSend: blocker === 'captcha' }
      );
      return attention(blocker, blocker === 'captcha' ? 'El portal pidió un CAPTCHA.' : 'El portal pide iniciar sesión.');
    }

    if (!hostMatches(session.sourceHost)) {
      banner('Esta oferta se postula en el sitio de la empresa. Quedó pendiente en tu tablero.', { manualSend: true });
      return attention('sitio-empresa', 'La oferta redirige al sitio de la empresa.', { applyUrl: location.href });
    }

    const fields = form.extractFields(doc);

    if (fields.length === 0) {
      if (session.step === 0 && form.detectSuccess(doc)) {
        return {
          kind: 'report',
          outcome: 'enviada',
          payload: { mode: 'manual', detail: 'El portal indica que ya habías postulado a esta oferta.' },
        };
      }
      // Tras un "postular" de un clic, el portal confirma sin mostrar formulario.
      if (session.step > 0 && form.detectSuccess(doc)) return sent('auto');

      const trigger = form.findApplyTrigger(doc);
      if (trigger && session.step < 3 && (session.autoSend || session.source === 'linkedin')) {
        // Registrar primero un formulario vacío: si el botón envía de un clic,
        // FITCV ya sabe que no había nada que responder.
        await send({ type: 'fitcv:resolve', fields: [] });
        trigger.click();
        return { kind: 'clicked', submitted: false };
      }

      banner('No encontré el formulario de postulación en esta página.', { manualSend: true });
      return attention('formulario-no-reconocido', 'No se encontró el formulario ni el botón para postular.');
    }

    const resolved = await send({ type: 'fitcv:resolve', fields });
    const byId = new Map((resolved.resolutions || []).map(r => [r.fieldId, r]));
    const blocking = [];
    let pdf = null;

    for (const field of fields) {
      const resolution = byId.get(field.id);
      let done = false;

      if (resolution && resolution.status === 'leave-blank') {
        // Casilla de publicidad: se deja sin marcar a propósito.
        done = true;
      } else if (resolution && resolution.status === 'filled') {
        done = form.fillField(doc, field.id, resolution.value);
      } else if (resolution && resolution.status === 'use-adapted-cv' && field.type === 'file') {
        pdf = pdf || (await send({ type: 'fitcv:cv' }));
        done = form.attachFile(doc, field.id, { base64: pdf.pdfBase64, fileName: pdf.fileName });
      }

      // Un opcional que el CV no responde queda en blanco.
      if (!done && field.required !== false) blocking.push(field.label);
    }

    if (!resolved.autoSendable) {
      banner(`Completé lo que tu CV respalda. Revisa: ${blocking.slice(0, 4).join(', ')}. Luego envía tú.`, {
        manualSend: true,
      });
      return attention('preguntas-sin-respaldo', `Campos por revisar: ${blocking.slice(0, 8).join('; ')}`);
    }

    if (blocking.length > 0) {
      banner(`No pude completar: ${blocking.slice(0, 4).join(', ')}. Revisa y envía tú.`, { manualSend: true });
      return attention('formulario-no-reconocido', `No se pudieron completar: ${blocking.slice(0, 8).join('; ')}`);
    }

    const submit = form.findSubmit(doc);
    const next = form.findNextStep(doc);

    if (!submit && next) {
      next.click();
      return { kind: 'clicked', submitted: false };
    }

    if (!submit) {
      banner('Completé el formulario pero no encontré el botón para enviar.', { manualSend: true });
      return attention('formulario-no-reconocido', 'No se encontró el botón para enviar.');
    }

    if (!session.autoSend) {
      banner('Formulario completo. El envío automático está desactivado para este portal: revisa y envía tú.', {
        manualSend: true,
      });
      return attention('envio-automatico-desactivado', 'Formulario completado; falta que lo envíes.');
    }

    submit.click();
    return { kind: 'clicked', submitted: true };
  }

  globalThis.FitcvApply = { step };
})();
