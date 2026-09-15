'use client';

import { FormEvent, useState } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/lib/components/Button';
import { Input } from '@/lib/components/Input';
import { Card, CardContent } from '@/lib/components/Card';

export default function LoginPage() {
  const router = useRouter();
  const { login, submitting, error } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLocalError(null);

    if (!email || !password) {
      setLocalError('Completa tu correo y tu contraseña.');
      return;
    }

    const result = await login({ email, password });
    if (result.ok) {
      router.push('/dashboard');
    } else {
      setLocalError(
        result.error === 'Invalid credentials' ? 'Correo o contraseña incorrectos.' : result.error ?? 'No se pudo iniciar sesión.'
      );
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">🎯 FITCV</h1>
          <p className="text-gray-600">Tu CV adaptado a cada oferta</p>
        </div>

        <Card className="shadow-xl">
          <CardContent className="p-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              {(localError || error) && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-4">
                  <p className="text-sm font-medium text-red-800">{localError || error}</p>
                </div>
              )}

              <Input
                label="Correo electrónico"
                type="email"
                autoComplete="email"
                placeholder="tu@correo.cl"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                icon="✉️"
              />

              <Input
                label="Contraseña"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                icon="🔒"
              />

              <div className="text-right text-sm">
                <Link href="/forgot-password" className="text-blue-600 hover:text-blue-700">
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>

              <Button type="submit" fullWidth size="lg" loading={submitting}>
                Ingresar
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="text-center mt-6">
          <p className="text-gray-600">
            ¿No tienes cuenta?{' '}
            <Link href="/register" className="text-blue-600 hover:text-blue-700 font-semibold">
              Regístrate
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
