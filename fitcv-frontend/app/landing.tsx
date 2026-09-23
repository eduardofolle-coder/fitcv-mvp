'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

const CSS = `
.fitcv-landing{
  --ground:#FBF8F2; --surface:#FFFFFF; --ink:#14273F; --ink-soft:#3B4B62;
  --muted:#6C7686; --gold:#B9820D; --gold-solid:#E1A526; --coral:#CB4526;
  --green:#2E8B57; --border:#E7E1D5; --hero:#14273F; --hero-ink:#F4F1E9;
  --hero-muted:#A9B6C8; --hero-line:#2B3E58;
  --shadow:0 1px 2px rgba(20,39,63,.06), 0 12px 32px -12px rgba(20,39,63,.18);
  --r:14px;
  background:var(--ground); color:var(--ink); min-height:100vh;
  font-family:"Public Sans", ui-sans-serif, system-ui, sans-serif;
  font-size:16px; line-height:1.6; -webkit-font-smoothing:antialiased;
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]) .fitcv-landing{
    --ground:#0D1826; --surface:#152437; --ink:#EAF0F7; --ink-soft:#BFCBDA;
    --muted:#8593A6; --gold:#F0B840; --gold-solid:#F0B840; --coral:#F07850;
    --green:#54BE87; --border:#25374E; --hero:#0A1420; --hero-ink:#F4F1E9;
    --hero-muted:#9FB0C6; --hero-line:#20344C;
    --shadow:0 1px 2px rgba(0,0,0,.3), 0 16px 40px -16px rgba(0,0,0,.5);
  }
}
:root[data-theme="dark"] .fitcv-landing{
  --ground:#0D1826; --surface:#152437; --ink:#EAF0F7; --ink-soft:#BFCBDA;
  --muted:#8593A6; --gold:#F0B840; --gold-solid:#F0B840; --coral:#F07850;
  --green:#54BE87; --border:#25374E; --hero:#0A1420; --hero-ink:#F4F1E9;
  --hero-muted:#9FB0C6; --hero-line:#20344C;
  --shadow:0 1px 2px rgba(0,0,0,.3), 0 16px 40px -16px rgba(0,0,0,.5);
}
.fitcv-landing *{box-sizing:border-box}
.fitcv-landing .wrap{max-width:1120px; margin:0 auto; padding-inline:24px}
.fitcv-landing h1,.fitcv-landing h2,.fitcv-landing h3{font-family:"Bricolage Grotesque", ui-sans-serif, system-ui, sans-serif; text-wrap:balance; margin:0; letter-spacing:-.02em}
.fitcv-landing .mono{font-family:"JetBrains Mono", ui-monospace, monospace; font-variant-numeric:tabular-nums}
.fitcv-landing a{color:inherit; text-decoration:none}
.fitcv-landing nav{display:flex; align-items:center; justify-content:space-between; padding-block:22px}
.fitcv-landing .logo{font-family:"Bricolage Grotesque"; font-weight:800; font-size:24px; letter-spacing:-.03em}
.fitcv-landing .logo b{color:var(--gold)}
.fitcv-landing .nav-r{display:flex; align-items:center; gap:10px}
.fitcv-landing .btn{border:0; cursor:pointer; font:inherit; font-weight:600; border-radius:10px; padding:11px 18px; display:inline-flex; align-items:center; gap:8px; transition:transform .12s ease, box-shadow .12s ease}
.fitcv-landing .btn-ghost{background:transparent; color:var(--ink); padding:11px 14px}
.fitcv-landing .btn-gold{background:var(--gold-solid); color:#1B1206; box-shadow:0 6px 18px -6px color-mix(in srgb, var(--gold-solid) 70%, transparent)}
.fitcv-landing .btn-gold:hover{transform:translateY(-1px)}
.fitcv-landing .btn-dark{background:var(--ink); color:var(--ground)}
.fitcv-landing .hero{background:var(--hero); color:var(--hero-ink); border-radius:24px; margin-top:8px; overflow:hidden; position:relative}
.fitcv-landing .hero::after{content:""; position:absolute; inset:0; background:radial-gradient(120% 90% at 88% -10%, color-mix(in srgb, var(--gold-solid) 26%, transparent), transparent 55%); pointer-events:none}
.fitcv-landing .hero-grid{display:grid; grid-template-columns:1.05fr .95fr; gap:40px; align-items:center; padding:56px; position:relative; z-index:1}
.fitcv-landing .eyebrow{display:inline-flex; align-items:center; gap:8px; font-size:13px; font-weight:600; letter-spacing:.04em; text-transform:uppercase; color:var(--gold-solid); border:1px solid var(--hero-line); border-radius:100px; padding:7px 14px}
.fitcv-landing .eyebrow .dot{width:7px; height:7px; border-radius:50%; background:var(--green)}
.fitcv-landing .hero h1{font-size:clamp(38px,5.2vw,62px); font-weight:800; line-height:1.02; margin:22px 0 0}
.fitcv-landing .hero h1 .u{color:var(--gold-solid)}
.fitcv-landing .hero .lede{color:var(--hero-muted); font-size:19px; max-width:34ch; margin:20px 0 0}
.fitcv-landing .hero .lede b{color:var(--hero-ink); font-weight:600}
.fitcv-landing .hero-cta{display:flex; flex-wrap:wrap; gap:12px; margin-top:30px}
.fitcv-landing .assure{margin-top:18px; color:var(--hero-muted); font-size:14px; display:flex; align-items:center; gap:8px}
.fitcv-landing .check{color:var(--green); font-weight:700}
.fitcv-landing .card{background:var(--surface); color:var(--ink); border-radius:18px; box-shadow:var(--shadow); border:1px solid var(--border); overflow:hidden}
.fitcv-landing .card-top{display:flex; align-items:center; justify-content:space-between; padding:16px 18px; border-bottom:1px solid var(--border)}
.fitcv-landing .card-top .who{display:flex; align-items:center; gap:10px}
.fitcv-landing .avatar{width:34px; height:34px; border-radius:50%; background:var(--ink); color:var(--ground); display:grid; place-items:center; font-family:"Bricolage Grotesque"; font-weight:700; font-size:14px}
.fitcv-landing .tag{font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.05em; color:var(--muted); border:1px solid var(--border); border-radius:100px; padding:4px 9px}
.fitcv-landing .card-body{padding:20px 18px}
.fitcv-landing .bignum{display:flex; align-items:baseline; gap:10px}
.fitcv-landing .bignum .n{font-family:"Bricolage Grotesque"; font-weight:800; font-size:52px; line-height:1; color:var(--ink); letter-spacing:-.03em}
.fitcv-landing .bignum .lbl{color:var(--muted); font-size:14px; line-height:1.3}
.fitcv-landing .tiers{display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-top:16px}
.fitcv-landing .tier{border:1px solid var(--border); border-radius:11px; padding:10px 12px}
.fitcv-landing .tier .v{font-family:"JetBrains Mono"; font-weight:700; font-size:20px}
.fitcv-landing .tier .k{font-size:12px; color:var(--muted)}
.fitcv-landing .tier.hi .v{color:var(--green)}
.fitcv-landing .sec-label{font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); margin:18px 0 9px}
.fitcv-landing .chips{display:flex; flex-wrap:wrap; gap:7px}
.fitcv-landing .chip{font-size:13px; font-weight:500; background:color-mix(in srgb, var(--green) 12%, var(--surface)); color:var(--green); border:1px solid color-mix(in srgb, var(--green) 26%, transparent); border-radius:8px; padding:5px 10px}
.fitcv-landing .gap{margin-top:14px; border:1px dashed color-mix(in srgb, var(--coral) 45%, var(--border)); border-radius:11px; padding:11px 13px; background:color-mix(in srgb, var(--coral) 7%, var(--surface))}
.fitcv-landing .gap .g-top{display:flex; align-items:center; justify-content:space-between; gap:10px}
.fitcv-landing .gap .term{font-weight:600}
.fitcv-landing .gap .cnt{font-family:"JetBrains Mono"; font-weight:700; color:var(--coral); font-size:14px}
.fitcv-landing .gap .g-sub{font-size:12.5px; color:var(--muted); margin-top:3px}
.fitcv-landing .card-foot{padding:11px 18px; border-top:1px solid var(--border); font-size:12.5px; color:var(--muted); display:flex; align-items:center; gap:7px}
.fitcv-landing section{padding-block:64px}
.fitcv-landing .kicker{font-size:13px; font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:var(--gold)}
.fitcv-landing .h2{font-size:clamp(28px,3.4vw,40px); font-weight:700; margin-top:12px; max-width:20ch}
.fitcv-landing .sub{color:var(--muted); font-size:18px; margin-top:12px; max-width:56ch}
.fitcv-landing .sub b{color:var(--ink-soft)}
.fitcv-landing .steps{display:grid; grid-template-columns:repeat(3,1fr); gap:18px; margin-top:36px}
.fitcv-landing .step{background:var(--surface); border:1px solid var(--border); border-radius:var(--r); padding:24px}
.fitcv-landing .step .idx{font-family:"JetBrains Mono"; font-weight:700; color:var(--gold); font-size:14px}
.fitcv-landing .step h3{font-size:20px; font-weight:700; margin-top:12px}
.fitcv-landing .step p{color:var(--muted); font-size:15px; margin:8px 0 0}
.fitcv-landing .wa-note{display:flex; align-items:flex-start; gap:14px; margin-top:18px; background:color-mix(in srgb, var(--green) 9%, var(--surface)); border:1px solid color-mix(in srgb, var(--green) 28%, var(--border)); border-radius:var(--r); padding:18px 20px}
.fitcv-landing .wa-ico{flex:none; width:38px; height:38px; border-radius:10px; background:var(--green); color:#fff; display:grid; place-items:center}
.fitcv-landing .wa-note p{margin:0; font-size:15.5px; color:var(--ink-soft)}
.fitcv-landing .wa-note b{color:var(--ink)}
.fitcv-landing .dash{background:var(--surface); border:1px solid var(--border); border-radius:20px; box-shadow:var(--shadow); overflow:hidden; margin-top:36px}
.fitcv-landing .dash-head{display:flex; align-items:center; justify-content:space-between; gap:14px; padding:18px 22px; border-bottom:1px solid var(--border); flex-wrap:wrap}
.fitcv-landing .dash-head .t{font-family:"Bricolage Grotesque"; font-weight:700; font-size:18px}
.fitcv-landing .dash-filters{display:flex; gap:7px; flex-wrap:wrap}
.fitcv-landing .filter{font-size:13px; font-weight:600; padding:6px 12px; border-radius:8px; border:1px solid var(--border); color:var(--muted); background:transparent}
.fitcv-landing .filter.on{background:var(--ink); color:var(--ground); border-color:var(--ink)}
.fitcv-landing .drow{display:grid; grid-template-columns:1fr auto; gap:16px; align-items:center; padding:15px 22px; border-bottom:1px solid var(--border)}
.fitcv-landing .drow:last-child{border-bottom:0}
.fitcv-landing .drow .title{font-weight:600; font-size:15.5px}
.fitcv-landing .drow .meta{font-size:13px; color:var(--muted); margin-top:3px; display:flex; align-items:center; gap:9px; flex-wrap:wrap}
.fitcv-landing .aff{display:inline-flex; align-items:center; gap:5px; font-weight:600}
.fitcv-landing .aff .d{width:7px; height:7px; border-radius:50%}
.fitcv-landing .aff.hi{color:var(--green)} .fitcv-landing .aff.hi .d{background:var(--green)}
.fitcv-landing .aff.md{color:var(--muted)} .fitcv-landing .aff.md .d{background:var(--gold-solid)}
.fitcv-landing .pill{font-size:12.5px; font-weight:600; padding:5px 12px; border-radius:100px; white-space:nowrap; border:1px solid transparent}
.fitcv-landing .p-sent{background:color-mix(in srgb, var(--green) 13%, var(--surface)); color:var(--green); border-color:color-mix(in srgb, var(--green) 30%, transparent)}
.fitcv-landing .p-int{background:var(--green); color:#fff}
.fitcv-landing .p-queue{background:var(--ground); color:var(--ink-soft); border-color:var(--border)}
.fitcv-landing .p-auth{background:color-mix(in srgb, var(--gold-solid) 16%, var(--surface)); color:var(--gold); border-color:color-mix(in srgb, var(--gold-solid) 38%, transparent)}
.fitcv-landing .p-attn{background:color-mix(in srgb, var(--coral) 11%, var(--surface)); color:var(--coral); border-color:color-mix(in srgb, var(--coral) 32%, transparent)}
.fitcv-landing .trust{background:var(--surface); border:1px solid var(--border); border-radius:20px; padding:34px 30px; margin-top:8px}
.fitcv-landing .trust-grid{display:grid; grid-template-columns:1.1fr 1fr; gap:36px; align-items:center}
.fitcv-landing .portals{display:flex; flex-wrap:wrap; gap:10px; margin-top:20px}
.fitcv-landing .portal{font-size:13.5px; font-weight:600; color:var(--ink-soft); background:var(--ground); border:1px solid var(--border); border-radius:9px; padding:8px 13px}
.fitcv-landing .portal em{font-style:normal; font-weight:500; font-size:11px; color:var(--muted); margin-left:5px; padding-left:6px; border-left:1px solid var(--border)}
.fitcv-landing .promise{border-left:3px solid var(--gold-solid); padding-left:18px}
.fitcv-landing .promise h3{font-size:22px; font-weight:700}
.fitcv-landing .promise p{color:var(--muted); margin-top:10px}
.fitcv-landing .promise .big{color:var(--ink); font-weight:600}
.fitcv-landing .prices{display:grid; grid-template-columns:repeat(3,1fr); gap:18px; margin-top:36px; align-items:stretch}
.fitcv-landing .price{background:var(--surface); border:1px solid var(--border); border-radius:var(--r); padding:26px 24px; display:flex; flex-direction:column}
.fitcv-landing .price.feat{border-color:var(--gold-solid); box-shadow:0 0 0 1px var(--gold-solid), var(--shadow); position:relative}
.fitcv-landing .price .plan{font-family:"Bricolage Grotesque"; font-weight:700; font-size:19px}
.fitcv-landing .price .badge{position:absolute; top:-11px; left:24px; background:var(--gold-solid); color:#1B1206; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.04em; padding:4px 10px; border-radius:100px}
.fitcv-landing .price .amt{display:flex; align-items:baseline; gap:4px; margin:14px 0 2px}
.fitcv-landing .price .amt .v{font-family:"Bricolage Grotesque"; font-weight:800; font-size:38px; letter-spacing:-.03em}
.fitcv-landing .price .amt .per{color:var(--muted); font-size:14px}
.fitcv-landing .price .quota{font-weight:600; color:var(--gold); font-size:14px; margin-top:4px}
.fitcv-landing .price ul{list-style:none; margin:18px 0 0; padding:0; display:flex; flex-direction:column; gap:10px}
.fitcv-landing .price li{display:flex; gap:9px; font-size:14.5px; color:var(--ink-soft); line-height:1.4}
.fitcv-landing .price li .ck{color:var(--green); font-weight:700; flex:none}
.fitcv-landing .price .btn{margin-top:auto; justify-content:center}
.fitcv-landing .price-note{text-align:center; color:var(--muted); font-size:13.5px; margin-top:18px}
.fitcv-landing .final{background:var(--hero); color:var(--hero-ink); border-radius:24px; padding:56px; text-align:center; position:relative; overflow:hidden}
.fitcv-landing .final::after{content:""; position:absolute; inset:0; background:radial-gradient(90% 120% at 50% 130%, color-mix(in srgb, var(--gold-solid) 24%, transparent), transparent 60%); pointer-events:none}
.fitcv-landing .final h2{font-size:clamp(30px,4vw,46px); font-weight:800; position:relative; z-index:1; max-width:18ch; margin-inline:auto}
.fitcv-landing .final p{color:var(--hero-muted); font-size:18px; margin-top:14px; position:relative; z-index:1}
.fitcv-landing .final .btn{margin-top:26px; position:relative; z-index:1; font-size:17px; padding:14px 26px}
.fitcv-landing footer{padding-block:36px; color:var(--muted); font-size:14px; text-align:center}
.fitcv-landing footer a{color:inherit; text-decoration:underline; text-underline-offset:2px}
.fitcv-landing .theme-toggle{background:transparent; border:1px solid var(--border); color:var(--muted); border-radius:9px; width:38px; height:38px; cursor:pointer; display:grid; place-items:center; font-size:16px}
@media (max-width:860px){
  .fitcv-landing .hero-grid{grid-template-columns:1fr; gap:32px; padding:36px 28px}
  .fitcv-landing .hero .lede{max-width:none}
  .fitcv-landing .steps{grid-template-columns:1fr}
  .fitcv-landing .prices{grid-template-columns:1fr}
  .fitcv-landing .trust-grid{grid-template-columns:1fr; gap:26px}
  .fitcv-landing .final{padding:40px 24px}
  .fitcv-landing section{padding-block:48px}
}
@media (prefers-reduced-motion:reduce){.fitcv-landing *{transition:none !important}}
.fitcv-landing :focus-visible{outline:2px solid var(--gold-solid); outline-offset:2px; border-radius:6px}
`;

export default function Landing() {
  const router = useRouter();
  const register = () => router.push('/register');
  const login = () => router.push('/login');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('fitcv-theme');
      if (saved) document.documentElement.setAttribute('data-theme', saved);
    } catch {}
  }, []);

  const toggleTheme = () => {
    const cur =
      document.documentElement.getAttribute('data-theme') ||
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('fitcv-theme', next);
    } catch {}
  };

  return (
    <div className="fitcv-landing">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=Public+Sans:wght@400;500;600&family=JetBrains+Mono:wght@500;700&display=swap"
      />
      <style>{CSS}</style>

      <div className="wrap">
        <nav>
          <div className="logo">fit<b>cv</b></div>
          <div className="nav-r">
            <button className="theme-toggle" onClick={toggleTheme} aria-label="Cambiar tema">◐</button>
            <button className="btn btn-ghost" onClick={login}>Entrar</button>
            <button className="btn btn-gold" onClick={register}>Comenzar gratis</button>
          </div>
        </nav>

        <header className="hero">
          <div className="hero-grid">
            <div>
              <span className="eyebrow"><span className="dot"></span>Sin mentiras, nada inflado · Toda tu experiencia real</span>
              <h1>Deja de postular <span className="u">oferta por oferta</span>.</h1>
              <p className="lede">En todas te preguntan lo mismo… <b>¡qué lata!</b> Con FITCV postulas a <b>todas las ofertas que se ajustan a tu perfil</b>, de forma automática.</p>
              <div className="hero-cta">
                <button className="btn btn-gold" onClick={register}>Ver mi diagnóstico gratis</button>
                <a className="btn btn-ghost" href="#como" style={{ color: 'var(--hero-ink)' }}>Cómo funciona</a>
              </div>
              <p className="assure"><span className="check">✓</span> Toma 2 minutos · No inventamos nada en tu CV</p>
            </div>

            <div className="card" aria-label="Ejemplo de diagnóstico">
              <div className="card-top">
                <div className="who">
                  <div className="avatar">EF</div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>Tu diagnóstico</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>Logística · Supply Chain</div>
                  </div>
                </div>
                <span className="tag">Ejemplo</span>
              </div>
              <div className="card-body">
                <div className="bignum">
                  <span className="n mono">575</span>
                  <span className="lbl">ofertas vigentes<br />te calzan hoy</span>
                </div>
                <div className="tiers">
                  <div className="tier hi"><div className="v">140</div><div className="k">Afinidad alta</div></div>
                  <div className="tier"><div className="v">96</div><div className="k">Media</div></div>
                  <div className="tier"><div className="v">57</div><div className="k">Baja</div></div>
                </div>
                <div className="sec-label">Tus fortalezas en el mercado</div>
                <div className="chips">
                  <span className="chip">operaciones · 175</span>
                  <span className="chip">logística · 141</span>
                  <span className="chip">abastecimiento · 87</span>
                  <span className="chip">SAP · 26</span>
                </div>
                <div className="sec-label">Lo que te falta (y podrías agregar)</div>
                <div className="gap">
                  <div className="g-top"><span className="term">bodega</span><span className="cnt">99 ofertas</span></div>
                  <div className="g-sub">Lo piden 99 ofertas y no aparece escrito en tu CV.</div>
                </div>
              </div>
              <div className="card-foot"><span className="check">✓</span> Datos reales de tu CV. Cero invenciones.</div>
            </div>
          </div>
        </header>

        <section id="como">
          <div className="kicker">Cómo funciona</div>
          <h2 className="h2">De la frustración a la entrevista, en tres pasos.</h2>
          <p className="sub">Sin trucos ni exageraciones. Tu experiencia real, ordenada para que cada reclutador vea por qué encajas.</p>
          <div className="steps">
            <div className="step">
              <div className="idx">01</div>
              <h3>Sube tu CV</h3>
              <p>Leemos tu experiencia real —cargos, empresas, fechas— tal como la escribiste. Nada se cambia ni se inventa.</p>
            </div>
            <div className="step">
              <div className="idx">02</div>
              <h3>Recibe tu diagnóstico</h3>
              <p>Vemos cuántas ofertas vigentes te calzan, tus fortalezas frente al mercado y qué te falta escribir para llegar a más.</p>
            </div>
            <div className="step">
              <div className="idx">03</div>
              <h3>Postula adaptado</h3>
              <p>Para cada oferta que solicite tu CV como archivo adjunto, toda su narrativa se orienta hacia el perfil de lo que solicitan —solo con lo que ya tienes— y postulas en un clic.</p>
            </div>
          </div>
          <div className="wa-note">
            <span className="wa-ico" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M17.6 6.32A7.85 7.85 0 0 0 12 4a7.94 7.94 0 0 0-6.9 11.9L4 20l4.2-1.1A7.9 7.9 0 0 0 12 20a7.94 7.94 0 0 0 5.6-13.68ZM12 18.5a6.6 6.6 0 0 1-3.36-.92l-.24-.14-2.5.65.67-2.43-.16-.25A6.6 6.6 0 1 1 12 18.5Zm3.6-4.95c-.2-.1-1.17-.58-1.35-.64s-.31-.1-.44.1-.5.63-.62.76-.23.15-.43.05a5.4 5.4 0 0 1-1.6-.98 6 6 0 0 1-1.1-1.37c-.12-.2 0-.3.09-.4l.3-.35c.1-.12.13-.2.2-.34a.37.37 0 0 0-.02-.35c-.05-.1-.44-1.06-.6-1.45s-.32-.33-.44-.34h-.38a.72.72 0 0 0-.52.24 2.2 2.2 0 0 0-.68 1.63 3.8 3.8 0 0 0 .8 2.02 8.7 8.7 0 0 0 3.34 2.95c.47.2.83.32 1.11.42.47.15.9.13 1.23.08.38-.06 1.17-.48 1.33-.94s.17-.86.12-.94-.18-.13-.38-.23Z" /></svg>
            </span>
            <p><b>Automático, pero tú mandas.</b> Te avisamos por WhatsApp cada vez que postulamos a una oferta que está fuera de rango —si pagan menos del rango que pediste, o si tu perfil no se ajusta dentro de los parámetros— para que tú decidas. Nunca postulamos algo importante sin tu visto bueno.</p>
          </div>
        </section>

        <section style={{ paddingTop: 16 }}>
          <div className="kicker">Tu seguimiento</div>
          <h2 className="h2">Tu búsqueda completa, en un solo tablero.</h2>
          <p className="sub">FITCV marca automáticamente hasta «Enviada». Desde ahí, tú registras tu avance —en revisión, entrevista— como en tu propio panel. <b>Nunca leemos tu correo</b>: el seguimiento lo llevas tú.</p>

          <div className="dash" aria-label="Ejemplo de tablero de postulaciones">
            <div className="dash-head">
              <span className="t">Tus postulaciones</span>
              <div className="dash-filters">
                <span className="filter on">Todas · 47</span>
                <span className="filter">Enviadas</span>
                <span className="filter">Requieren tu decisión · 2</span>
              </div>
            </div>
            <div className="drow">
              <div>
                <div className="title">Jefe de Logística y Abastecimiento</div>
                <div className="meta">Tested SpA · Santiago <span className="aff hi"><span className="d"></span>Afinidad alta</span></div>
              </div>
              <span className="pill p-int">Entrevista</span>
            </div>
            <div className="drow">
              <div>
                <div className="title">Coordinador de Operaciones</div>
                <div className="meta">DHL Chile · Pudahuel <span className="aff hi"><span className="d"></span>Afinidad alta</span></div>
              </div>
              <span className="pill p-sent">Enviada</span>
            </div>
            <div className="drow">
              <div>
                <div className="title">Subgerente de Bodega</div>
                <div className="meta">Falabella · San Bernardo <span className="aff hi"><span className="d"></span>Afinidad alta</span></div>
              </div>
              <span className="pill p-auth">Requiere tu autorización · sueldo</span>
            </div>
            <div className="drow">
              <div>
                <div className="title">Analista de Supply Chain</div>
                <div className="meta">Walmart Chile · Quilicura <span className="aff md"><span className="d"></span>Afinidad media</span></div>
              </div>
              <span className="pill p-queue">En cola</span>
            </div>
            <div className="drow">
              <div>
                <div className="title">Encargado de Adquisiciones</div>
                <div className="meta">CCU · Santiago <span className="aff md"><span className="d"></span>Afinidad media</span></div>
              </div>
              <span className="pill p-attn">Requiere atención</span>
            </div>
          </div>
          <p className="price-note" style={{ marginTop: 14 }}>FITCV completa hasta «Enviada» automáticamente · los estados posteriores los marcas tú</p>
        </section>

        <section style={{ paddingTop: 16 }}>
          <div className="trust">
            <div className="trust-grid">
              <div>
                <div className="kicker">Ofertas reales de Chile</div>
                <h2 className="h2" style={{ fontSize: 28 }}>Sincronizamos los portales por ti, cada hora.</h2>
                <p className="sub" style={{ fontSize: 16 }}>Miles de avisos vigentes, filtrados a los que de verdad calzan con tu perfil. Nada de listas genéricas.</p>
                <div className="portals">
                  <span className="portal">Get on Board</span>
                  <span className="portal">trabajando.cl</span>
                  <span className="portal">Computrabajo</span>
                  <span className="portal">Chiletrabajos</span>
                  <span className="portal">LinkedIn <em>vía extensión</em></span>
                  <span className="portal">Bolsa Nacional de Empleo</span>
                  <span className="portal">Portal Minero</span>
                </div>
              </div>
              <div className="promise">
                <h3>La promesa que nos hace distintos</h3>
                <p><span className="big">Nunca mentimos por ti.</span> Empresas, cargos, fechas y estudios se copian tal cual de tu CV. Solo cambiamos cómo se cuenta tu historia para cada oferta —jamás los hechos.</p>
              </div>
            </div>
          </div>
        </section>

        <section>
          <div className="kicker">Precios</div>
          <h2 className="h2">Empieza gratis. Paga solo si quieres postular más.</h2>
          <p className="sub">El diagnóstico y tus primeras postulaciones son gratis. Cuando quieras acelerar, subes de plan.</p>

          <div className="prices">
            <div className="price">
              <div className="plan">Gratis</div>
              <div className="amt"><span className="v">$0</span><span className="per">para probar</span></div>
              <div className="quota">5 postulaciones · por única vez</div>
              <ul>
                <li><span className="ck">✓</span> Diagnóstico completo de tu CV</li>
                <li><span className="ck">✓</span> Ofertas que calzan con tu perfil</li>
                <li><span className="ck">✓</span> CV adaptado a cada oferta</li>
                <li><span className="ck">✓</span> Avisos por WhatsApp</li>
              </ul>
              <button className="btn btn-dark" onClick={register}>Probar gratis</button>
            </div>

            <div className="price feat">
              <span className="badge">Más popular</span>
              <div className="plan">Pro</div>
              <div className="amt"><span className="v">$10.990</span><span className="per">CLP / mes</span></div>
              <div className="quota">300 postulaciones al mes</div>
              <ul>
                <li><span className="ck">✓</span> Diagnóstico y CV adaptado sin límite</li>
                <li><span className="ck">✓</span> Auto-postulación en los portales <em style={{ fontStyle: 'normal', color: 'var(--muted)' }}>(LinkedIn solo en Ilimitado)</em></li>
                <li><span className="ck">✓</span> Prioridad en la cola de envío</li>
                <li><span className="ck">✓</span> Sin límite de cargos senior</li>
              </ul>
              <button className="btn btn-gold" onClick={register}>Empezar con Pro</button>
            </div>

            <div className="price">
              <div className="plan">Ilimitado</div>
              <div className="amt"><span className="v">$15.990</span><span className="per">CLP / mes</span></div>
              <div className="quota">Postulaciones ilimitadas</div>
              <ul>
                <li><span className="ck">✓</span> Todo lo del plan Pro</li>
                <li><span className="ck">✓</span> Postulaciones sin límite</li>
                <li><span className="ck">✓</span> Incluye LinkedIn <em style={{ fontStyle: 'normal', color: 'var(--muted)' }}>(vía extensión)</em></li>
                <li><span className="ck">✓</span> Soporte prioritario</li>
              </ul>
              <button className="btn btn-dark" onClick={register}>Ir a Ilimitado</button>
            </div>
          </div>
          <p className="price-note">Sin tarjeta para empezar · Cancela cuando quieras · Precios en pesos chilenos</p>
        </section>

        <section>
          <div className="final">
            <h2>¿Cuántas ofertas te calzan hoy?</h2>
            <p>Descúbrelo en 2 minutos. Gratis, y sin inventar una sola línea.</p>
            <button className="btn btn-gold" onClick={register}>Ver mi diagnóstico</button>
          </div>
        </section>

        <footer>
          © 2026 fitcv · Tu CV, adaptado a cada oferta · Hecho en Chile ·{' '}
          <a href="mailto:contacto@fitcv.cl">contacto@fitcv.cl</a>
        </footer>
      </div>
    </div>
  );
}
