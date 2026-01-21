import React from 'react';
import { View } from '../App';
import { LayoutDashboard, Wand2, Menu, X, LogOut, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface LayoutProps {
  children: React.ReactNode;
  currentView: View;
  onViewChange: (view: View) => void;
}

export const Layout: React.FC<LayoutProps> = ({ children, currentView, onViewChange }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const { user, logout } = useAuth();

  const NavItem = ({ view, icon: Icon, label }: { view: View; icon: any; label: string }) => (
    <button
      onClick={() => {
        onViewChange(view);
        setIsMobileMenuOpen(false);
      }}
      className={`flex items-center w-full px-4 py-3 rounded-lg transition-colors mb-2 ${
        currentView === view
          ? 'bg-cyan-600 text-white shadow-md shadow-cyan-900/20'
          : 'text-slate-400 hover:bg-slate-800 hover:text-white'
      }`}
    >
      <Icon className="w-5 h-5 mr-3" />
      <span className="font-medium">{label}</span>
    </button>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex flex-col md:flex-row">
      {/* Mobile Header */}
      <div className="md:hidden bg-slate-900 p-4 flex justify-between items-center border-b border-slate-800 sticky top-0 z-50">
        <h1 className="text-xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
          BlankDigi Suite
        </h1>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
          {isMobileMenuOpen ? <X /> : <Menu />}
        </button>
      </div>

      {/* Sidebar */}
      <aside
        className={`${
          isMobileMenuOpen ? 'flex' : 'hidden'
        } md:flex flex-col w-full md:w-64 bg-slate-900 border-r border-slate-800 flex-shrink-0 fixed md:sticky top-0 md:h-screen z-40`}
      >
        {/* Navigation Content */}
        <div className="p-6 flex-1 overflow-y-auto">
          <h1 className="hidden md:block text-2xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent mb-8">
            BlankDigi Suite
          </h1>
          <nav>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
              Operations
            </div>
            <NavItem view="seo" icon={LayoutDashboard} label="SEO & DevOps" />
            
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4 mt-8">
              Creative
            </div>
            <NavItem view="creative" icon={Wand2} label="AI Studio" />
          </nav>

          <div className="mt-12 p-4 bg-slate-800/50 rounded-xl border border-slate-700">
            <h3 className="text-sm font-semibold text-white mb-2">System Status</h3>
            <div className="flex items-center text-xs text-green-400 mb-1">
              <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
              Gemini 3 Pro Active
            </div>
             <div className="flex items-center text-xs text-green-400">
              <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
              Veo Video Ready
            </div>
          </div>
        </div>

        {/* User Profile & Logout Section */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/80 mt-auto">
            <div className="flex items-center gap-3 mb-3 px-2">
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 text-white" />
                </div>
                <div className="overflow-hidden">
                    <p className="text-sm font-medium text-white truncate">{user?.full_name || 'User'}</p>
                    <p className="text-xs text-slate-500 truncate">{user?.email}</p>
                </div>
            </div>
            <button
                onClick={logout}
                className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-red-500/10 hover:text-red-400 text-slate-400 py-2 rounded-lg transition-colors text-sm font-medium border border-slate-700 hover:border-red-500/30"
            >
                <LogOut className="w-4 h-4" />
                Sign Out
            </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-8 max-w-full overflow-hidden">
        <div className="max-w-7xl mx-auto h-full">
          {children}
        </div>
      </main>
    </div>
  );
};