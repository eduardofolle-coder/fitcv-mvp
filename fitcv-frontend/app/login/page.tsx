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
  const { login, loading, error } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLocalError(null);

    if (!email || !password) {
      setLocalError('Please fill in all fields');
      return;
    }

    const success = await login({ email, password });
    if (success) {
      router.push('/dashboard');
    } else {
      setLocalError(error || 'Login failed');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo & Header */}
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">🎯 FITCV</h1>
          <p className="text-gray-600">
            Welcome back to your AI job assistant
          </p>
        </div>

        {/* Card */}
        <Card className="shadow-xl">
          <CardContent className="p-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              {(localError || error) && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-4">
                  <p className="text-sm font-medium text-red-800">
                    {localError || error}
                  </p>
                </div>
              )}

              <Input
                label="Email Address"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                icon="✉️"
              />

              <Input
                label="Password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                icon="🔒"
              />

              <div className="flex items-center justify-between text-sm">
                <label className="flex items-center">
                  <input type="checkbox" className="rounded border-gray-300" />
                  <span className="ml-2 text-gray-600">Remember me</span>
                </label>
                <a href="#" className="text-blue-600 hover:text-blue-700">
                  Forgot password?
                </a>
              </div>

              <Button
                type="submit"
                fullWidth
                size="lg"
                loading={loading}
              >
                Sign In
              </Button>
            </form>

            {/* Divider */}
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">or</span>
              </div>
            </div>

            {/* Social Login (placeholder) */}
            <div className="grid grid-cols-2 gap-4">
              <Button variant="secondary" fullWidth>
                Google
              </Button>
              <Button variant="secondary" fullWidth>
                GitHub
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Sign Up Link */}
        <div className="text-center mt-6">
          <p className="text-gray-600">
            Don't have an account?{' '}
            <Link href="/register" className="text-blue-600 hover:text-blue-700 font-semibold">
              Sign up here
            </Link>
          </p>
        </div>

        {/* Features Preview */}
        <div className="mt-10 grid grid-cols-3 gap-4 text-center text-sm">
          <div className="text-gray-600">
            <div className="text-2xl mb-2">🤖</div>
            <p>AI Analysis</p>
          </div>
          <div className="text-gray-600">
            <div className="text-2xl mb-2">📄</div>
            <p>CV Adapt</p>
          </div>
          <div className="text-gray-600">
            <div className="text-2xl mb-2">🎯</div>
            <p>Matching</p>
          </div>
        </div>
      </div>
    </div>
  );
}
