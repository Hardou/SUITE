import React, { useState } from 'react';
import { Layout } from './components/Layout';
import { SeoAudit } from './components/SeoAudit';
import { CreativeStudio } from './components/CreativeStudio';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Login } from './components/Login';
import { Loader2 } from 'lucide-react';

// Global types for navigation
export type View = 'seo' | 'creative';

const MainApp: React.FC = () => {
  const [currentView, setCurrentView] = useState<View>('seo');
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-cyan-500 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  return (
    <Layout currentView={currentView} onViewChange={setCurrentView}>
      {currentView === 'seo' ? <SeoAudit /> : <CreativeStudio />}
    </Layout>
  );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
};

export default App;