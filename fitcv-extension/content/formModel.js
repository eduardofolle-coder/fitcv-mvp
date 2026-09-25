/**
 * Lector de formularios de postulación.
 *
 * Solo entiende la página: qué campos hay y cómo se llaman, cómo llenarlos,
 * dónde está el botón de enviar y si apareció un bloqueo (CAPTCHA, login). No
 * decide qué responder: eso lo resuelve FITCV contra el CV del candidato.
 *
 * Es un script clásico (se inyecta en la pestaña) que se publica en
 * globalThis.FitcvForm, para que apply.js y los tests lo usen igual.
 */
(() => {
  const fold = value =>
    String(value || '')
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();

  const textOf = node => (node && node.textContent ? node.textContent.replace(/\s+/g, ' ').trim() : '');

  const quoteAttr = value => String(value).replace(/["\\]/g, '\\$&');

  const IGNORED_TYPES = ['hidden', 'submit', 'button', 'reset', 'image', 'search', 'password'];

  // jsdom no calcula layout; en un navegador real un elemento sin cajas no se ve.
  const hasLayout = () => !/jsdom/i.test((globalThis.navigator && globalThis.navigator.userAgent) || '');

  function isVisible(el) {
    if (!el || el.hidden || el.closest('[hidden], [aria-hidden="true"]')) return false;
    if ((el.getAttribute('type') || '').toLowerCase() === 'hidden') return false;

    const win = el.ownerDocument.defaultView;
    for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
      const style = win.getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
    }
    return !hasLayout() || el.getClientRects().length > 0;
  }

  function controlType(el) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'select') return 'select';
    if (tag === 'textarea') return 'textarea';
    if (tag === 'input') return (el.getAttribute('type') || 'text').toLowerCase();
    // Elemento no nativo con rol de selector (div/span/ul custom dropdown)
    const role = (el.getAttribute('role') || '').toLowerCase();
    if (role === 'combobox' || role === 'listbox') return 'combobox';
    return (el.getAttribute('type') || 'text').toLowerCase();
  }

  // Los campos se ubican dentro del formulario de postulación, no en el buscador del sitio.
  function isCandidateControl(el) {
    const type = controlType(el);
    if (IGNORED_TYPES.includes(type) || el.disabled) return false;
    if (el.closest('header, nav, [role="search"]')) return false;
    // Un input de archivo suele estar oculto tras un botón propio del sitio.
    return type === 'file' || isVisible(el);
  }

  function ariaLabel(el) {
    const doc = el.ownerDocument;
    const ids = el.getAttribute('aria-labelledby');
    if (ids) {
      const text = ids
        .split(/\s+/)
        .map(id => textOf(doc.getElementById(id)))
        .join(' ')
        .trim();
      if (text) return text;
    }
    return (el.getAttribute('aria-label') || '').trim();
  }

  // Texto de un <label> sin el texto de los controles que envuelve.
  function labelText(label) {
    const clone = label.cloneNode(true);
    clone.querySelectorAll('input, select, textarea, option').forEach(node => node.remove());
    return textOf(clone);
  }

  function nearbyText(el) {
    let node = el;
    for (let depth = 0; depth < 3 && node; depth++) {
      for (let prev = node.previousElementSibling; prev; prev = prev.previousElementSibling) {
        if (prev.matches('input, select, textarea, button, script, style')) continue;
        if (prev.querySelector('input, select, textarea')) continue;
        const text = textOf(prev);
        if (text) return text.slice(0, 200);
      }
      node = node.parentElement;
      if (!node || node.matches('form, body, [role="dialog"]')) break;
    }
    return '';
  }

  function labelFor(el) {
    const doc = el.ownerDocument;

    const aria = el.getAttribute('aria-labelledby') ? ariaLabel(el) : '';
    if (aria) return aria;

    if (el.id) {
      const label = doc.querySelector(`label[for="${quoteAttr(el.id)}"]`);
      if (label && labelText(label)) return labelText(label);
    }

    const wrapping = el.closest('label');
    if (wrapping && labelText(wrapping)) return labelText(wrapping);

    const direct = (el.getAttribute('aria-label') || '').trim();
    if (direct) return direct;

    return nearbyText(el) || (el.getAttribute('placeholder') || '').trim() || (el.getAttribute('title') || '').trim();
  }

  function groupLabel(group) {
    const first = group[0];

    const fieldset = first.closest('fieldset');
    const legend = fieldset && fieldset.querySelector('legend');
    if (legend && textOf(legend)) return textOf(legend);

    const radiogroup = first.closest('[role="radiogroup"]');
    if (radiogroup && ariaLabel(radiogroup)) return ariaLabel(radiogroup);

    let container = first.parentElement;
    while (container && !group.every(radio => container.contains(radio))) container = container.parentElement;
    const text = container ? nearbyText(container) : '';
    return text || first.name || 'Opción';
  }

  function fillableIn(root) {
    // Incluye custom dropdowns (div/span con role="combobox") además de los controles nativos
    const seen = new Set();
    return [...root.querySelectorAll('input, textarea, select, [role="combobox"]:not(input):not(select):not(textarea)')]
      .filter(el => !seen.has(el) && seen.add(el) && isCandidateControl(el));
  }

  /** El formulario de postulación: un diálogo abierto o el <form> con más campos. */
  function pickScope(doc) {
    const dialogs = [...doc.querySelectorAll('[role="dialog"], dialog[open]')].filter(isVisible);
    let best = null;
    let bestCount = 0;
    for (const candidate of [...dialogs, ...doc.querySelectorAll('form')]) {
      const count = fillableIn(candidate).length;
      if (count > bestCount) {
        best = candidate;
        bestCount = count;
      }
    }
    return best || doc.body;
  }

  function requiredFlag(el, label) {
    if (/\b(opcional|optional)\b/i.test(label)) return false;
    if (el.required || el.getAttribute('aria-required') === 'true' || /\*\s*$/.test(label)) return true;
    // Sin marca: FITCV lo trata como obligatorio.
    return undefined;
  }

  const cleanLabel = label => label.replace(/\s*\*\s*$/, '').trim();

  /**
   * Campos del formulario, con un data-fitcv-id en cada control para poder
   * llenarlo después. Los ids se reasignan en cada lectura.
   */
  function extractFields(doc) {
    doc.querySelectorAll('[data-fitcv-id]').forEach(node => node.removeAttribute('data-fitcv-id'));

    const scope = pickScope(doc);
    const fields = [];
    const seenGroups = new Set();
    let counter = 0;

    for (const el of fillableIn(scope)) {
      const type = controlType(el);

      if (type === 'radio') {
        if (!el.name || seenGroups.has(el.name)) continue;
        seenGroups.add(el.name);

        const group = fillableIn(scope).filter(r => controlType(r) === 'radio' && r.name === el.name);
        const id = `fitcv-${counter++}`;
        group.forEach(radio => radio.setAttribute('data-fitcv-id', id));

        const label = groupLabel(group);
        const field = {
          id,
          label: cleanLabel(label),
          type: 'radio',
          options: group.map(radio => labelFor(radio) || radio.value),
        };
        const required = group.some(radio => radio.required) ? true : requiredFlag(el, label);
        if (required !== undefined) field.required = required;
        fields.push(field);
        continue;
      }

      const id = `fitcv-${counter++}`;
      el.setAttribute('data-fitcv-id', id);

      const label = labelFor(el) || el.name || el.id || 'Campo sin nombre';
      const field = { id, label: cleanLabel(label) || label, type };

      if (type === 'select') {
        field.options = [...el.options].filter(o => o.value !== '' && !o.disabled).map(textOf);
      }

      if (type === 'combobox') {
        const listboxId = el.getAttribute('aria-controls') || el.getAttribute('aria-owns');
        const listbox = listboxId
          ? doc.getElementById(listboxId)
          : el.parentElement && el.parentElement.querySelector('[role="listbox"]');
        if (listbox) {
          field.options = [...listbox.querySelectorAll('[role="option"]')].map(textOf).filter(Boolean);
        }
      }

      const maxLength = Number(el.getAttribute('maxlength'));
      if (Number.isInteger(maxLength) && maxLength > 0) field.maxLength = maxLength;

      const required = requiredFlag(el, label);
      if (required !== undefined) field.required = required;

      fields.push(field);
    }

    return fields;
  }

  // Los sitios hechos con React ignoran un .value asignado directamente: hay que
  // usar el setter nativo y avisar con eventos.
  function setNativeValue(el, value) {
    const win = el.ownerDocument.defaultView;
    const proto =
      el.tagName === 'TEXTAREA'
        ? win.HTMLTextAreaElement.prototype
        : el.tagName === 'SELECT'
          ? win.HTMLSelectElement.prototype
          : win.HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    if (descriptor && descriptor.set) descriptor.set.call(el, value);
    else el.value = value;

    el.dispatchEvent(new win.Event('input', { bubbles: true }));
    el.dispatchEvent(new win.Event('change', { bubbles: true }));
  }

  const YES = ['si', 'yes', 'true', '1'];

  function fillField(doc, fieldId, value) {
    const controls = [...doc.querySelectorAll(`[data-fitcv-id="${quoteAttr(fieldId)}"]`)];
    if (controls.length === 0 || typeof value !== 'string') return false;

    const el = controls[0];
    const type = controlType(el);
    const target = fold(value);

    if (type === 'radio') {
      const radio =
        controls.find(r => fold(labelFor(r)) === target) || controls.find(r => fold(r.value) === target);
      if (!radio) return false;
      if (!radio.checked) radio.click();
      return radio.checked;
    }

    if (type === 'checkbox') {
      const wanted = YES.includes(target);
      if (el.checked !== wanted) el.click();
      return el.checked === wanted;
    }

    if (type === 'select') {
      const options = [...el.options];
      const option = options.find(o => fold(o.textContent) === target) || options.find(o => fold(o.value) === target);
      if (!option) return false;
      setNativeValue(el, option.value);
      return el.value === option.value;
    }

    if (type === 'file') return false;

    if (type === 'combobox') {
      const doc = el.ownerDocument;
      const listboxId = el.getAttribute('aria-controls') || el.getAttribute('aria-owns');
      let listbox = listboxId
        ? doc.getElementById(listboxId)
        : el.parentElement && el.parentElement.querySelector('[role="listbox"]');
      // Abre el dropdown; muchas impl. React renderizan opciones sincrónicamente al click.
      el.click();
      if (!listbox) listbox = doc.querySelector('[role="listbox"]');
      if (!listbox) return false;
      const option = [...listbox.querySelectorAll('[role="option"]')].find(o => fold(textOf(o)) === target);
      if (!option) return false;
      option.click();
      return true;
    }

    setNativeValue(el, value);
    return el.value === value;
  }

  const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

  // Decodificador propio: no depende de window.atob, que una página puede
  // reemplazar y que no todos los entornos exponen igual.
  function base64ToBytes(base64) {
    const clean = String(base64).replace(/[^A-Za-z0-9+/]/g, '');
    const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4));
    let buffer = 0;
    let bits = 0;
    let index = 0;
    for (let i = 0; i < clean.length; i++) {
      buffer = (buffer << 6) | BASE64_ALPHABET.indexOf(clean[i]);
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        bytes[index++] = (buffer >> bits) & 0xff;
      }
    }
    return bytes.subarray(0, index);
  }

  function acceptsPdf(accept) {
    if (!accept) return true;
    return accept
      .split(',')
      .map(part => part.trim().toLowerCase())
      .some(part => part === '.pdf' || part === 'application/pdf' || part === 'application/*' || part === '*/*');
  }

  function attachFile(doc, fieldId, file) {
    const el = doc.querySelector(`[data-fitcv-id="${quoteAttr(fieldId)}"]`);
    if (!el || controlType(el) !== 'file' || !file || !file.base64) return false;
    if (!acceptsPdf(el.getAttribute('accept'))) return false;

    const win = doc.defaultView;
    const bytes = base64ToBytes(file.base64);
    const blob = new win.File([bytes], file.fileName || 'CV.pdf', { type: file.mimeType || 'application/pdf' });

    if (typeof win.DataTransfer === 'function') {
      const transfer = new win.DataTransfer();
      transfer.items.add(blob);
      el.files = transfer.files;
    } else {
      // Entornos sin DataTransfer (jsdom): mismo resultado observable.
      Object.defineProperty(el, 'files', { configurable: true, value: { 0: blob, length: 1, item: i => (i === 0 ? blob : null) } });
    }

    el.dispatchEvent(new win.Event('input', { bubbles: true }));
    el.dispatchEvent(new win.Event('change', { bubbles: true }));
    return Boolean(el.files && el.files.length === 1);
  }

  /** CAPTCHA o login. FITCV nunca los resuelve: se detiene y avisa. */
  function detectBlocker(doc) {
    const challenge = [
      ...doc.querySelectorAll(
        'iframe[src*="recaptcha/api2/anchor"], iframe[src*="recaptcha/api2/bframe"], iframe[src*="hcaptcha"], ' +
          'iframe[src*="challenges.cloudflare.com"], .g-recaptcha:not([data-size="invisible"]), .h-captcha, .cf-turnstile'
      ),
    ].some(isVisible);
    if (challenge) return 'captcha';

    if ([...doc.querySelectorAll('input[type="password"]')].some(isVisible)) return 'login';
    return null;
  }

  const buttonText = el => fold(el.textContent || el.value || el.getAttribute('aria-label') || '');

  const APPLY_TEXT =
    /^(postular(me|se)?|postulate|aplicar( ahora| a esta oferta)?|apply( now)?|easy apply|solicitud sencilla|enviar (mi )?(cv|postulacion)|quiero postular)\b/;
  const SUBMIT_TEXT =
    /^(enviar|postular(me)?|apply|submit|finalizar|confirmar|enviar solicitud|enviar postulacion|submit application)\b/;
  const NEXT_TEXT = /^(siguiente|continuar|next|continue|revisar|review)\b/;

  function findApplyTrigger(doc) {
    const candidates = [
      ...doc.querySelectorAll('a, button, [role="button"], input[type="button"], input[type="submit"]'),
    ].filter(el => isVisible(el) && !el.closest('header, nav'));
    return candidates.find(el => APPLY_TEXT.test(buttonText(el))) || null;
  }

  function actionButtons(doc) {
    const scope = pickScope(doc);
    return [...scope.querySelectorAll('button, input[type="submit"], [role="button"]')].filter(
      el => isVisible(el) && !el.disabled
    );
  }

  function findNextStep(doc) {
    return actionButtons(doc).find(el => NEXT_TEXT.test(buttonText(el))) || null;
  }

  function findSubmit(doc) {
    const buttons = actionButtons(doc);
    return (
      buttons.find(el => SUBMIT_TEXT.test(buttonText(el))) ||
      buttons.find(el => (el.getAttribute('type') || '').toLowerCase() === 'submit' && !NEXT_TEXT.test(buttonText(el))) ||
      null
    );
  }

  const SUCCESS_TEXT =
    /(postulacion (enviada|exitosa|recibida|realizada|completada)|te (has )?postulado|ya (te )?postulaste|gracias por (tu )?postula|hemos recibido tu (postulacion|cv|solicitud)|solicitud enviada|application (submitted|sent|received)|your application (was|has been) (sent|submitted)|thanks for applying)/;

  function detectSuccess(doc) {
    return SUCCESS_TEXT.test(fold(doc.body ? doc.body.textContent : ''));
  }

  function detectValidationErrors(doc) {
    const invalid = [...doc.querySelectorAll('[aria-invalid="true"]')].filter(isVisible).map(labelFor);
    const messages = [
      ...doc.querySelectorAll('[role="alert"], .error, .invalid-feedback, .field-error, .error-message'),
    ]
      .filter(isVisible)
      .map(textOf);
    return [...new Set([...invalid, ...messages].filter(Boolean))].slice(0, 5);
  }

  globalThis.FitcvForm = {
    fold,
    isVisible,
    labelFor,
    extractFields,
    fillField,
    attachFile,
    detectBlocker,
    findApplyTrigger,
    findNextStep,
    findSubmit,
    detectSuccess,
    detectValidationErrors,
  };
})();
