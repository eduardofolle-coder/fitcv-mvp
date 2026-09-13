import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md text-center">
        <p className="text-5xl font-black text-gray-300 mb-4">404</p>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Esta página no existe
        </h1>
        <p className="text-gray-600 mb-6">
          Puede que el enlace esté roto o que la página se haya movido.
        </p>
        <Link
          href="/"
          className="inline-block px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition"
        >
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}
