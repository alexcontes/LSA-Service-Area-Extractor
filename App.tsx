import React, { useState, useCallback, useEffect } from 'react';
import MapView from './MapView';
import DataPanel from './DataPanel';
import Header from './Header';
import { ServiceArea } from './types';
import { fetchAreasInPolygon, geocodeWithAI } from './geoService';

const App: React.FC = () => {
  const [areas, setAreas] = useState<ServiceArea[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [incomeThreshold, setIncomeThreshold] = useState(125000);
  const [showOnlyHighIncome, setShowOnlyHighIncome] = useState(false);
  const [hasKey, setHasKey] = useState(true);
  const [mapCenterRequest, setMapCenterRequest] = useState<{lat: number, lng: number, radius: number} | null>(null);

  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio && typeof window.aistudio.hasSelectedApiKey === 'function') {
        const selected = await window.aistudio.hasSelectedApiKey();
        setHasKey(selected);
      }
    };
    checkKey();
  }, []);

  const handleOpenKeySelector = async () => {
    if (window.aistudio && typeof window.aistudio.openSelectKey === 'function') {
      await window.aistudio.openSelectKey();
      setHasKey(true);
    }
  };

  const handlePolygonDrawn = useCallback(async (coords: number[][]) => {
    setIsProcessing(true);
    try {
      const results = await fetchAreasInPolygon(coords);
      setAreas(prev => {
        const existingNames = new Set(prev.map(p => `${p.type}-${p.name}`));
        const uniqueNew = results.filter(r => !existingNames.has(`${r.type}-${r.name}`));
        return [...prev, ...uniqueNew];
      });
    } catch (error: any) {
      console.error("Extraction error:", error);
      alert(`AI Extraction Failed: ${error.message || "Unknown error"}`);
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const handleRadiusExtract = async (address: string, radiusMiles: number) => {
    setIsProcessing(true);
    try {
      let center: { lat: number, lng: number } | null = null;

      // 1. Try Nominatim Geocoding
      try {
        const geoResp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`);
        if (geoResp.ok) {
          const geoData = await geoResp.json();
          if (geoData && geoData.length > 0) {
            center = { lat: parseFloat(geoData[0].lat), lng: parseFloat(geoData[0].lon) };
          }
        }
      } catch (e) {
        console.warn("Nominatim failed, trying AI fallback...");
      }

      // 2. Fallback to Gemini Geocoding if OSM fails
      if (!center) {
        center = await geocodeWithAI(address);
      }

      if (!center) {
        alert("Could not locate that address. Please be more specific (e.g. 123 Main St, Miami, FL).");
        setIsProcessing(false);
        return;
      }

      // 3. Update Map & Circle
      setMapCenterRequest({ lat: center.lat, lng: center.lng, radius: radiusMiles });

      // 4. Generate Polygon for AI Processing
      const points = 32; // Higher precision for circles
      const radiusInKm = radiusMiles * 1.60934;
      const radiusInDeg = radiusInKm / 111.32;
      const polygonCoords: number[][] = [];
      
      for (let i = 0; i < points; i++) {
        const angle = (i / points) * (2 * Math.PI);
        const latOffset = radiusInDeg * Math.cos(angle);
        const lngOffset = (radiusInDeg * Math.sin(angle)) / Math.cos(center.lat * Math.PI / 180);
        polygonCoords.push([center.lat + latOffset, center.lng + lngOffset]);
      }
      polygonCoords.push(polygonCoords[0]); // Close

      // 5. Run Extraction
      await handlePolygonDrawn(polygonCoords);
    } catch (error: any) {
      console.error("Search failure:", error);
      alert(`Search failed: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleToggleArea = (id: string) => {
    setAreas(prev => prev.map(a => a.id === id ? { ...a, isSelected: !a.isSelected } : a));
  };

  const handleSelectAll = (select: boolean) => {
    setAreas(prev => prev.map(a => ({ ...a, isSelected: select })));
  };

  const filteredAreas = areas.filter(a => {
    if (showOnlyHighIncome && a.type === 'Zip Code' && a.income) {
      return a.income >= incomeThreshold;
    }
    return true;
  });

  return (
    <div className="flex flex-col h-screen w-screen bg-white overflow-hidden font-sans">
      <Header onRadiusExtract={handleRadiusExtract} />
      
      {!hasKey && (
        <div className="bg-amber-50 border-b border-amber-100 px-6 py-2 flex items-center justify-between z-20 shrink-0">
          <p className="text-[11px] font-black text-amber-800 uppercase tracking-tighter flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-ping"></span>
            Project Key Required for AI Extraction
          </p>
          <button 
            onClick={handleOpenKeySelector}
            className="bg-amber-600 text-white text-[10px] font-black px-4 py-1.5 rounded-full hover:bg-amber-700 transition-all uppercase tracking-widest shadow-sm active:scale-95"
          >
            Connect Project
          </button>
        </div>
      )}

      <main className="flex flex-1 overflow-hidden">
        <div className="flex-1 relative border-r border-gray-100 bg-gray-50">
          <MapView onPolygonDrawn={handlePolygonDrawn} centerRequest={mapCenterRequest} />
          
          {isProcessing && (
            <div className="absolute inset-0 z-[2000] bg-white/70 backdrop-blur-md flex flex-col items-center justify-center animate-in fade-in duration-300">
              <div className="bg-white p-12 rounded-[40px] shadow-2xl border border-blue-50 flex flex-col items-center">
                <div className="relative h-16 w-16 mb-6">
                  <div className="absolute inset-0 rounded-full border-4 border-blue-100 border-t-blue-600 animate-spin"></div>
                </div>
                <h3 className="text-2xl font-black text-gray-900 tracking-tight">Processing Data</h3>
                <p className="text-sm text-gray-500 mt-2 text-center max-w-[240px] leading-relaxed font-medium">
                  Locating address and extracting regional data...
                </p>
              </div>
            </div>
          )}
        </div>

        <aside className="w-[420px] flex flex-col bg-white shadow-[-10px_0_30px_rgba(0,0,0,0.02)] z-10">
          <DataPanel 
            areas={filteredAreas}
            onToggleArea={handleToggleArea}
            onSelectAll={handleSelectAll}
            incomeThreshold={incomeThreshold}
            setIncomeThreshold={setIncomeThreshold}
            showOnlyHighIncome={showOnlyHighIncome}
            setShowOnlyHighIncome={setShowOnlyHighIncome}
            totalCount={areas.length}
          />
        </aside>
      </main>
    </div>
  );
};

export default App;
