'use client';

import { useEffect } from 'react';

/**
 * Sin este boundary, cualquier error de render dejaba una pantalla en blanco
 * sin explicación ni forma de salir.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Unhandled UI error:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Algo se rompió de nuestro lado
        </h1>
        <p className="text-gray-600 mb-6">
          Tu información está a salvo. Puedes reintentar, y si vuelve a pasar,
          volver al inicio.
        </p>

        {error.digest && (
          <p className="text-xs text-gray-400 mb-6">
            Código de error: {error.digest}
          </p>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={reset}
            className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition"
          >
            Reintentar
          </button>
          <a
            href="/dashboard"
            className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-100 transition"
          >
            Ir al dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
