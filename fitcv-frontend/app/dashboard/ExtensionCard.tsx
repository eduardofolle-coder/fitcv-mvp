'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';

// Reemplaza con la URL real después de publicar en Chrome Web Store:
// https://chromewebstore.google.com/detail/fitcv/[ID]
// O setea NEXT_PUBLIC_CHROME_EXTENSION_URL en las variables de entorno.
const CHROME_STORE_URL = process.env.NEXT_PUBLIC_CHROME_EXTENSION_URL ?? '';

interface PairingCode {
  code: string;
  expiresAt: string;
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
    return () => { cancelled = true; };
  }, [loadTokens]);

  useEffect(() => {
    if (!code) return;
    const timer = setInterval(async () => {
      if (new Date(code.expiresAt).getTime() < Date.now()) { setCode(null); return; }
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
    const res = await apiClient.put<Preferences>('/applications/preferences', { allowDataAnalysis: enabled });
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

  const noExtension = tokens.length === 0;

  return (
    <section className="aw-card" style={{ marginBottom: 24 }}>
      <h2 className="aw-h2">Extensión de Chrome</h2>
      <p className="aw-muted" style={{ marginBottom: 16 }}>
        Envía tus postulaciones en cola con tu CV adaptado. Solo envía lo que tu CV respalda; ante un CAPTCHA,
        un login o un sitio de empresa, se detiene y te avisa.
      </p>

      {noExtension && !code && (
        <div style={{ display:'flex', gap:12, marginBottom:20, flexWrap:'wrap' }}>
          {/* Paso 1 */}
          <div style={{
            flex:1, minWidth:220,
            background:'rgba(225,165,38,.06)', border:'1.5px solid rgba(225,165,38,.25)',
            borderRadius:10, padding:'16px 18px',
          }}>
            <p style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', color:'#E1A526', marginBottom:6 }}>
              Paso 1
            </p>
            <p style={{ fontWeight:700, color:'#F4F1E9', marginBottom:4 }}>Instala la extensión</p>
            <p className="aw-dim" style={{ marginBottom:12 }}>
              Agrégala a Chrome desde la tienda oficial. Son 2 clics.
            </p>
            {CHROME_STORE_URL ? (
              <a
                href={CHROME_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="aw-btn-gold aw-btn-sm"
                style={{ textDecoration:'none', display:'inline-flex' }}
              >
                Instalar en Chrome →
              </a>
            ) : (
              <span className="aw-pill aw-pill-gray">Próximamente en Chrome Web Store</span>
            )}
          </div>

          {/* Paso 2 */}
          <div style={{
            flex:1, minWidth:220,
            background:'rgba(255,255,255,.03)', border:'1.5px solid rgba(255,255,255,.1)',
            borderRadius:10, padding:'16px 18px',
          }}>
            <p style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', color:'#A9B6C8', marginBottom:6 }}>
              Paso 2
            </p>
            <p style={{ fontWeight:700, color:'#F4F1E9', marginBottom:4 }}>Vincula tu navegador</p>
            <p className="aw-dim" style={{ marginBottom:12 }}>
              Genera un código aquí, escríbelo en la extensión. Listo.
            </p>
            <button onClick={generate} disabled={busy} className="aw-btn-outline aw-btn-sm">
              {busy ? 'Generando…' : 'Generar código'}
            </button>
          </div>
        </div>
      )}

      {code && (
        <div className="aw-info" style={{ marginBottom:16 }}>
          <p style={{ marginBottom:8 }}>
            Abre la extensión de FITCV en Chrome{noExtension ? ' (Paso 2)' : ''} y escribe este código:
          </p>
          <p style={{ fontFamily:'monospace', fontSize:28, fontWeight:700, letterSpacing:'.18em' }}>{code.code}</p>
          <p className="aw-dim" style={{ marginTop:8 }}>
            Sirve una sola vez y vence a las {new Date(code.expiresAt).toLocaleTimeString()}.
          </p>
        </div>
      )}

      {!noExtension && (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
          <p style={{ fontSize:13, color:'#6EE7B7', fontWeight:600 }}>
            ✓ Extensión vinculada
          </p>
          <button onClick={generate} disabled={busy} className="aw-btn-outline aw-btn-sm">
            {busy ? 'Generando…' : 'Vincular otro navegador'}
          </button>
        </div>
      )}

      {!noExtension && (
        <ul style={{ marginBottom:16 }}>
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
      )}

      <div style={{ paddingTop:16, borderTop:'1px solid rgba(255,255,255,.08)' }}>
        <label style={{ display:'flex', alignItems:'flex-start', gap:8, fontSize:13, color:'#A9B6C8', cursor:'pointer' }}>
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
            con que me postulo. Podés revocar este permiso desde{' '}
            <a href="/preferences" style={{ color:'#E1A526', textDecoration:'underline' }}>Mis preferencias</a>.
          </span>
        </label>
      </div>

      {error && <p className="aw-error" style={{ marginTop:12 }}>{error}</p>}
    </section>
  );
}
