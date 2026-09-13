'use client';

import { useRouter } from 'next/navigation';

export default function Landing() {
  const router = useRouter();

  return (
    <div className="bg-gradient-to-b from-slate-950 via-purple-950 to-slate-950 text-white min-h-screen overflow-hidden">
      {/* Animated background orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-purple-600/20 to-transparent rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute top-1/2 -left-40 w-96 h-96 bg-gradient-to-br from-cyan-500/10 to-transparent rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
        <div className="absolute -bottom-32 right-1/3 w-80 h-80 bg-gradient-to-br from-emerald-500/10 to-transparent rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>
      </div>

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 py-5 flex justify-between items-center">
          <div className="text-3xl font-black bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            fitcv
          </div>
          <div className="flex gap-4">
            <button onClick={() => router.push('/login')} className="px-6 py-2.5 text-gray-300 hover:text-white font-medium transition duration-300">
              Entrar
            </button>
            <button onClick={() => router.push('/register')} className="px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white rounded-xl font-semibold hover:from-emerald-600 hover:to-cyan-600 transition duration-300 shadow-lg shadow-cyan-500/30">
              Comenzar
            </button>
          </div>
        </div>
      </nav>

      {/* HERO SECTION - Asimetría radical */}
      <section className="pt-32 pb-32 px-6 lg:px-12">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
          {/* Left: Texto asymétrico */}
          <div className="space-y-8">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm">
                <span className="text-2xl">⚡</span>
                <span className="text-sm font-medium text-cyan-300">Powered by Claude AI</span>
              </div>

              <div className="space-y-3">
                <p className="text-lg text-gray-400 font-medium">Detente de luchar contra el sistema</p>
                <h1 className="text-7xl lg:text-8xl font-black leading-tight">
                  Tu CV
                  <br />
                  <span className="bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">domina</span>
                  <br />
                  cada oferta
                </h1>
              </div>

              <p className="text-xl text-gray-300 leading-relaxed max-w-xl pt-6">
                La IA que realmente entiende. No postulas 100 veces. Postulas 10 y ganas 3 entrevistas.
              </p>
            </div>

            {/* CTA Buttons - Asymmetric */}
            <div className="flex flex-col sm:flex-row gap-4 pt-8">
              <button
                onClick={() => router.push('/register')}
                className="group px-8 py-4 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white rounded-xl font-bold text-lg hover:from-emerald-600 hover:to-cyan-600 transition duration-300 shadow-2xl shadow-cyan-500/40 hover:shadow-cyan-500/60"
              >
                Prueba ahora → 7 días gratis
              </button>
              <button
                onClick={() => router.push('/login')}
                className="px-8 py-4 border-2 border-white/20 text-white rounded-xl font-bold hover:border-white/40 hover:bg-white/5 transition duration-300"
              >
                Ver en acción
              </button>
            </div>

            <div className="space-y-2 pt-4 text-sm text-gray-400">
              <p>✓ Sin tarjeta. Sin spam. Sin BS.</p>
              <p>✓ Dinero de vuelta si no te gusta. Punto.</p>
            </div>
          </div>

          {/* Right: Visual element - Asymmetric card */}
          <div className="hidden lg:flex items-end justify-end">
            <div className="relative w-full h-96">
              {/* Glassmorphism card */}
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-xl rounded-3xl border border-white/20 p-8 flex flex-col justify-end transform hover:scale-105 transition duration-500">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-400"></div>
                    <div>
                      <p className="font-bold text-white">Andrea Chen</p>
                      <p className="text-sm text-gray-300">Product @ Stripe</p>
                    </div>
                  </div>
                  <p className="text-lg text-gray-200">
                    "En 2 semanas pasé de 0 entrevistas a 4 ofertas. fitcv realmente entiende el juego."
                  </p>
                  <div className="flex gap-1">
                    {[...Array(5)].map((_, i) => (
                      <span key={i} className="text-yellow-400 text-xl">★</span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Decorative circles */}
              <div className="absolute -top-20 -right-20 w-40 h-40 bg-gradient-to-br from-purple-500/30 to-transparent rounded-full blur-2xl"></div>
            </div>
          </div>
        </div>
      </section>

      {/* SOCIAL PROOF - Números brutales */}
      <section className="py-20 px-6 lg:px-12 border-y border-white/10">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              { num: '3.8K', label: 'Usuarios', sub: '(Y contando)' },
              { num: '82%', label: 'Éxito', sub: 'En 30 días' },
              { num: '14 días', label: 'Promedio', sub: 'Hasta entrevista' },
              { num: '5 IA', label: 'Agentes', sub: 'Especializados' }
            ].map((stat, i) => (
              <div key={i} className="group">
                <p className="text-5xl lg:text-6xl font-black bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent group-hover:from-purple-400 group-hover:to-pink-400 transition duration-300">
                  {stat.num}
                </p>
                <p className="text-lg font-bold text-white mt-2">{stat.label}</p>
                <p className="text-sm text-gray-400">{stat.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CÓMO FUNCIONA - Minimalismo radical */}
      <section className="py-24 px-6 lg:px-12">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-5xl lg:text-6xl font-black mb-4">Tres pasos</h2>
          <p className="text-xl text-gray-400 mb-20">Sin complicaciones. Sin humo.</p>

          <div className="space-y-16">
            {[
              { n: '01', t: 'Sube tu CV', d: 'Encriptado. Seguro. Tuyo siempre.' },
              { n: '02', t: 'Elige una oferta', d: 'Explora oportunidades que realmente te encajan.' },
              { n: '03', t: 'Recibe tu CV adaptado', d: 'En 30 segundos. Listo para enviar. O mejoralo con nuestras sugerencias.' }
            ].map((step, i) => (
              <div key={i} className="group">
                <div className="flex items-start gap-8 lg:gap-12">
                  <div className="flex-shrink-0">
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-500/30 to-cyan-500/30 border border-white/20 flex items-center justify-center">
                      <span className="text-4xl font-black bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
                        {step.n}
                      </span>
                    </div>
                  </div>
                  <div className="flex-1 pt-2">
                    <h3 className="text-3xl font-black text-white mb-3 group-hover:text-transparent group-hover:bg-gradient-to-r group-hover:from-cyan-400 group-hover:to-purple-400 group-hover:bg-clip-text transition duration-300">
                      {step.t}
                    </h3>
                    <p className="text-lg text-gray-400 leading-relaxed">{step.d}</p>
                  </div>
                </div>
                {i < 2 && <div className="h-px bg-gradient-to-r from-white/20 via-white/5 to-transparent mt-16"></div>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TESTIMONIOS - Estilo moderno */}
      <section className="py-24 px-6 lg:px-12">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-5xl font-black mb-20">Historias reales</h2>

          <div className="grid lg:grid-cols-3 gap-6">
            {[
              {
                emoji: '👩‍💼',
                name: 'María González',
                title: 'UX Designer',
                company: 'Mercado Libre',
                quote: 'Postulé 23 veces sin respuesta. Con fitcv, 2 entrevistas en 2 semanas. Me contrataron en la segunda.'
              },
              {
                emoji: '👨‍💻',
                name: 'Carlos López',
                title: 'Backend Engineer',
                company: 'Rappi',
                quote: 'Cambié de carrera hace 3 años. Mi CV nunca reflejó mis reales capacidades. fitcv lo hizo visible.'
              },
              {
                emoji: '👩‍🔬',
                name: 'Ana Martínez',
                title: 'Data Scientist',
                company: 'Google',
                quote: 'Los ATS nunca me veían. El CV adaptado de fitcv me abrió puertas que no sabía que existían.'
              }
            ].map((t, i) => (
              <div key={i} className="group relative">
                <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-white/5 rounded-2xl opacity-0 group-hover:opacity-100 transition duration-300 blur"></div>
                <div className="relative bg-gradient-to-br from-white/5 to-white/0 backdrop-blur-xl rounded-2xl border border-white/10 p-8 hover:border-white/20 transition duration-300 h-full flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-3 mb-6">
                      <span className="text-4xl">{t.emoji}</span>
                      <div>
                        <p className="font-bold text-white">{t.name}</p>
                        <p className="text-sm text-gray-400">{t.title} @ {t.company}</p>
                      </div>
                    </div>
                    <p className="text-gray-200 leading-relaxed mb-6">"{t.quote}"</p>
                  </div>
                  <div className="flex gap-1">
                    {[...Array(5)].map((_, j) => (
                      <span key={j} className="text-yellow-400 text-lg">★</span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* URGENCIA GENUINA - Sección dramática */}
      <section className="py-32 px-6 lg:px-12">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <h2 className="text-6xl lg:text-7xl font-black leading-tight">
            Esta semana<br />
            <span className="text-transparent bg-gradient-to-r from-pink-500 via-red-500 to-orange-500 bg-clip-text">buscan candidatos como tú</span>
          </h2>

          <p className="text-2xl text-gray-300">Llevar tu CV listo en 2 minutos puede cambiar todo.</p>

          <div className="pt-8">
            <button
              onClick={() => router.push('/register')}
              className="px-12 py-6 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white rounded-2xl font-black text-xl hover:from-emerald-600 hover:to-cyan-600 transition duration-300 shadow-2xl shadow-cyan-500/50 hover:shadow-cyan-500/70 transform hover:scale-105"
            >
              Comienza tu prueba gratis
            </button>
          </div>

          <div className="text-sm text-gray-400 space-y-1 pt-6">
            <p>✓ 7 días de acceso completo</p>
            <p>✓ Si no te gusta, devolución 100% sin preguntas</p>
          </div>
        </div>
      </section>

      {/* FOOTER - Minimalista */}
      <footer className="border-t border-white/5 py-16 px-6 lg:px-12">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-4 gap-12 mb-12">
            <div>
              <p className="text-2xl font-black bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent mb-4">
                fitcv
              </p>
              <p className="text-gray-400 text-sm">Herramienta IA para que ganes el juego del empleo.</p>
            </div>
            {[
              { title: 'Producto', links: ['Features', 'Precios', 'Seguridad'] },
              { title: 'Empresa', links: ['Acerca de', 'Blog', 'Contacto'] },
              { title: 'Legal', links: ['Privacidad', 'Términos'] }
            ].map((col, i) => (
              <div key={i}>
                <p className="font-bold text-white mb-4">{col.title}</p>
                <ul className="space-y-2 text-gray-400 text-sm">
                  {col.links.map((link, j) => (
                    <li key={j}><a href="#" className="hover:text-white transition">{link}</a></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="border-t border-white/5 pt-8 text-center text-gray-500 text-sm">
            <p>© 2026 fitcv. Construido con Claude AI. Sin IA pública generada.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}