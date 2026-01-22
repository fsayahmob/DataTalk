import { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { InfraDashboard } from './components/InfraDashboard';
import { ConfigurationPage } from './components/ConfigurationPage';
import architectureData from '../expected-architecture-reactflow.json';

// Architecture data type inferred from JSON
type ArchitectureData = typeof architectureData;

function App() {
  const [architecture, setArchitecture] = useState<ArchitectureData>(architectureData);

  const handleSaveArchitecture = (newArchitecture: ArchitectureData) => {
    setArchitecture(newArchitecture);
    console.log('Architecture saved:', newArchitecture);
  };

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={<InfraDashboard architecture={architecture as Parameters<typeof InfraDashboard>[0]['architecture']} />}
        />
        <Route
          path="/config"
          element={
            <ConfigurationPage
              architecture={architecture as Parameters<typeof ConfigurationPage>[0]['architecture']}
              onSave={handleSaveArchitecture as Parameters<typeof ConfigurationPage>[0]['onSave']}
            />
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
