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
            conformidad con la Ley N.° 19.628 sobre protección de la vida privada y la Ley N.° 21.719, que la
            reforma y crea la Agencia de Protección de Datos Personales (vigente desde el 1 de diciembre de 2026).
            Tratamos tus datos solo con tu <strong>consentimiento expreso</strong>, que das al crear tu cuenta
            marcando una casilla que parte desmarcada, y que puedes revocar en cualquier momento.
          </p>
        </div>

        <div>
          <h2 className="font-semibold text-gray-900 mb-1">2. Qué datos recopilamos</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Nombre, correo electrónico y contraseña (cifrada con bcrypt).</li>
            <li>Contenido de tu CV en texto plano, cifrado en reposo con AES-256-GCM.</li>
            <li>RUT y dirección, cifrados en reposo con AES-256-GCM.</li>
            <li>Preferencias de postulación: región, comuna, nacionalidad, disponibilidad, pretensión de renta.</li>
            <li>Historial de postulaciones, resultados de matching y respuestas de reclutadores a tus postulaciones.</li>
            <li>
              Si conectas tu Gmail u Outlook: tu dirección y un permiso cifrado <strong>solo para enviar</strong> correos
              (Gmail <code>gmail.send</code>, Outlook <code>Mail.Send</code>). No podemos leer tu bandeja.
            </li>
            <li>Registro de accesos (IP, user-agent) por razones de seguridad.</li>
          </ul>
        </div>

        <div>
          <h2 className="font-semibold text-gray-900 mb-1">3. Para qué usamos tus datos</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Adaptar tu CV a cada oferta laboral usando inteligencia artificial.</li>
            <li>Completar formularios de postulación en portales de empleo en tu nombre.</li>
            <li>Mostrarte un ranking personalizado de ofertas.</li>
            <li>Enviar postulaciones por correo desde tu cuenta (si la conectas) o desde nuestro dominio, con respuesta a tu alias.</li>
            <li>Reenviarte las respuestas de los reclutadores y clasificarlas con IA (por ejemplo, invitación a entrevista).</li>
            <li>Enviarte notificaciones por correo y WhatsApp sobre el estado de tus postulaciones.</li>
          </ul>
          <p className="mt-2">
            <strong>Decisiones automatizadas:</strong> FITCV calcula automáticamente el calce entre tu CV y cada oferta, y
            postula solo a las de calce medio o alto. Puedes revisar y cambiar esas decisiones en tu tablero, pedir que una
            persona las revise y oponerte a ellas escribiéndonos.
          </p>
          <p className="mt-2">No vendemos ni compartimos tus datos con terceros salvo proveedores que los tratan únicamente para prestarnos el servicio.</p>
          <p className="mt-2">
            <strong>Transferencias internacionales:</strong> algunos proveedores procesan datos fuera de Chile: servidores
            (Render, EE. UU.), inteligencia artificial para adaptar tu CV (Moonshot/Kimi y DeepSeek), correo (Resend, Google,
            Microsoft) y WhatsApp (Twilio). Enviamos solo lo necesario para cada tarea.
          </p>
        </div>

        <div>
          <h2 className="font-semibold text-gray-900 mb-1">3 bis. Datos de tu cuenta de Google o Microsoft</h2>
          <p>
            Si conectas tu Gmail, FITCV solicita únicamente el permiso <code>gmail.send</code> y lo usa solo para enviar,
            desde tu cuenta, las postulaciones que tú autorizaste: un correo al reclutador de cada oferta, con tu CV adaptado
            adjunto. No leemos, guardamos ni analizamos tus correos, contactos ni ningún otro dato de tu cuenta de Google.
            Guardamos tu dirección de correo y un token de acceso cifrado, que se borra al desconectar tu correo o eliminar tu cuenta.
          </p>
          <p className="mt-2">
            El uso y la transferencia a cualquier otra aplicación de la información recibida de las APIs de Google cumplen la{' '}
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              className="text-blue-600 underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Política de Datos de Usuario de los Servicios de API de Google
            </a>
            , incluidos los requisitos de Uso Limitado. No usamos datos de Google para publicidad, no los vendemos y no los
            usamos para entrenar modelos de inteligencia artificial. Lo mismo aplica al permiso <code>Mail.Send</code> de Outlook.
          </p>
        </div>

        <div>
          <h2 className="font-semibold text-gray-900 mb-1">4. Retención de datos</h2>
          <p>Conservamos tus datos mientras tengas una cuenta activa. Al eliminar tu cuenta los borramos de inmediato de la base principal y revocamos el permiso de envío de tu correo; las copias de respaldo se eliminan en un plazo máximo de 30 días.</p>
          <p className="mt-2">Si ocurre una vulneración de seguridad que afecte tus datos, te avisaremos a ti y a la Agencia sin dilaciones indebidas.</p>
        </div>

        <div>
          <h2 className="font-semibold text-gray-900 mb-1">5. Tus derechos</h2>
          <p>Conforme a las leyes 19.628 y 21.719 tienes derecho a:</p>
          <ul className="list-disc pl-5 space-y-1 mt-1">
            <li><strong>Acceder</strong> a tus datos personales.</li>
            <li><strong>Rectificar</strong> datos incorrectos (desde Mis respuestas y tu CV, o escribiéndonos).</li>
            <li><strong>Suprimir</strong> tu cuenta y todos tus datos desde Mis respuestas → Eliminar mi cuenta, o escribiéndonos.</li>
            <li><strong>Portabilidad:</strong> descargar todos tus datos en un archivo desde Mis respuestas → Descargar todos mis datos.</li>
            <li><strong>Oponerte</strong> al tratamiento, a las decisiones automatizadas, o revocar tu consentimiento en cualquier momento.</li>
            <li><strong>Bloqueo</strong> temporal del tratamiento mientras resolvemos una solicitud tuya.</li>
            <li>Reclamar ante la <strong>Agencia de Protección de Datos Personales</strong> si no respondemos o no estás conforme.</li>
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
