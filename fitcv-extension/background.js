/**
 * Background de la extensión FITCV.
 *
 * Toma postulaciones de la cola de FITCV de a una, abre la oferta en una
 * pestaña, recorre el formulario con content/apply.js y reporta el resultado.
 * El token de la extensión vive solo aquí: la página nunca lo ve.
 */

// El popup permite cambiarla; esta es la de producción.
const DEFAULT_API = 'https://api.fitcv.cl/api';
const STEP_LIMIT = 10;
const RECHECK_MS = 4000;
const MAX_WAITS = 5;
const APPLICATION_TIMEOUT_MS = 3 * 60 * 1000;
// Pausa entre postulaciones: una por vez y sin apurar a los portales.
const DELAY_BETWEEN_MS = 30 * 1000;

const SOURCE_HOSTS = {
  linkedin: 'linkedin.com',
  computrabajo: 'computrabajo.com',
  laborum: 'laborum.cl',
  trabajando: 'trabajando.cl',
  getonbrd: 'getonbrd.com',
};

const OUTCOME_LABELS = {
  enviada: 'enviada',
  'requiere-atencion': 'requiere tu atención',
  error: 'error',
};

let session = null;

const settings = () => chrome.storage.local.get({ apiBase: DEFAULT_API, token: null, email: null, running: false, log: [] });

async function log(message) {
  const { log: entries } = await settings();
  entries.unshift({ at: new Date().toISOString(), message });
  await chrome.storage.local.set({ log: entries.slice(0, 50) });
}

async function api(path, { method = 'GET', body } = {}) {
  const { apiBase, token } = await settings();
  if (!token) throw new Error('La extensión no está vinculada a tu cuenta.');

  const res = await fetch(`${apiBase}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));

  if (res.status === 401) {
    await chrome.storage.local.set({ token: null, running: false });
  }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data.data;
}

async function pair(apiBase, code) {
  const base = String(apiBase || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//.test(base)) throw new Error('La dirección de FITCV debe empezar con http:// o https://');

  const res = await fetch(`${base}/extension/pair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, deviceName: 'Chrome' }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

  await chrome.storage.local.set({ apiBase: base, token: data.data.token });
  const me = await api('/extension/me');
  await chrome.storage.local.set({ email: me.email });
  await log(`Vinculada a ${me.email}.`);
  void checkPortals();
  return me;
}

// --- Sesión en los portales ----------------------------------------------------
// FITCV nunca ve ni guarda contraseñas. Solo pide, con la sesión que el candidato
// ya tiene en este navegador, una página del portal que exige estar conectado:
// si el portal la muestra, hay sesión; si redirige al login, no.

const PORTAL_RECHECK_MS = 60 * 1000;
let portalChecks = null;
const lastPortalCheck = new Map();

async function loadPortalChecks() {
  if (!portalChecks) portalChecks = await api('/extension/portal-checks');
  return portalChecks;
}

const trimPath = url => new URL(url).pathname.replace(/\/+$/, '') || '/';

async function hasSession(checkUrl) {
  const res = await fetch(checkUrl, { credentials: 'include', redirect: 'follow', cache: 'no-store' });
  const landed = trimPath(res.url);
  const asked = trimPath(checkUrl);
  if (/login|acceso|sign_?in|ingres/i.test(landed)) return false;
  // Mandado "hacia arriba" (de /candidatos/postulaciones a /candidatos): es el login.
  if (landed !== asked && asked.startsWith(`${landed}/`)) return false;
  return res.ok ? true : null;
}

async function checkPortals(only = null) {
  const { token } = await settings();
  if (!token) return;
  let checks;
  try {
    checks = await loadPortalChecks();
  } catch {
    return;
  }

  const results = [];
  for (const check of checks) {
    if (only && check.portal !== only) continue;
    lastPortalCheck.set(check.portal, Date.now());
    try {
      const connected = await hasSession(check.checkUrl);
      if (connected !== null) results.push({ portal: check.portal, connected });
    } catch {
      // Sin red o el portal no respondió: mejor no informar nada que informar mal.
    }
  }
  if (results.length === 0) return;
  await api('/extension/portal-sessions', { method: 'POST', body: { results } }).catch(() => undefined);
}

// Si el candidato navega en un portal (por ejemplo, recién inició sesión desde
// "Mis portales" en FITCV), se verifica ese portal en el acto.
async function checkPortalForTab(url) {
  if (!url || !/^https?:/.test(url)) return;
  let checks;
  try {
    checks = await loadPortalChecks();
  } catch {
    return;
  }
  const host = new URL(url).hostname;
  const check = checks.find(c => host === c.domain || host.endsWith(`.${c.domain}`));
  if (!check || Date.now() - (lastPortalCheck.get(check.portal) || 0) < PORTAL_RECHECK_MS) return;
  await checkPortals(check.portal);
}

chrome.alarms.get('fitcv-portals').then(alarm => {
  if (!alarm) chrome.alarms.create('fitcv-portals', { delayInMinutes: 1, periodInMinutes: 60 });
});

// --- Cola --------------------------------------------------------------------

function scheduleNext(delay = DELAY_BETWEEN_MS) {
  chrome.alarms.create('fitcv-next', { when: Date.now() + delay });
}

async function start() {
  await chrome.storage.local.set({ running: true });
  chrome.alarms.create('fitcv-poll', { periodInMinutes: 1 });
  await log('Envío automático iniciado.');
  await processNext();
  return status();
}

async function stop() {
  await chrome.storage.local.set({ running: false });
  await chrome.alarms.clear('fitcv-poll');
  await chrome.alarms.clear('fitcv-next');
  await log('Envío automático detenido. La postulación en curso termina sola.');
  return status();
}

async function processNext() {
  const { running, token } = await settings();
  if (!running || !token || session) return;

  let items;
  try {
    items = await api('/extension/queue?limit=1');
  } catch (error) {
    await log(`No se pudo leer la cola: ${error.message}`);
    return;
  }
  if (!items || items.length === 0) return;

  const item = items[0];
  const url = item.offer.applyUrl || item.offer.url;
  if (!url) {
    session = { ...item, tabId: null, step: 0, submitted: false, waits: 0 };
    await report('requiere-atencion', { reason: 'formulario-no-reconocido', detail: 'La oferta no tiene enlace para postular.' });
    return;
  }

  const tab = await chrome.tabs.create({ url, active: false });
  const current = { ...item, tabId: tab.id, step: 0, submitted: false, waits: 0 };
  current.timer = setTimeout(() => {
    if (session !== current) return;
    void (current.submitted
      ? report('requiere-atencion', { reason: 'otro', detail: 'No se pudo confirmar el envío a tiempo. Revisa la pestaña.' })
      : report('error', { detail: 'La página no respondió a tiempo.' }));
  }, APPLICATION_TIMEOUT_MS);
  session = current;

  await log(`Postulando: ${item.offer.title} (${item.offer.company}).`);
}

async function report(outcome, payload = {}) {
  const current = session;
  if (!current) return;
  session = null;
  clearTimeout(current.timer);
  clearTimeout(current.recheck);

  // Si el candidato tuvo que destrabarla, el envío cuenta como asistido.
  if (outcome === 'enviada' && current.resumed) payload = { ...payload, mode: 'manual' };

  try {
    await api(`/extension/postulations/${current.postulationId}/report`, { method: 'POST', body: { outcome, ...payload } });
    await log(
      `${current.offer.title} (${current.offer.company}): ${OUTCOME_LABELS[outcome]}${payload.detail ? ` — ${payload.detail}` : ''}.`
    );

    if (outcome === 'enviada' && current.tabId !== null) {
      await chrome.tabs.remove(current.tabId).catch(() => undefined);
    } else if (outcome === 'requiere-atencion' && current.tabId !== null) {
      // La pestaña queda abierta para el candidato, con el aviso de FITCV.
      await chrome.storage.session.set({ [`attention:${current.tabId}`]: current.postulationId });
    }
  } catch (error) {
    await log(`No se pudo registrar el resultado de ${current.offer.title}: ${error.message}`);
  }

  scheduleNext();
}

async function runStep() {
  const current = session;
  if (!current || current.tabId === null) return;

  if (current.step > STEP_LIMIT) {
    await report('requiere-atencion', { reason: 'formulario-no-reconocido', detail: 'El formulario tiene más pasos de los que FITCV recorre solo.' });
    return;
  }

  try {
    await chrome.scripting.executeScript({ target: { tabId: current.tabId }, files: ['content/formModel.js', 'content/apply.js'] });
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: current.tabId },
      func: state => globalThis.FitcvApply.step(state),
      args: [
        {
          step: current.step,
          submitted: current.submitted,
          resumed: current.resumed === true,
          autoSend: current.autoSend,
          source: current.offer.source,
          sourceHost: SOURCE_HOSTS[current.offer.source] || null,
        },
      ],
    });
    if (session !== current) return;
    await handleResult(current, injection && injection.result);
  } catch (error) {
    if (session !== current) return;
    await (current.submitted
      ? report('requiere-atencion', { reason: 'otro', detail: `Se envió, pero no se pudo confirmar: ${error.message}` })
      : report('error', { detail: `No se pudo operar la página: ${error.message}` }));
  }
}

function recheck(current) {
  clearTimeout(current.recheck);
  // Si el clic no navega (formularios de una sola página), se vuelve a mirar igual.
  current.recheck = setTimeout(() => {
    if (session === current) void runStep();
  }, RECHECK_MS);
}

async function handleResult(current, result) {
  if (!result) {
    await report('requiere-atencion', { reason: 'formulario-no-reconocido', detail: 'La página no devolvió un resultado.' });
    return;
  }

  if (result.kind === 'report') {
    await report(result.outcome, result.payload || {});
    return;
  }

  if (result.kind === 'clicked') {
    current.step += 1;
    if (result.submitted) current.submitted = true;
    recheck(current);
    return;
  }

  if (result.kind === 'waiting') {
    current.waits += 1;
    if (current.waits > MAX_WAITS) {
      await report('requiere-atencion', { reason: 'otro', detail: 'Se envió el formulario, pero el portal no confirmó. Revisa la pestaña.' });
      return;
    }
    recheck(current);
    return;
  }

  await report('requiere-atencion', { reason: 'formulario-no-reconocido', detail: 'Resultado inesperado de la página.' });
}

// --- Eventos -------------------------------------------------------------------

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === 'complete' && (!session || tabId !== session.tabId)) void checkPortalForTab(tab && tab.url);
  if (!session || tabId !== session.tabId) return;
  if (info.status === 'loading') clearTimeout(session.recheck);
  if (info.status === 'complete') void runStep();
});

chrome.tabs.onRemoved.addListener(tabId => {
  void chrome.storage.session.remove(`attention:${tabId}`);
  if (!session || tabId !== session.tabId) return;
  void (session.submitted
    ? report('requiere-atencion', { reason: 'otro', detail: 'La pestaña se cerró después de enviar. Confirma en el portal si llegó.' })
    : report('error', { detail: 'La pestaña se cerró antes de postular.' }));
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'fitcv-next' || alarm.name === 'fitcv-poll') void processNext();
  if (alarm.name === 'fitcv-portals') void checkPortals();
});

async function status() {
  const { apiBase, token, email, running, log: entries } = await settings();
  return {
    paired: Boolean(token),
    apiBase,
    email,
    running,
    current: session ? { title: session.offer.title, company: session.offer.company } : null,
    log: entries.slice(0, 15),
  };
}

async function captureTab(tabId) {
  const [injection] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const meta = name =>
        (document.querySelector(`meta[property="${name}"], meta[name="${name}"]`) || { getAttribute: () => '' }).getAttribute('content') || '';
      const heading = document.querySelector('h1');
      const main = document.querySelector('main, article, [role="main"]') || document.body;
      return {
        url: location.href,
        title: (meta('og:title') || (heading && heading.textContent) || document.title || '').trim(),
        description: (main.innerText || '').trim().slice(0, 20000),
      };
    },
  });
  const offer = injection && injection.result;
  if (!offer || !offer.title) throw new Error('No se pudo leer la oferta de esta página.');

  const saved = await api('/extension/offers', { method: 'POST', body: { ...offer, queue: true } });
  await log(`Agregada a la cola: ${offer.title}.`);
  return saved;
}

async function resumeFromTab(tabId) {
  const key = `attention:${tabId}`;
  const postulationId = (await chrome.storage.session.get(key))[key];
  if (!postulationId) throw new Error('FITCV no tiene una postulación pendiente en esta pestaña.');
  if (session) throw new Error('FITCV está enviando otra postulación; inténtalo en un minuto.');

  const item = await api(`/extension/postulations/${postulationId}/resume`, { method: 'POST' });
  await chrome.storage.session.remove(key);
  const current = { ...item, tabId, step: 0, submitted: false, waits: 0, resumed: true };
  current.timer = setTimeout(() => {
    if (session === current) void report('error', { detail: 'La página no respondió a tiempo.' });
  }, APPLICATION_TIMEOUT_MS);
  session = current;
  await log(`Continuando: ${item.offer.title} (${item.offer.company}).`);
  void runStep();
  return { ok: true };
}

async function markSentFromTab(tabId) {
  const key = `attention:${tabId}`;
  const stored = await chrome.storage.session.get(key);
  const postulationId = stored[key];
  if (!postulationId) throw new Error('FITCV no tiene una postulación pendiente en esta pestaña.');

  await api(`/extension/postulations/${postulationId}/report`, { method: 'POST', body: { outcome: 'enviada', mode: 'manual' } });
  await chrome.storage.session.remove(key);
  await log('Postulación registrada como enviada por ti.');
  return { ok: true };
}

const POPUP_COMMANDS = ['fitcv:status', 'fitcv:pair', 'fitcv:unpair', 'fitcv:start', 'fitcv:stop', 'fitcv:capture', 'fitcv:extract-offers'];

async function handleMessage(message, sender) {
  const type = message && message.type;

  // Lo que controla la cuenta solo puede venir del popup, nunca de una página.
  if (POPUP_COMMANDS.includes(type) && sender.tab) throw new Error('Comando no permitido desde una página.');

  switch (type) {
    case 'fitcv:resolve': {
      if (!session || !sender.tab || sender.tab.id !== session.tabId) throw new Error('No hay una postulación en curso en esta pestaña.');
      return api(`/extension/postulations/${session.postulationId}/resolve-fields`, {
        method: 'POST',
        body: { fields: Array.isArray(message.fields) ? message.fields : [] },
      });
    }
    case 'fitcv:cv': {
      if (!session || !sender.tab || sender.tab.id !== session.tabId) throw new Error('No hay una postulación en curso en esta pestaña.');
      return api(`/extension/postulations/${session.postulationId}/adapted-cv`, { method: 'POST' });
    }
    case 'fitcv:resume':
      if (!sender.tab) throw new Error('Falta la pestaña.');
      return resumeFromTab(sender.tab.id);
    case 'fitcv:manual-sent':
      if (!sender.tab) throw new Error('Falta la pestaña.');
      return markSentFromTab(sender.tab.id);
    case 'fitcv:status':
      return status();
    case 'fitcv:pair':
      return pair(message.apiBase, message.code);
    case 'fitcv:unpair':
      await chrome.storage.local.set({ token: null, email: null, running: false });
      return status();
    case 'fitcv:start':
      return start();
    case 'fitcv:stop':
      return stop();
    case 'fitcv:capture':
      return captureTab(message.tabId);
    case 'fitcv:extract-offers': {
      if (!message.tabId) throw new Error('Falta la pestaña.');
      const [injection] = await chrome.scripting.executeScript({
        target: { tabId: message.tabId },
        files: ['content/offerExtractor.js'],
      });
      const result = injection && injection.result;
      if (!result || result.count === 0) throw new Error('No se encontraron ofertas en esta página.');

      let saved = 0;
      for (const offer of result.offers) {
        try {
          const normalized = {
            url: offer.url,
            title: offer.title.slice(0, 300),
            company: offer.company.slice(0, 100),
            description: offer.description.slice(0, 20000),
          };
          await api('/extension/offers', { method: 'POST', body: { ...normalized, queue: true } });
          saved++;
        } catch (err) {
          await log(`No se pudo guardar "${offer.title}": ${err instanceof Error ? err.message : 'error desconocido'}`);
        }
      }
      await log(`Capturadas ${saved}/${result.count} ofertas de ${result.portal}.`);
      return { saved, total: result.count };
    }
    default:
      throw new Error('Mensaje desconocido.');
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(
    data => sendResponse({ data }),
    error => sendResponse({ error: error.message })
  );
  return true;
});
