'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [devResetUrl, setDevResetUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError(null);

    const res = (await apiClient.post('/auth/forgot-password', { email })) as { success: boolean; error?: string; devResetUrl?: string };
    if (res.success) {
      setSent(true);
      setDevResetUrl(res.devResetUrl ?? null);
    } else {
      setError(res.error || 'No se pudo enviar el enlace. Inténtalo de nuevo.');
    }
    setSending(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow p-6 space-y-4">
        <h1 className="text-2xl font-bold text-gray-900">Recuperar contraseña</h1>

        {sent ? (
          <>
            <p className="text-sm text-gray-700">
              Si hay una cuenta con ese correo, te enviamos un enlace para crear una nueva contraseña. Vence en 30
              minutos.
            </p>
            {devResetUrl && (
              <div className="rounded-md bg-yellow-50 p-3">
                <p className="text-xs text-yellow-900 mb-1">Modo desarrollo (sin servicio de correo):</p>
                <a href={devResetUrl} className="text-sm text-blue-600 break-all hover:underline">
                  Abrir el enlace de recuperación
                </a>
              </div>
            )}
          </>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <p className="text-sm text-gray-600">Escribe el correo de tu cuenta y te enviaremos un enlace.</p>
            {error && <p className="text-sm text-red-700">{error}</p>}
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="tu@correo.cl"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={sending}
              className="w-full py-2 px-4 text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            >
              {sending ? 'Enviando...' : 'Enviar enlace'}
            </button>
          </form>
        )}

        <p className="text-sm text-center">
          <Link href="/login" className="text-blue-600 hover:underline">
            Volver a ingresar
          </Link>
        </p>
      </div>
    </div>
  );
}
