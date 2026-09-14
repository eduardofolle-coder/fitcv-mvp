'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';

interface PairingCode {
  code: string;
  expiresAt: string;
  // Dispositivos conectados al generar el código: si aumentan, se vinculó.
  baseline: number;
}

interface ExtensionToken {
  id: string;
  deviceName: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

interface Preferences {
  autoSendLinkedIn: boolean;
}

const LINKEDIN_WARNING =
  'LinkedIn prohíbe las extensiones que automatizan actividad. Si FITCV envía solo tus postulaciones allí, ' +
  'LinkedIn podría restringir tu cuenta. ¿Quieres activarlo igual?';

export function ExtensionCard() {
  const [tokens, setTokens] = useState<ExtensionToken[]>([]);
  const [code, setCode] = useState<PairingCode | null>(null);
  const [prefs, setPrefs] = useState<Preferences>({ autoSendLinkedIn: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTokens = useCallback(async (): Promise<ExtensionToken[] | null> => {
    const res = await apiClient.get<ExtensionToken[]>('/extension/tokens');
    if (!res.success || !Array.isArray(res.data)) return null;
    setTokens(res.data);
    return res.data;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadTokens();
      const res = await apiClient.get<Preferences>('/applications/preferences');
      if (!cancelled && res.success && res.data) setPrefs(res.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadTokens]);

  // Mientras el código está a la vista, se revisa si la extensión ya lo canjeó.
  useEffect(() => {
    if (!code) return;
    const timer = setInterval(async () => {
      if (new Date(code.expiresAt).getTime() < Date.now()) {
        setCode(null);
        return;
      }
      const list = await loadTokens();
      if (list && list.length > code.baseline) setCode(null);
    }, 4000);
    return () => clearInterval(timer);
  }, [code, loadTokens]);

  const generate = async () => {
    setBusy(true);
    setError(null);
    const res = await apiClient.post<{ code: string; expiresAt: string }>('/extension/pairing-codes');
    if (res.success && res.data) setCode({ ...res.data, baseline: tokens.length });
    else setError(res.error || 'No se pudo generar el código');
    setBusy(false);
  };

  const disconnect = async (id: string) => {
    setError(null);
    const res = await apiClient.delete(`/extension/tokens/${id}`);
    if (!res.success) setError(res.error || 'No se pudo desconectar la extensión');
    await loadTokens();
  };

  const toggleLinkedIn = async (enabled: boolean) => {
    if (enabled && !window.confirm(LINKEDIN_WARNING)) return;
    setError(null);
    const res = await apiClient.put<Preferences>('/applications/preferences', {
      autoSendLinkedIn: enabled,
      acknowledgeLinkedInRisk: enabled,
    });
    if (res.success && res.data) setPrefs(res.data);
    else setError(res.error || 'No se pudo guardar la preferencia');
  };

  return (
    <section className="bg-white rounded-lg shadow mb-8 p-6">
      <div className="flex items-start justify-between gap-4 mb-2">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Extensión de Chrome</h2>
          <p className="text-sm text-gray-600">
            Envía tus postulaciones en cola con tu CV adaptado. Solo envía sola lo que tu CV respalda; ante un CAPTCHA, un
            login o un sitio de empresa, se detiene y te avisa.
          </p>
        </div>
        <button
          onClick={generate}
          disabled={busy}
          className="shrink-0 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {tokens.length > 0 ? 'Vincular otro navegador' : 'Vincular la extensión'}
        </button>
      </div>

      {code && (
        <div className="rounded-lg bg-blue-50 p-4 mt-4">
          <p className="text-sm text-blue-900 mb-2">Abre la extensión de FITCV en Chrome y escribe este código:</p>
          <p className="text-3xl font-mono font-bold tracking-widest text-blue-900">{code.code}</p>
          <p className="text-xs text-blue-800 mt-2">
            Sirve una sola vez y vence a las {new Date(code.expiresAt).toLocaleTimeString()}.
          </p>
        </div>
      )}

      {tokens.length > 0 ? (
        <ul className="mt-4 divide-y divide-gray-100">
          {tokens.map(token => (
            <li key={token.id} className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium text-gray-900">{token.deviceName || 'Navegador'} · conectada</p>
                <p className="text-xs text-gray-500">
                  Desde el {new Date(token.createdAt).toLocaleDateString()}
                  {token.lastUsedAt ? ` · último uso ${new Date(token.lastUsedAt).toLocaleString()}` : ''}
                </p>
              </div>
              <button onClick={() => disconnect(token.id)} className="text-sm text-red-600 hover:underline">
                Desconectar
              </button>
            </li>
          ))}
        </ul>
      ) : (
        !code && <p className="text-sm text-gray-500 mt-4">Todavía no hay una extensión vinculada.</p>
      )}

      <label className="flex items-start gap-2 mt-4 pt-4 border-t border-gray-100 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={prefs.autoSendLinkedIn}
          onChange={e => void toggleLinkedIn(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          Permitir el envío automático en LinkedIn. Está desactivado por defecto: LinkedIn prohíbe estas extensiones y
          podría restringir tu cuenta. Sin activarlo, FITCV completa el formulario y tú lo envías.
        </span>
      </label>

      {error && <p className="text-sm text-red-700 mt-3">{error}</p>}
    </section>
  );
}
