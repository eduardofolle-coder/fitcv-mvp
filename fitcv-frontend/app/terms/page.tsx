import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Condiciones del servicio — FITCV' };

export default function TermsPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-12 text-gray-700">
      <h1 className="text-2xl font-bold text-white mb-2">Condiciones del servicio</h1>
      <p className="text-sm text-gray-500 mb-8">Última actualización: septiembre 2026</p>

      <section className="space-y-6 text-sm leading-relaxed">
        <div>
          <h2 className="font-semibold text-white mb-1">1. Qué es FITCV</h2>
          <p>
            FITCV es un servicio chileno que adapta tu CV con inteligencia artificial y postula por ti a ofertas de
            empleo. Al crear una cuenta aceptas estas condiciones y la{' '}
            <Link href="/privacy" className="text-blue-600 underline">política de privacidad</Link>. FITCV está en etapa
            de piloto/beta cerrada: las cuentas se habilitan por invitación y los planes se asignan manualmente.
          </p>
        </div>

        <div>
          <h2 className="font-semibold text-white mb-1">2. Cómo postulamos por ti</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Solo postulamos a ofertas con calce medio o alto con tu perfil; el resto queda para que las revises tú.</li>
            <li>Si una oferta paga menos que tu rango salarial declarado, te pedimos autorización antes de postular.</li>
            <li>
              En los portales que lo requieren, la postulación se hace desde tu propia sesión, con la extensión de Chrome
              que tú instalas y autorizas. FITCV nunca evade CAPTCHA, muros de login ni otras protecciones de un portal:
              si un portal bloquea el envío automático, la postulación queda pendiente para que la termines tú con un clic.
            </li>
            <li>Los datos duros de tu CV (empresas, cargos, fechas, estudios) nunca se alteran ni se inventan; solo se
              adapta cómo se presentan según la oferta.</li>
          </ul>
        </div>

        <div>
          <h2 className="font-semibold text-white mb-1">3. Tu cuenta y tu responsabilidad</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Eres responsable de que la información de tu CV y tus respuestas guardadas sea veraz.</li>
            <li>El uso de FITCV en cada portal de empleo está además sujeto a las condiciones propias de ese portal.</li>
            <li>Si conectas tu correo (Gmail/Outlook) para enviar postulaciones, o WhatsApp para recibir avisos, puedes
              desconectarlos en cualquier momento desde tu cuenta.</li>
          </ul>
        </div>

        <div>
          <h2 className="font-semibold text-white mb-1">4. Planes y cuota</h2>
          <p>
            Los planes (Gratis, Pro, Max) definen cuántas postulaciones automáticas puedes enviar. Durante la beta no hay
            pasarela de pago activa: los planes se asignan a mano. Cuando se habilite el cobro, lo anunciaremos con
            anticipación y estas condiciones se actualizarán con el detalle de precios, renovación y cancelación.
          </p>
        </div>

        <div>
          <h2 className="font-semibold text-white mb-1">5. Límites del servicio</h2>
          <p>
            FITCV te ayuda a postular más rápido y a más ofertas, pero no garantiza que consigas una entrevista ni un
            empleo, ni controla las decisiones de los reclutadores o empleadores. Algunos portales pueden bloquear el
            envío automático (CAPTCHA, inicio de sesión requerido, cambios en su formulario); en esos casos la
            postulación queda marcada como pendiente y no se envía sin tu confirmación.
          </p>
        </div>

        <div>
          <h2 className="font-semibold text-white mb-1">6. Cancelación</h2>
          <p>
            Puedes eliminar tu cuenta cuando quieras desde Mis respuestas → Eliminar mi cuenta, o escribiéndonos. Al
            eliminarla se borran tus datos según lo descrito en la política de privacidad.
          </p>
        </div>

        <div>
          <h2 className="font-semibold text-white mb-1">7. Cambios a estas condiciones</h2>
          <p>
            Si hacemos un cambio importante te avisaremos por correo o WhatsApp antes de que entre en vigencia.
          </p>
        </div>

        <div>
          <h2 className="font-semibold text-white mb-1">8. Ley aplicable</h2>
          <p>Estas condiciones se rigen por las leyes de Chile.</p>
        </div>

        <div>
          <h2 className="font-semibold text-white mb-1">9. Contacto</h2>
          <p>
            Si tienes preguntas sobre estas condiciones escríbenos a{' '}
            <a href="mailto:contacto@fitcv.cl" className="text-blue-600 underline">contacto@fitcv.cl</a>.
          </p>
        </div>
      </section>

      <div className="mt-10 pt-6 border-t">
        <Link href="/" className="text-sm text-blue-600 hover:underline">← Volver al inicio</Link>
      </div>
    </main>
  );
}
