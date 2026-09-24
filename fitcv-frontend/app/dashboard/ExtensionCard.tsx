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
  allowDataAnalysis: boolean;
}

const LINKEDIN_WARNING =
  'LinkedIn prohíbe las extensiones que automatizan actividad. Si FITCV envía solo tus postulaciones allí, ' +
  'LinkedIn podría restringir tu cuenta. ¿Quieres activarlo igual?';

export function ExtensionCard() {
  const [tokens, setTokens] = useState<ExtensionToken[]>([]);
  const [code, setCode] = useState<PairingCode | null>(null);
  const [prefs, setPrefs] = useState<Preferences>({ autoSendLinkedIn: false, allowDataAnalysis: false });
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

  const toggleDataAnalysis = async (enabled: boolean) => {
    setError(null);
    const res = await apiClient.put<Preferences>('/applications/preferences', {
      allowDataAnalysis: enabled,
    });
    if (res.success && res.data) setPrefs(res.data);
    else setError(res.error || 'No se pudo guardar la preferencia');
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
    <section className="aw-card" style={{ marginBottom: 24 }}>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:16, marginBottom:8 }}>
        <div>
          <h2 className="aw-h2">Extensión de Chrome</h2>
          <p className="aw-muted">
            Envía tus postulaciones en cola con tu CV adaptado. Solo envía sola lo que tu CV respalda; ante un CAPTCHA, un
            login o un sitio de empresa, se detiene y te avisa.
          </p>
        </div>
        <button onClick={generate} disabled={busy} className="aw-btn-gold aw-btn-sm" style={{ flexShrink:0 }}>
          {tokens.length > 0 ? 'Vincular otro navegador' : 'Vincular la extensión'}
        </button>
      </div>

      {code && (
        <div className="aw-info" style={{ marginTop:16 }}>
          <p style={{ marginBottom:8 }}>Abre la extensión de FITCV en Chrome y escribe este código:</p>
          <p style={{ fontFamily:'monospace', fontSize:28, fontWeight:700, letterSpacing:'.18em' }}>{code.code}</p>
          <p className="aw-dim" style={{ marginTop:8 }}>
            Sirve una sola vez y vence a las {new Date(code.expiresAt).toLocaleTimeString()}.
          </p>
        </div>
      )}

      {tokens.length > 0 ? (
        <ul style={{ marginTop:16 }}>
          {tokens.map(token => (
            <li key={token.id} className="aw-row">
              <div style={{ flex:1 }}>
                <p style={{ fontSize:14, fontWeight:600, color:'#F4F1E9' }}>{token.deviceName || 'Navegador'} · conectada</p>
                <p className="aw-dim">
                  Desde el {new Date(token.createdAt).toLocaleDateString()}
                  {token.lastUsedAt ? ` · último uso ${new Date(token.lastUsedAt).toLocaleString()}` : ''}
                </p>
              </div>
              <button onClick={() => disconnect(token.id)} style={{ fontSize:13, color:'#FCA5A5', background:'none', border:'none', cursor:'pointer' }}>
                Desconectar
              </button>
            </li>
          ))}
        </ul>
      ) : (
        !code && <p className="aw-muted" style={{ marginTop:16 }}>Todavía no hay una extensión vinculada.</p>
      )}

      <label style={{ display:'flex', alignItems:'flex-start', gap:8, marginTop:16, paddingTop:16, borderTop:'1px solid rgba(255,255,255,.08)', fontSize:13, color:'#A9B6C8', cursor:'pointer' }}>
        <input
          type="checkbox"
          checked={prefs.autoSendLinkedIn}
          onChange={e => void toggleLinkedIn(e.target.checked)}
          style={{ marginTop:2 }}
        />
        <span>
          Permitir el envío automático en LinkedIn. Está desactivado por defecto: LinkedIn prohíbe estas extensiones y
          podría restringir tu cuenta. Sin activarlo, FITCV completa el formulario y tú lo envías.
        </span>
      </label>

      <label style={{ display:'flex', alignItems:'flex-start', gap:8, marginTop:12, fontSize:13, color:'#A9B6C8', cursor:'pointer' }}>
        <input
          type="checkbox"
          checked={prefs.allowDataAnalysis}
          onChange={e => void toggleDataAnalysis(e.target.checked)}
          style={{ marginTop:2 }}
        />
        <span>
          Autorizo a FITCV a analizar mis datos de CV, postulaciones y uso de la plataforma para mejorar la precisión
          con que me postulo, personalizar las recomendaciones de ofertas y, en el futuro, ofrecerme servicios basados
          en mi experiencia. Podés revocar este permiso en cualquier momento desde{' '}
          <a href="/preferences" style={{ color:'#E1A526', textDecoration:'underline' }}>Mis preferencias</a>.
        </span>
      </label>

      {error && <p className="aw-error" style={{ marginTop:12 }}>{error}</p>}
    </section>
  );
}
