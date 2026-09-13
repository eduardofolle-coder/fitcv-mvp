import { ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks';

interface LayoutProps {
  children: ReactNode;
  title?: string;
}

export function Layout({ children, title }: LayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { href: '/dashboard', label: '📊 Dashboard', icon: '📊' },
    { href: '/cv-upload', label: '📄 Upload CV', icon: '📄' },
    { href: '/cv-management', label: '👤 Profile', icon: '👤' },
    { href: '/postulations', label: '📋 Applications', icon: '📋' },
    { href: '/offers', label: '🎯 Offers', icon: '🎯' },
    { href: '/insights', label: '💡 Insights', icon: '💡' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="text-2xl font-bold text-blue-600 cursor-pointer hover:text-blue-700" onClick={() => navigate('/dashboard')}>
              FITCV
            </div>
            {title && <div className="h-6 w-px bg-gray-300"></div>}
            {title && <h1 className="text-lg font-semibold text-gray-700">{title}</h1>}
          </div>
          <button
            onClick={handleLogout}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition font-medium"
          >
            🚪 Logout
          </button>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className="w-56 bg-white shadow-sm min-h-screen sticky top-0">
          <nav className="p-4 space-y-1">
            {navItems.map(item => (
              <NavLink
                key={item.href}
                to={item.href}
                label={item.label}
                isActive={location.pathname === item.href}
              />
            ))}
          </nav>

          {/* Help Section */}
          <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200 bg-blue-50">
            <p className="text-xs text-gray-600 mb-3">💪 Pro Tips:</p>
            <ul className="text-xs text-gray-600 space-y-1">
              <li>• Start by uploading your CV</li>
              <li>• Review your profile</li>
              <li>• Apply to jobs</li>
              <li>• Track outcomes</li>
            </ul>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-8 pb-20">
          <div className="max-w-7xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

function NavLink({ to, label, isActive }: { to: string; label: string; isActive: boolean }) {
  return (
    <a
      href={to}
      className={`block px-4 py-3 rounded-lg transition font-medium ${
        isActive
          ? 'bg-blue-600 text-white'
          : 'text-gray-700 hover:bg-blue-50 hover:text-blue-600'
      }`}
    >
      {label}
    </a>
  );
}
