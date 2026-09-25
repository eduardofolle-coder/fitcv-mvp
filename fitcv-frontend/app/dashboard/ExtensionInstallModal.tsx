'use client';

const CHROME_STORE_URL = process.env.NEXT_PUBLIC_CHROME_EXTENSION_URL ?? '';

export function ExtensionInstallModal({ onDismiss }: { onDismiss: () => void }) {
  const handleInstall = () => {
    if (CHROME_STORE_URL) window.open(CHROME_STORE_URL, '_blank', 'noopener,noreferrer');
    onDismiss();
  };

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:100,
      background:'rgba(0,0,0,.65)', backdropFilter:'blur(4px)',
      display:'flex', alignItems:'center', justifyContent:'center', padding:20,
    }}>
      <div style={{
        background:'#162D46', border:'1px solid rgba(255,255,255,.12)', borderRadius:16,
        padding:'32px 28px', maxWidth:460, width:'100%',
        boxShadow:'0 24px 64px rgba(0,0,0,.5)',
      }}>
        {/* Icon */}
        <div style={{ width:56, height:56, borderRadius:14, background:'rgba(225,165,38,.15)', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:20 }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#E1A526" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 8v4l3 3"/>
          </svg>
        </div>

        <h2 style={{ fontFamily:'"Bricolage Grotesque",ui-sans-serif,sans-serif', fontSize:22, fontWeight:800, color:'#F4F1E9', marginBottom:8 }}>
          Automatiza tus postulaciones
        </h2>
        <p style={{ color:'#A9B6C8', fontSize:14, lineHeight:1.6, marginBottom:24 }}>
          La extensión de Chrome de FITCV abre los formularios, los completa con tu CV adaptado y los envía por ti.
          Se instala en <strong style={{ color:'#F4F1E9' }}>2 clics</strong> desde la Chrome Web Store.
        </p>

        <div style={{ display:'flex', gap:8, marginBottom:16 }}>
          <div style={{ flex:1, background:'rgba(255,255,255,.04)', borderRadius:10, padding:'12px 14px', textAlign:'center' }}>
            <p style={{ fontSize:20, marginBottom:4 }}>⚡</p>
            <p style={{ fontSize:12, color:'#A9B6C8' }}>Postula automáticamente</p>
          </div>
          <div style={{ flex:1, background:'rgba(255,255,255,.04)', borderRadius:10, padding:'12px 14px', textAlign:'center' }}>
            <p style={{ fontSize:20, marginBottom:4 }}>📋</p>
            <p style={{ fontSize:12, color:'#A9B6C8' }}>CV adaptado a cada oferta</p>
          </div>
          <div style={{ flex:1, background:'rgba(255,255,255,.04)', borderRadius:10, padding:'12px 14px', textAlign:'center' }}>
            <p style={{ fontSize:20, marginBottom:4 }}>🛡️</p>
            <p style={{ fontSize:12, color:'#A9B6C8' }}>Solo lo que tu CV respalda</p>
          </div>
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {CHROME_STORE_URL ? (
            <button onClick={handleInstall} className="aw-btn-gold" style={{ width:'100%', justifyContent:'center', fontSize:15 }}>
              Instalar extensión en Chrome
            </button>
          ) : (
            <div style={{ textAlign:'center', padding:'12px', background:'rgba(225,165,38,.08)', borderRadius:8 }}>
              <p style={{ color:'#E1A526', fontSize:13, fontWeight:600 }}>Próximamente en Chrome Web Store</p>
              <p className="aw-dim">Mientras tanto, puedes vincular la extensión manualmente desde el panel de abajo.</p>
            </div>
          )}
          <button onClick={onDismiss} className="aw-btn-outline" style={{ width:'100%', justifyContent:'center' }}>
            Ahora no
          </button>
        </div>
      </div>
    </div>
  );
}
