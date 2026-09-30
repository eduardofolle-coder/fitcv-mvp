'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';

type State = 'checking' | 'ok' | 'invalid' | 'missing';

export default function VerifyEmailPage() {
  const [state, setState] = useState<State>('checking');
  const [resent, setResent] = useState(false);

  // El token llega en el enlace del correo; se canjea al abrir la página.
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) {
      setState('missing');
      return;
    }
    (async () => {
      const res = await apiClient.post('/auth/verify-email', { token });
      setState(res.success ? 'ok' : 'invalid');
    })();
  }, []);

  const resend = async () => {
    await apiClient.post('/auth/resend-verification');
    setResent(true);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow p-6 space-y-4">
        <h1 className="text-2xl font-bold text-gray-900">Confirma tu correo</h1>

        {state === 'checking' && <p className="text-sm text-gray-700">Verificando...</p>}

        {state === 'ok' && (
          <p className="text-sm text-gray-700">
            Listo, tu correo quedó confirmado.{' '}
            <Link href="/offers" className="text-blue-600 hover:underline">
              Ver mis ofertas
            </Link>
            .
          </p>
        )}

        {(state === 'invalid' || state === 'missing') && (
          <>
            <p className="text-sm text-gray-700">
              {state === 'invalid'
                ? 'El enlace no es válido o ya venció.'
                : 'Este enlace está incompleto.'}{' '}
              Si tienes la sesión iniciada, te enviamos uno nuevo.
            </p>
            {resent ? (
              <p className="text-sm text-green-700">Enviado. Revisa tu correo (y la carpeta de spam).</p>
            ) : (
              <button
                onClick={resend}
                className="w-full py-2 px-4 text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
              >
                Reenviar correo de verificación
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
