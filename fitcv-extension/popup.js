const $ = id => document.getElementById(id);

const call = message =>
  new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, response => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else if (response && response.error) reject(new Error(response.error));
      else resolve(response ? response.data : undefined);
    });
  });

function showError(id, error) {
  const el = $(id);
  el.textContent = error ? error.message : '';
  el.hidden = !error;
}

async function render() {
  const status = await call({ type: 'fitcv:status' });

  $('pairing').hidden = status.paired;
  $('paired').hidden = !status.paired;
  if (!status.paired && status.apiBase) $('api').value = status.apiBase;

  $('email').textContent = status.email || '';
  $('state').textContent = status.current
    ? `Postulando: ${status.current.title} (${status.current.company})`
    : status.running
      ? 'Envío activo: esperando postulaciones en cola.'
      : 'Envío detenido.';
  $('start').disabled = status.running;
  $('stop').disabled = !status.running;

  const list = $('log');
  list.replaceChildren(
    ...status.log.map(entry => {
      const item = document.createElement('li');
      item.textContent = `${new Date(entry.at).toLocaleTimeString()} · ${entry.message}`;
      return item;
    })
  );
}

const run = (id, message) => async () => {
  showError('action-error', null);
  try {
    await call(message());
  } catch (error) {
    showError('action-error', error);
  }
  await render();
};

$('pair').addEventListener('click', async () => {
  showError('pair-error', null);
  try {
    await call({ type: 'fitcv:pair', apiBase: $('api').value, code: $('code').value });
    $('code').value = '';
  } catch (error) {
    showError('pair-error', error);
  }
  await render();
});

$('start').addEventListener('click', run('start', () => ({ type: 'fitcv:start' })));
$('stop').addEventListener('click', run('stop', () => ({ type: 'fitcv:stop' })));
$('unpair').addEventListener('click', run('unpair', () => ({ type: 'fitcv:unpair' })));

$('capture').addEventListener('click', async () => {
  showError('action-error', null);
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const result = await call({ type: 'fitcv:extract-offers', tabId: tab.id });
    const msg = `Capturadas ${result.saved}/${result.total} ofertas. Se agregarán a la cola automáticamente.`;
    console.log(msg);
  } catch (error) {
    showError('action-error', error);
  }
  await render();
});

void render();
setInterval(() => void render(), 3000);
