'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';

export default function ResetPasswordPage() {
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // El token llega en el enlace del correo.
  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get('token'));
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setSaving(true);
    const res = await apiClient.post('/auth/reset-password', { token, password });
    if (res.success) {
      setDone(true);
    } else {
      setError(
        res.error?.includes('invalid or expired')
          ? 'El enlace no es válido o ya venció. Pide uno nuevo.'
          : res.error || 'No se pudo cambiar la contraseña.'
      );
    }
    setSaving(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow p-6 space-y-4">
        <h1 className="text-2xl font-bold text-gray-900">Nueva contraseña</h1>

        {done ? (
          <p className="text-sm text-gray-700">
            Listo, tu contraseña cambió. Por seguridad cerramos tus otras sesiones.{' '}
            <Link href="/login" className="text-blue-600 hover:underline">
              Ingresa con tu nueva contraseña
            </Link>
            .
          </p>
        ) : token === null ? (
          <p className="text-sm text-gray-700">
            Este enlace está incompleto.{' '}
            <Link href="/forgot-password" className="text-blue-600 hover:underline">
              Pide uno nuevo
            </Link>
            .
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {error && <p className="text-sm text-red-700">{error}</p>}
            <input
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Nueva contraseña (mínimo 12 caracteres)"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
            />
            <input
              type="password"
              required
              autoComplete="new-password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="Repite la contraseña"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
            />
            <p className="text-xs text-gray-500">Usa mayúsculas, minúsculas, números y al menos un símbolo.</p>
            <button
              type="submit"
              disabled={saving}
              className="w-full py-2 px-4 text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Cambiar contraseña'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
