'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function AuthCallbackInner() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const token = params.get('token');
    if (token) {
      try {
        localStorage.setItem('accessToken', token);
      } catch {}
      router.replace('/dashboard');
    } else {
      router.replace('/login?error=google_failed');
    }
  }, [params, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <p className="text-gray-500">Iniciando sesión...</p>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Iniciando sesión...</p>
      </div>
    }>
      <AuthCallbackInner />
    </Suspense>
  );
}
