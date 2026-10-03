'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';

/** Aviso para quien todavía no confirmó su correo: sin esto no puede postular. */
export function VerifyEmailCard() {
  const [verified, setVerified] = useState<boolean | null>(null);
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    apiClient.get<{ verified: boolean }>('/auth/email-status').then(res => {
      if (res.success && res.data) setVerified(res.data.verified);
    });
  }, []);

  if (verified !== false) return null;

  const resend = async () => {
    setSending(true);
    const res = await apiClient.post('/auth/resend-verification');
    setSending(false);
    if (res.success) setSent(true);
  };

  return (
    <section className="aw-card" style={{ marginBottom: 24 }}>
      <h2 className="aw-h2">Confirma tu correo para postular</h2>
      <p className="aw-muted" style={{ marginBottom: 16 }}>
        Te enviamos un enlace al registrarte. Ábrelo para activar las postulaciones. Si no lo encuentras, revisa
        la carpeta de spam o pide otro.
      </p>
      {sent ? (
        <p className="aw-muted">Enviado. Revisa tu correo en un par de minutos.</p>
      ) : (
        <button onClick={resend} disabled={sending} className="aw-btn-gold">
          {sending ? 'Enviando…' : 'Reenviar correo de confirmación'}
        </button>
      )}
    </section>
  );
}
