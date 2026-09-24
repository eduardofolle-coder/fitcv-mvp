import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Política de privacidad — FITCV' };

export default function PrivacyPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-12 text-gray-700">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Política de privacidad</h1>
      <p className="text-sm text-gray-500 mb-8">Última actualización: septiembre 2026</p>

      <section className="space-y-6 text-sm leading-relaxed">
        <div>
          <h2 className="font-semibold text-gray-900 mb-1">1. Quién trata tus datos</h2>
          <p>
            FITCV (en adelante "nosotros") es el responsable del tratamiento de tus datos personales, en
            conformidad con la Ley N.° 19.628 sobre protección de la vida privada (Chile) y sus modificaciones.
          </p>
        </div>

        <div>
          <h2 className="font-semibold text-gray-900 mb-1">2. Qué datos recopilamos</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Nombre, correo electrónico y contraseña (cifrada con bcrypt).</li>
            <li>Contenido de tu CV en texto plano, cifrado en reposo con AES-256-GCM.</li>
            <li>RUT y dirección, cifrados en reposo con AES-256-GCM.</li>
            <li>Preferencias de postulación: región, comuna, nacionalidad, disponibilidad, pretensión de renta.</li>
            <li>Historial de postulaciones y resultados de matching.</li>
            <li>Registro de accesos (IP, user-agent) por razones de seguridad.</li>
          </ul>
        </div>

        <div>
          <h2 className="font-semibold text-gray-900 mb-1">3. Para qué usamos tus datos</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Adaptar tu CV a cada oferta laboral usando inteligencia artificial.</li>
            <li>Completar formularios de postulación en portales de empleo en tu nombre.</li>
            <li>Mostrarte un ranking personalizado de ofertas.</li>
            <li>Enviarte notificaciones por correo y WhatsApp sobre el estado de tus postulaciones.</li>
          </ul>
          <p className="mt-2">No vendemos ni compartimos tus datos con terceros salvo proveedores de infraestructura (servidores, IA) que los tratan únicamente para prestarnos el servicio.</p>
        </div>

        <div>
          <h2 className="font-semibold text-gray-900 mb-1">4. Retención de datos</h2>
          <p>Conservamos tus datos mientras tengas una cuenta activa. Al eliminar tu cuenta, borramos todos tus datos personales en un plazo de 30 días.</p>
        </div>

        <div>
          <h2 className="font-semibold text-gray-900 mb-1">5. Tus derechos</h2>
          <p>Conforme a la Ley 19.628 tienes derecho a:</p>
          <ul className="list-disc pl-5 space-y-1 mt-1">
            <li><strong>Acceder</strong> a tus datos personales.</li>
            <li><strong>Rectificar</strong> datos incorrectos.</li>
            <li><strong>Eliminar</strong> tu cuenta y todos tus datos desde Configuración → Eliminar cuenta, o escribiéndonos.</li>
            <li><strong>Oponerte</strong> al tratamiento o revocar tu consentimiento en cualquier momento.</li>
          </ul>
          <p className="mt-2">
            Para ejercer estos derechos escríbenos a{' '}
            <a href="mailto:privacidad@fitcv.cl" className="text-blue-600 underline">privacidad@fitcv.cl</a>.
            Respondemos en un plazo máximo de 15 días hábiles.
          </p>
        </div>

        <div>
          <h2 className="font-semibold text-gray-900 mb-1">6. Cookies</h2>
          <p>
            Usamos únicamente cookies técnicas estrictamente necesarias para mantener tu sesión. No usamos cookies
            de publicidad ni rastreo de terceros.
          </p>
        </div>

        <div>
          <h2 className="font-semibold text-gray-900 mb-1">7. Contacto</h2>
          <p>
            Si tienes preguntas sobre esta política escríbenos a{' '}
            <a href="mailto:privacidad@fitcv.cl" className="text-blue-600 underline">privacidad@fitcv.cl</a>.
          </p>
        </div>
      </section>

      <div className="mt-10 pt-6 border-t">
        <Link href="/" className="text-sm text-blue-600 hover:underline">← Volver al inicio</Link>
      </div>
    </main>
  );
}
