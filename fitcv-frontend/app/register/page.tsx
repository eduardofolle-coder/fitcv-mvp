'use client';

import { FormEvent, useState } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function RegisterPage() {
  const router = useRouter();
  const { register, submitting, error } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  // Ley 21.719: el consentimiento es explícito, la casilla parte desmarcada.
  const [consent, setConsent] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLocalError(null);
    if (!email || !password || !confirmPassword) { setLocalError('Completa todos los campos.'); return; }
    if (password !== confirmPassword) { setLocalError('Las contraseñas no coinciden.'); return; }
    if (password.length < 12) { setLocalError('La contraseña debe tener al menos 12 caracteres.'); return; }
    if (!consent) { setLocalError('Para crear tu cuenta debes aceptar la política de privacidad.'); return; }
    const result = await register({ email, password, consent });
    if (result.ok) { router.push('/cv'); }
    else if (result.error === 'Email already in use') setLocalError('Ese correo ya tiene una cuenta. Ingresa o recupera tu contraseña.');
    else if (result.error?.includes('closed beta')) setLocalError('FITCV está en beta cerrada: por ahora solo pueden crear cuenta los correos invitados.');
    else setLocalError(result.error ?? 'No se pudo crear la cuenta.');
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@700;800&family=Public+Sans:wght@400;500;600&display=swap');
        .lp-wrap{
          min-height:100vh; display:flex; align-items:center; justify-content:center;
          padding:24px; font-family:"Public Sans",ui-sans-serif,system-ui,sans-serif;
          background:#14273F; position:relative; overflow:hidden;
        }
        .lp-wrap::before{
          content:""; position:absolute; inset:0;
          background:radial-gradient(120% 90% at 88% -10%, rgba(225,165,38,.22), transparent 55%);
          pointer-events:none;
        }
        .lp-inner{ width:100%; max-width:420px; position:relative; z-index:1; }
        .lp-logo{
          text-align:center; margin-bottom:28px;
          font-family:"Bricolage Grotesque",ui-sans-serif,system-ui,sans-serif;
          font-weight:800; font-size:28px; letter-spacing:-.03em; color:#F4F1E9;
        }
        .lp-logo b{ color:#E1A526; }
        .lp-logo p{ font-family:"Public Sans"; font-weight:400; font-size:15px; color:#A9B6C8; margin:6px 0 0; letter-spacing:0; }
        .lp-card{
          background:#fff; border-radius:16px;
          box-shadow:0 2px 4px rgba(0,0,0,.25), 0 24px 48px -16px rgba(0,0,0,.45);
          padding:32px; border:1px solid #E7E1D5;
        }
        .lp-field{ display:flex; flex-direction:column; gap:6px; }
        .lp-label{ font-size:14px; font-weight:600; color:#14273F; }
        .lp-input{
          width:100%; padding:11px 14px; border:1.5px solid #D1C9BE;
          border-radius:10px; font-size:15px; font-family:inherit;
          color:#14273F; background:#FDFAF7; outline:none; transition:border-color .15s;
        }
        .lp-input:focus{ border-color:#E1A526; background:#fff; }
        .lp-input::placeholder{ color:#9B9186; }
        .lp-hint{ font-size:12.5px; color:#9B9186; margin:0; }
        .lp-btn-gold{
          width:100%; padding:13px; border:0; border-radius:10px; cursor:pointer;
          font-family:"Public Sans",inherit; font-size:15px; font-weight:700;
          background:#E1A526; color:#1B1206;
          box-shadow:0 6px 18px -6px rgba(225,165,38,.55);
          transition:transform .12s ease, box-shadow .12s ease;
        }
        .lp-btn-gold:hover:not(:disabled){ transform:translateY(-1px); box-shadow:0 10px 22px -8px rgba(225,165,38,.6); }
        .lp-btn-gold:disabled{ opacity:.65; cursor:not-allowed; }
        .lp-divider{ display:flex; align-items:center; gap:10px; margin:4px 0; }
        .lp-divider span{ font-size:12px; color:#9B9186; white-space:nowrap; }
        .lp-divider::before,.lp-divider::after{ content:""; flex:1; height:1px; background:#E7E1D5; }
        .lp-btn-google{
          display:flex; align-items:center; justify-content:center; gap:10px;
          width:100%; padding:11px; border:1.5px solid #D1C9BE; border-radius:10px;
          background:#fff; font-size:14px; font-weight:600; color:#14273F;
          cursor:pointer; font-family:inherit; transition:background .12s, border-color .12s;
          text-decoration:none;
        }
        .lp-btn-google:hover{ background:#FDFAF7; border-color:#B9820D; }
        .lp-error{
          background:#FEF2F2; border:1px solid #FECACA; border-radius:8px;
          padding:10px 14px; font-size:14px; color:#991B1B; font-weight:500;
        }
        .lp-footer{ text-align:center; margin-top:22px; }
        .lp-footer p{ font-size:14px; color:#A9B6C8; }
        .lp-footer a{ color:#E1A526; font-weight:600; }
        .lp-footer a:hover{ text-decoration:underline; }
        .lp-footer small{ font-size:12px; color:#6C7686; display:block; margin-top:10px; }
        .lp-footer small a{ color:#6C7686; font-weight:400; }
        .lp-footer small a:hover{ color:#A9B6C8; text-decoration:underline; }
      `}</style>

      <div className="lp-wrap">
        <div className="lp-inner">
          <div className="lp-logo">
            fit<b>cv</b>
            <p>Crea tu cuenta gratis</p>
          </div>

          <div className="lp-card">
            <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:'18px' }}>
              {(localError || error) && (
                <div className="lp-error">{localError || error}</div>
              )}

              <div className="lp-field">
                <label className="lp-label">Correo electrónico</label>
                <input
                  className="lp-input"
                  type="email"
                  autoComplete="email"
                  placeholder="tu@correo.cl"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="lp-field">
                <label className="lp-label">Contraseña</label>
                <input
                  className="lp-input"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Mínimo 12 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <p className="lp-hint">Usa mayúsculas, minúsculas, números y al menos un símbolo.</p>
              </div>

              <div className="lp-field">
                <label className="lp-label">Repite la contraseña</label>
                <input
                  className="lp-input"
                  type="password"
                  autoComplete="new-password"
                  placeholder="••••••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>

              <label style={{ display:'flex', gap:10, alignItems:'flex-start', fontSize:13.5, color:'#14273F', lineHeight:1.45 }}>
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop:3 }} />
                <span>
                  Acepto la <Link href="/privacy" style={{ color:'#B9820D', fontWeight:600 }}>política de privacidad</Link> y
                  autorizo a FITCV a tratar mi CV y datos de contacto para postular en mi nombre.
                </span>
              </label>

              <button type="submit" className="lp-btn-gold" disabled={submitting}>
                {submitting ? 'Creando cuenta…' : 'Crear cuenta'}
              </button>

              <div className="lp-divider"><span>o</span></div>

              <a
                href={consent ? `${process.env.NEXT_PUBLIC_API_URL}/auth/google` : undefined}
                onClick={(e) => { if (!consent) { e.preventDefault(); setLocalError('Marca la casilla de privacidad antes de continuar con Google.'); } }}
                aria-disabled={!consent}
                className="lp-btn-google"
                style={consent ? undefined : { opacity:.55 }}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continuar con Google
              </a>
            </form>
          </div>

          <div className="lp-footer">
            <p>¿Ya tienes cuenta? <Link href="/login">Ingresa</Link></p>
            <small><Link href="/privacy">Política de privacidad</Link></small>
          </div>
        </div>
      </div>
    </>
  );
}
