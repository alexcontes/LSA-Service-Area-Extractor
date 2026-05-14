import React from 'react';
import { ServiceArea } from './types';
import { db, getTrackingContext } from './lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

interface DataPanelProps {
  areas: ServiceArea[];
  onToggleArea: (id: string) => void;
  onSelectAll: (select: boolean) => void;
  incomeThreshold: number;
  setIncomeThreshold: (val: number) => void;
  showOnlyHighIncome: boolean;
  setShowOnlyHighIncome: (val: boolean) => void;
  totalCount: number;
}

const DataPanel: React.FC<DataPanelProps> = ({ 
  areas, 
  onToggleArea, 
  onSelectAll,
  incomeThreshold,
  setIncomeThreshold,
  showOnlyHighIncome,
  setShowOnlyHighIncome,
  totalCount
}) => {
  const selectedCount = areas.filter(a => a.isSelected).length;

  const exportCSV = () => {
    const selected = areas.filter(a => a.isSelected);
    if (selected.length === 0) return;
    let csvContent = "Action,Location Type,Location Name\n";
    selected.forEach(area => {
      csvContent += `ADD,${area.type},${area.name}\n`;
    });
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "lsa_service_areas.csv";
    link.click();
  };

  const [isPushing, setIsPushing] = React.useState(false);
  const [showSuccess, setShowSuccess] = React.useState(false);
  const [successMsg, setSuccessMsg] = React.useState('');
  const [targetClientId, setTargetClientId] = React.useState(process.env.GOOGLE_CLIENT_ID || '');

  const pushToGoogleAds = async () => {
    const selected = areas.filter(a => a.isSelected);
    if (selected.length === 0) return;
    if (!targetClientId) {
      alert("Please enter a Google Ads Client Customer ID.");
      return;
    }

    setIsPushing(true);
    try {
      const response = await fetch('/api/push-to-google-ads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          areas: selected,
          clientId: targetClientId.replace(/-/g, '') // Remove hyphens if present
        }),
      });

      const data = await response.json();
      if (data.success) {
        setSuccessMsg(data.message);
        setShowSuccess(true);
        
        // Log to Push History
        try {
          const { username, accountId } = getTrackingContext();
          await addDoc(collection(db, 'history_pushes'), {
            userId: username,
            accountId: accountId,
            timestamp: serverTimestamp(),
            campaignId: targetClientId,
            serviceAreaCount: selected.length,
            areas: selected.map(a => ({ name: a.name, stateCode: a.stateCode, type: a.type }))
          });
        } catch (err) {
          console.error("Failed to log push history:", err);
        }

        setTimeout(() => setShowSuccess(false), 8000);
      } else {
        alert(`Error: ${data.error || 'Failed to push to Google Ads'}`);
      }
    } catch (error: any) {
      console.error('Push error:', error);
      alert(`Push failed: ${error.message}`);
    } finally {
      setIsPushing(false);
    }
  };

  const clearAll = () => {
    window.location.reload();
  };

  return (
    <div className="flex flex-col h-full relative">
      {showSuccess && (
        <div className="absolute top-4 left-4 right-4 z-50 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="bg-green-600 text-white p-4 rounded-2xl shadow-2xl flex items-center gap-3 border border-green-500">
            <div className="bg-white/20 p-2 rounded-full">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-xs font-black uppercase tracking-widest mb-0.5">Push Successful</p>
              <p className="text-[11px] font-bold opacity-90">{successMsg}</p>
            </div>
            <button onClick={() => setShowSuccess(false)} className="hover:bg-white/10 p-1 rounded-lg transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
      <div className="p-6 border-b bg-gray-50 shrink-0">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Extracted Areas</h2>
            <p className="text-xs text-gray-500 font-medium">Found {totalCount} locations in selection</p>
          </div>
          <button 
            onClick={clearAll}
            className="text-[10px] text-red-600 font-black hover:bg-red-50 px-3 py-1.5 rounded-full border border-red-100 transition-all uppercase tracking-wider"
          >
            Clear All
          </button>
        </div>

        <div className="space-y-4 bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">Min. Household Income ($)</label>
            <input 
              type="number"
              value={incomeThreshold}
              onChange={(e) => setIncomeThreshold(Number(e.target.value))}
              className="w-24 px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono font-bold"
            />
          </div>
          <label className="flex items-center cursor-pointer group">
            <div className="relative flex items-center">
              <input 
                type="checkbox"
                checked={showOnlyHighIncome}
                onChange={(e) => setShowOnlyHighIncome(e.target.checked)}
                className="w-5 h-5 text-blue-600 rounded-md border-gray-300 focus:ring-blue-500 transition-all"
              />
            </div>
            <span className="ml-3 text-xs font-semibold text-gray-700 group-hover:text-blue-600 transition-colors">Only show high-income zones</span>
          </label>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {areas.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center opacity-30 px-8">
            <div className="bg-gray-100 p-6 rounded-full mb-4">
              <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              </svg>
            </div>
            <p className="text-sm font-bold text-gray-900 mb-1">No Data Extracted</p>
            <p className="text-xs leading-relaxed">Draw a rectangle or polygon on the map to begin targeting ZIP codes and cities.</p>
          </div>
        ) : (
          areas.map((area) => (
            <div 
              key={area.id}
              className={`p-4 border rounded-2xl transition-all duration-300 flex items-center gap-4 ${
                area.isSelected ? 'border-blue-400 bg-blue-50 shadow-sm' : 'border-gray-100 bg-white hover:border-gray-300'
              }`}
            >
              <input 
                type="checkbox"
                checked={area.isSelected}
                onChange={() => onToggleArea(area.id)}
                className="w-5 h-5 rounded-md text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-black text-gray-900 truncate">
                    {area.name}{area.stateCode ? `, ${area.stateCode}` : ''}
                  </span>
                  <span className="text-[9px] px-2 py-0.5 rounded-full bg-white border border-gray-200 text-gray-600 font-black uppercase shadow-xs shrink-0">
                    {area.type.split(' ')[0]}
                  </span>
                </div>
                {area.income && (
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-[11px] font-bold ${area.income >= incomeThreshold ? 'text-green-600' : 'text-gray-400'}`}>
                      ${area.income.toLocaleString()}
                    </span>
                    {area.income >= incomeThreshold && (
                      <div className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse"></span>
                        <span className="text-[9px] text-green-600 font-black uppercase tracking-widest">Target</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {areas.length > 0 && (
        <div className="p-6 border-t bg-white shrink-0 space-y-4 shadow-[0_-8px_20px_rgba(0,0,0,0.03)]">
          <div className="flex gap-3">
            <button onClick={() => onSelectAll(true)} className="flex-1 text-[11px] font-black text-blue-600 hover:bg-blue-50 py-2.5 rounded-xl border-2 border-blue-50 uppercase tracking-widest transition-all">Select All</button>
            <button onClick={() => onSelectAll(false)} className="flex-1 text-[11px] font-black text-gray-400 hover:bg-gray-50 py-2.5 rounded-xl border-2 border-gray-50 uppercase tracking-widest transition-all">Deselect</button>
          </div>
          <div className="space-y-3">
            <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100/50 space-y-2">
              <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest block">Client Customer ID</label>
              <input 
                type="text"
                placeholder="e.g. 123-456-7890"
                value={targetClientId}
                onChange={(e) => setTargetClientId(e.target.value)}
                className="w-full bg-white border border-blue-100 rounded-xl px-3 py-2 text-xs font-mono font-bold focus:ring-2 focus:ring-blue-500 outline-none placeholder:text-blue-200"
              />
            </div>
            <button 
              onClick={pushToGoogleAds} 
              disabled={selectedCount === 0 || isPushing}
              className="w-full py-3 bg-gray-900 text-white rounded-2xl text-xs font-black hover:bg-black transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-gray-200"
            >
              {isPushing ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              )}
              Push to Google Local Service ADS
            </button>
            <button 
              onClick={exportCSV} 
              disabled={selectedCount === 0}
              className="w-full py-4 bg-blue-600 text-white rounded-2xl text-sm font-black hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export CSV for LSA ({selectedCount})
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DataPanel;