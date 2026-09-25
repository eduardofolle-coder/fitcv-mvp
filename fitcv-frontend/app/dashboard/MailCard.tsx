'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';

interface MailState {
  account: { provider: 'google' | 'microsoft'; address: string; lastError: string | null } | null;
  providers: { google: boolean; microsoft: boolean };
  backup: boolean;
}

const RESULT: Record<string, string> = {
  connected: 'Listo: FITCV enviará las postulaciones por correo desde tu cuenta.',
  cancelled: 'No se conectó el correo: cancelaste el permiso.',
  invalid: 'El enlace de conexión venció. Inténtalo de nuevo.',
  failed: 'No se pudo conectar el correo. Revisa que aceptaste el permiso de envío.',
};

/**
 * Correo del candidato (E3): las ofertas que piden el CV por correo salen desde
 * su Gmail u Outlook, al instante, con solo permiso de envío.
 */
export function MailCard() {
  const [state, setState] = useState<MailState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const res = await apiClient.get<MailState>('/mail/account');
    if (res.success && res.data) setState(res.data);
  };

  useEffect(() => {
    const mail = new URLSearchParams(window.location.search).get('mail');
    if (mail && RESULT[mail]) setNotice(RESULT[mail]);
    void load();
  }, []);

  const connect = async (provider: 'google' | 'microsoft') => {
    setBusy(true);
    const res = await apiClient.get<{ url: string }>(`/mail/connect/${provider}`);
    if (res.success && res.data?.url) {
      window.location.href = res.data.url;
      return;
    }
    setNotice(res.error || 'No se pudo iniciar la conexión.');
    setBusy(false);
  };

  const disconnect = async () => {
    setBusy(true);
    await apiClient.delete('/mail/account');
    await load();
    setBusy(false);
  };

  if (!state) return null;
  const { account } = state;

  return (
    <section className="aw-card" style={{ marginBottom: 24 }}>
      <h2 className="aw-h2" style={{ marginBottom: 4 }}>Postular desde tu correo</h2>
      <p className="aw-muted" style={{ marginBottom: 12 }}>
        Muchas ofertas piden el CV por correo. FITCV las envía desde <strong>tu</strong> Gmail u Outlook, con tu CV adaptado,
        y quedan como &quot;Postulado&quot; al instante. Solo pedimos permiso para <strong>enviar</strong>: FITCV no puede leer tu bandeja.
      </p>

      {notice && <div className="aw-info" style={{ marginBottom: 12 }}>{notice}</div>}

      {account ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span className={account.lastError ? 'aw-pill aw-pill-red' : 'aw-pill aw-pill-green'}>
            {account.lastError ? 'Reconecta tu correo' : 'Conectado'}
          </span>
          <span style={{ color: '#F4F1E9' }}>{account.address}</span>
          {account.lastError && (
            <button disabled={busy} onClick={() => connect(account.provider)} className="aw-btn-gold aw-btn-sm">Reconectar</button>
          )}
          <button disabled={busy} onClick={disconnect} className="aw-btn-outline aw-btn-sm">Desconectar</button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button disabled={busy || !state.providers.google} onClick={() => connect('google')} className="aw-btn-gold aw-btn-sm">
            Conectar Gmail
          </button>
          <button disabled={busy || !state.providers.microsoft} onClick={() => connect('microsoft')} className="aw-btn-outline aw-btn-sm">
            Conectar Outlook
          </button>
          {!state.providers.google && !state.providers.microsoft && (
            <p className="aw-dim" style={{ width: '100%' }}>La conexión de correo se habilita pronto.</p>
          )}
          {state.backup && (
            <p className="aw-dim" style={{ width: '100%' }}>
              Sin conectarlo, FITCV envía desde su propio dominio con respuesta a tu correo, repartido durante el día.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
