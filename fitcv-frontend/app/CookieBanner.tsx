'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const STORAGE_KEY = 'fitcv_cookies_ok';

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
    } catch {
      // localStorage bloqueado (modo privado) → no mostrar banner
    }
  }, []);

  const accept = () => {
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* noop */ }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 bg-gray-900 text-white text-sm px-4 py-3 flex flex-wrap items-center gap-4 shadow-lg">
      <p className="flex-1 min-w-0">
        Usamos solo cookies técnicas necesarias para tu sesión. No hay cookies de publicidad.{' '}
        <Link href="/privacy" className="underline hover:text-gray-300">
          Política de privacidad
        </Link>
        .
      </p>
      <button
        onClick={accept}
        className="shrink-0 bg-white text-gray-900 font-medium px-4 py-1.5 rounded hover:bg-gray-100 transition"
      >
        Entendido
      </button>
    </div>
  );
}
