import React, { useState } from 'react';
import { Layout } from './components/Layout';
import { SeoAudit } from './components/SeoAudit';
import { CreativeStudio } from './components/CreativeStudio';

// Global types for navigation
export type View = 'seo' | 'creative';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<View>('seo');

  return (
    <Layout currentView={currentView} onViewChange={setCurrentView}>
      {currentView === 'seo' ? <SeoAudit /> : <CreativeStudio />}
    </Layout>
  );
};

export default App;