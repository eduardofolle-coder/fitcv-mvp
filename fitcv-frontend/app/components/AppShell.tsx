'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/hooks/useAuth';
import { apiClient } from '@/lib/api-client';
import { ReactNode } from 'react';

const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/preferences', label: 'Mis respuestas' },
  { href: '/cv', label: 'Mi CV' },
  { href: '/offers', label: 'Ofertas' },
  { href: '/postulations', label: 'Postulaciones' },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await apiClient.post('/auth/logout', {});
    logout();
    window.location.href = '/login';
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@700;800&family=Public+Sans:wght@400;500;600;700&display=swap');
        .aw-root{
          min-height:100vh; background:#0F1E2F; color:#F4F1E9;
          font-family:"Public Sans",ui-sans-serif,system-ui,sans-serif;
        }
        .aw-header{
          background:#14273F; border-bottom:1px solid rgba(255,255,255,.08);
          position:sticky; top:0; z-index:40;
        }
        .aw-header-inner{
          max-width:1200px; margin:0 auto; padding:0 20px;
          display:flex; align-items:center; gap:8px; height:56px;
        }
        .aw-logo{
          font-family:"Bricolage Grotesque",ui-sans-serif,system-ui,sans-serif;
          font-weight:800; font-size:20px; color:#F4F1E9; letter-spacing:-.03em;
          text-decoration:none; margin-right:12px; flex-shrink:0;
        }
        .aw-logo b{ color:#E1A526; }
        .aw-nav{ display:flex; align-items:center; gap:2px; flex:1; overflow-x:auto; }
        .aw-nav-item{
          color:#A9B6C8; border-radius:7px; padding:6px 12px;
          font-size:14px; font-weight:500; text-decoration:none;
          transition:background .12s,color .12s; white-space:nowrap;
        }
        .aw-nav-item:hover{ background:rgba(255,255,255,.06); color:#F4F1E9; }
        .aw-nav-active{ background:rgba(225,165,38,.12) !important; color:#E1A526 !important; }
        .aw-user{ font-size:13px; color:#6C7686; flex-shrink:0; }
        .aw-logout{
          background:transparent; border:1px solid rgba(255,255,255,.14); border-radius:7px;
          color:#A9B6C8; font-size:13px; font-weight:500; padding:5px 12px;
          cursor:pointer; flex-shrink:0; transition:border-color .12s,color .12s;
        }
        .aw-logout:hover{ border-color:#E1A526; color:#E1A526; }
        .aw-main{ max-width:1200px; margin:0 auto; padding:28px 20px 48px; }
        .aw-card{
          background:#162D46; border-radius:12px;
          border:1px solid rgba(255,255,255,.08); padding:24px;
        }
        .aw-card-sm{ padding:16px; }
        .aw-stat{
          background:#162D46; border-radius:10px;
          border:1px solid rgba(255,255,255,.08); padding:16px 20px;
        }
        .aw-h1{ font-size:24px; font-weight:700; color:#F4F1E9; margin:0 0 4px; }
        .aw-h2{ font-size:18px; font-weight:700; color:#F4F1E9; margin:0 0 14px; }
        .aw-muted{ color:#A9B6C8; font-size:14px; }
        .aw-dim{ color:#6C7686; font-size:13px; }
        .aw-label{ font-size:13px; font-weight:600; color:#A9B6C8; margin-bottom:6px; display:block; }
        .aw-input{
          width:100%; padding:10px 14px; background:rgba(255,255,255,.05);
          border:1.5px solid rgba(255,255,255,.12); border-radius:9px;
          color:#F4F1E9; font-size:14px; font-family:inherit; outline:none;
          transition:border-color .15s; box-sizing:border-box;
        }
        .aw-input:focus{ border-color:#E1A526; background:rgba(255,255,255,.07); }
        .aw-input::placeholder{ color:#4A5568; }
        .aw-select{
          width:100%; padding:10px 14px; background:rgba(255,255,255,.05);
          border:1.5px solid rgba(255,255,255,.12); border-radius:9px;
          color:#F4F1E9; font-size:14px; font-family:inherit; outline:none;
          transition:border-color .15s; box-sizing:border-box; cursor:pointer;
        }
        .aw-select:focus{ border-color:#E1A526; }
        .aw-select option{ background:#162D46; color:#F4F1E9; }
        .aw-btn-gold{
          display:inline-flex; align-items:center; justify-content:center; gap:6px;
          background:#E1A526; color:#1B1206; font-weight:700; font-size:14px;
          border:none; border-radius:8px; padding:10px 20px; cursor:pointer;
          font-family:inherit; transition:opacity .12s,transform .12s;
          text-decoration:none;
        }
        .aw-btn-gold:hover:not(:disabled){ opacity:.9; transform:translateY(-1px); }
        .aw-btn-gold:disabled{ opacity:.5; cursor:not-allowed; }
        .aw-btn-outline{
          display:inline-flex; align-items:center; justify-content:center; gap:6px;
          background:transparent; color:#A9B6C8; font-weight:600; font-size:14px;
          border:1.5px solid rgba(255,255,255,.16); border-radius:8px;
          padding:10px 18px; cursor:pointer; font-family:inherit;
          transition:border-color .12s,color .12s; text-decoration:none;
        }
        .aw-btn-outline:hover{ border-color:#E1A526; color:#E1A526; }
        .aw-btn-sm{ padding:6px 14px; font-size:13px; }
        .aw-filter{
          background:rgba(255,255,255,.06); color:#A9B6C8; border:1px solid rgba(255,255,255,.1);
          border-radius:20px; padding:5px 14px; font-size:13px; font-weight:500;
          cursor:pointer; font-family:inherit; transition:background .12s,color .12s,border-color .12s;
        }
        .aw-filter:hover{ background:rgba(255,255,255,.1); color:#F4F1E9; }
        .aw-filter-active{
          background:rgba(225,165,38,.15) !important; color:#E1A526 !important;
          border-color:rgba(225,165,38,.4) !important;
        }
        .aw-row{
          display:flex; align-items:center; padding:14px 0;
          border-bottom:1px solid rgba(255,255,255,.06);
        }
        .aw-row:last-child{ border-bottom:none; }
        /* pills */
        .aw-pill{
          display:inline-block; padding:3px 10px; border-radius:20px;
          font-size:12px; font-weight:600; letter-spacing:.02em;
        }
        .aw-pill-gray{ background:rgba(169,182,200,.15); color:#A9B6C8; }
        .aw-pill-blue{ background:rgba(59,130,246,.18); color:#93C5FD; }
        .aw-pill-gold{ background:rgba(225,165,38,.18); color:#E1A526; }
        .aw-pill-green{ background:rgba(52,211,153,.18); color:#6EE7B7; }
        .aw-pill-red{ background:rgba(248,113,113,.18); color:#FCA5A5; }
        .aw-pill-purple{ background:rgba(167,139,250,.18); color:#C4B5FD; }
        .aw-pill-orange{ background:rgba(251,146,60,.18); color:#FED7AA; }
        /* alerts */
        .aw-error{ background:rgba(248,113,113,.1); border:1px solid rgba(248,113,113,.3); border-radius:9px; padding:12px 16px; color:#FCA5A5; font-size:14px; }
        .aw-success{ background:rgba(52,211,153,.1); border:1px solid rgba(52,211,153,.3); border-radius:9px; padding:12px 16px; color:#6EE7B7; font-size:14px; }
        .aw-info{ background:rgba(99,179,237,.1); border:1px solid rgba(99,179,237,.3); border-radius:9px; padding:12px 16px; color:#90CDF4; font-size:14px; }
        .aw-warning{ background:rgba(251,146,60,.1); border:1px solid rgba(251,146,60,.3); border-radius:9px; padding:12px 16px; color:#FED7AA; font-size:14px; }
        /* code/pre */
        .aw-pre{
          background:rgba(0,0,0,.3); color:#D1CCBF; border-radius:8px;
          padding:14px; font-size:13px; font-family:"Courier New",monospace;
          overflow-x:auto; white-space:pre-wrap; word-break:break-all;
          border:1px solid rgba(255,255,255,.06);
        }
        /* dropzone */
        .aw-dropzone{
          border:2px dashed rgba(225,165,38,.3); border-radius:12px;
          padding:32px; text-align:center; cursor:pointer;
          transition:border-color .15s,background .15s;
        }
        .aw-dropzone:hover,.aw-dropzone-active{
          border-color:rgba(225,165,38,.7); background:rgba(225,165,38,.04);
        }
        /* loading */
        .aw-loading{
          min-height:100vh; background:#0F1E2F; display:flex;
          align-items:center; justify-content:center; color:#A9B6C8;
        }
        /* divider */
        .aw-divider{ height:1px; background:rgba(255,255,255,.08); margin:20px 0; }
        /* grid */
        .aw-grid-2{ display:grid; grid-template-columns:1fr 1fr; gap:16px; }
        .aw-grid-3{ display:grid; grid-template-columns:repeat(3,1fr); gap:16px; }
        .aw-grid-4{ display:grid; grid-template-columns:repeat(4,1fr); gap:14px; }
        @media(max-width:640px){
          .aw-grid-2,.aw-grid-3,.aw-grid-4{ grid-template-columns:1fr; }
          .aw-user{ display:none; }
        }
      `}</style>

      <div className="aw-root">
        <header className="aw-header">
          <div className="aw-header-inner">
            <Link href="/dashboard" className="aw-logo">fit<b>cv</b></Link>
            <nav className="aw-nav">
              {NAV.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className={`aw-nav-item${pathname === href || (href !== '/dashboard' && pathname?.startsWith(href)) ? ' aw-nav-active' : ''}`}
                >
                  {label}
                </Link>
              ))}
            </nav>
            {user?.email && <span className="aw-user">{user.email}</span>}
            <button className="aw-logout" onClick={() => void handleLogout()}>Salir</button>
          </div>
        </header>

        <main className="aw-main">{children}</main>
      </div>
    </>
  );
}
