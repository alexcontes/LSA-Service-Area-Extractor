import React, { useState, useMemo } from 'react';
import { ServiceArea } from './types';
import { logActivity, ActivityType } from './firebase';

interface DataPanelProps {
  areas: ServiceArea[];
  onToggleArea: (id: string) => void;
  onSelectAll: (select: boolean) => void;
  onClear?: () => void;
  incomeThreshold: number;
  setIncomeThreshold: (val: number) => void;
  showOnlyHighIncome: boolean;
  setShowOnlyHighIncome: (val: boolean) => void;
  totalCount: number;
  username: string;
  accountId: string;
}

interface ParsedLsaArea {
  name: string;
  type: string;
}

const DataPanel: React.FC<DataPanelProps> = ({ 
  areas, 
  onToggleArea, 
  onSelectAll,
  onClear,
  incomeThreshold,
  setIncomeThreshold,
  showOnlyHighIncome,
  setShowOnlyHighIncome,
  totalCount,
  username,
  accountId
 }) => {
  const selectedCount = areas.filter(a => a.isSelected).length;
  
  // Reconciler States
  const [isReconcilerOpen, setIsReconcilerOpen] = useState(false);
  const [currentLsaText, setCurrentLsaText] = useState('');

  // Parse pasted current LSA areas and calculate reconciliation additions/deletions
  const reconciliation = useMemo(() => {
    if (!currentLsaText.trim()) {
      return { parsed: [], toAdd: [], toRemove: [] };
    }

    const lines = currentLsaText.split(/[\n,;\t]+/);
    const parsed: ParsedLsaArea[] = [];
    
    lines.forEach(line => {
      let clean = line.trim();
      // Remove trailing X, x, or × copied from LSA chips (e.g. "Ashley X" or "Ashley ×")
      clean = clean.replace(/\s+[xX×]$/, '').trim();
      if (!clean || clean.toLowerCase() === 'x' || clean === '×') return;

      // Match item case-insensitive against full list of extracted areas to get exact type
      const matched = areas.find(a => a.name.toLowerCase() === clean.toLowerCase());
      if (matched) {
        parsed.push({ name: matched.name, type: matched.type });
      } else {
        const isZip = /^\d{5}$/.test(clean);
        const isCounty = clean.toLowerCase().includes('county');
        parsed.push({
          name: clean,
          type: isZip ? 'Zip Code' : (isCounty ? 'County' : 'City')
        });
      }
    });

    // Deduplicate parsed
    const seenParsed = new Set<string>();
    const uniqueParsed = parsed.filter(item => {
      const key = `${item.type}:${item.name.toLowerCase()}`;
      if (seenParsed.has(key)) return false;
      seenParsed.add(key);
      return true;
    });

    const selectedAreas = areas.filter(a => a.isSelected);

    // To Add: in selectedAreas but not in uniqueParsed
    const toAdd = selectedAreas.filter(sel => {
      return !uniqueParsed.some(p => p.name.toLowerCase() === sel.name.toLowerCase());
    });

    // To Remove: in uniqueParsed but not in selectedAreas
    const toRemove = uniqueParsed.filter(p => {
      return !selectedAreas.some(sel => sel.name.toLowerCase() === p.name.toLowerCase());
    });

    return {
      parsed: uniqueParsed,
      toAdd,
      toRemove
    };
  }, [currentLsaText, areas]);

  const exportCSV = () => {
    const selected = areas.filter(a => a.isSelected);
    if (selected.length === 0) return;

    // Log the push activity
    logActivity(ActivityType.PUSH, username, accountId, { 
      count: selected.length,
      areas: selected.map(a => ({ type: a.type, name: a.name }))
    });

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

  const exportReconciliationCSV = () => {
    const { toAdd, toRemove } = reconciliation;
    if (toAdd.length === 0 && toRemove.length === 0) return;

    // Log the push/reconciliation activity
    logActivity(ActivityType.PUSH, username, accountId, {
      reconciliation: true,
      addedCount: toAdd.length,
      removedCount: toRemove.length,
      added: toAdd.map(a => ({ type: a.type, name: a.name })),
      removed: toRemove.map(a => ({ type: a.type, name: a.name }))
    });

    let csvContent = "Action,Location Type,Location Name\n";
    
    // Add REMOVE actions first (cleaning up)
    toRemove.forEach(area => {
      csvContent += `REMOVE,${area.type},${area.name}\n`;
    });

    // Then ADD actions
    toAdd.forEach(area => {
      csvContent += `ADD,${area.type},${area.name}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `lsa_reconciliation_sync_acc_${accountId}.csv`;
    link.click();
  };

  const copyAsJSArray = () => {
    const selected = areas.filter(a => a.isSelected);
    if (selected.length === 0) return;
    const zips = selected.filter(a => a.type === 'Zip Code').map(z => z.name);
    const cities = selected.filter(a => a.type === 'City').map(c => `${c.name}, FL`);
    const output = `const serviceAreas = [\n  ${[...cities, ...zips].map(s => `"${s}"`).join(',\n  ')}\n];`;
    navigator.clipboard.writeText(output);
    alert('JS Array copied to clipboard!');
  };

  const clearAll = () => {
    if (onClear) {
      onClear();
    }
  };

  return (
    <div className="flex flex-col h-full">
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
                  <span className="text-sm font-black text-gray-900 truncate">{area.name}</span>
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

          {/* LSA Sync reconciler panel */}
          <div className="border border-gray-200 rounded-2xl p-3 bg-gray-50 space-y-2">
            <button 
              type="button"
              onClick={() => setIsReconcilerOpen(!isReconcilerOpen)}
              className="w-full flex items-center justify-between text-left"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-700">🔄 LSA Profile Auto-Cleaner</span>
                <span className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-black uppercase">Prune Old</span>
              </div>
              <svg 
                className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${isReconcilerOpen ? 'rotate-180' : ''}`} 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {isReconcilerOpen && (
              <div className="space-y-3 pt-2 border-t border-gray-200/60 transition-all">
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  Google LSA bulk uploads are **additive** and keep old outer-boundary areas. Paste your current active list below to automatically generate <strong>REMOVE</strong> rows alongside new <strong>ADD</strong> rows.
                </p>
                <textarea
                  value={currentLsaText}
                  onChange={(e) => setCurrentLsaText(e.target.value)}
                  placeholder="Paste current active areas (e.g. copied from LSA: '48411 X, Ashley X' or list separated by commas/newlines)"
                  className="w-full h-20 text-xs p-2 border border-gray-250 rounded-xl focus:ring-1 focus:ring-blue-500 hover:border-gray-300 outline-none font-mono"
                />
                
                {currentLsaText.trim() && (
                  <div className="bg-white p-2.5 rounded-xl border border-gray-200 space-y-1.5 text-xs">
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Sync Operations Preview</div>
                    <div className="flex items-center justify-between text-red-650 font-bold">
                      <span>❌ To Remove (Out-of-Target):</span>
                      <span className="font-mono bg-red-50 px-1.5 py-0.5 rounded">{reconciliation.toRemove.length} areas</span>
                    </div>
                    <div className="flex items-center justify-between text-green-650 font-bold">
                      <span>✅ To Add (New Target):</span>
                      <span className="font-mono bg-green-50 px-1.5 py-0.5 rounded">{reconciliation.toAdd.length} areas</span>
                    </div>
                    
                    {(reconciliation.toAdd.length > 0 || reconciliation.toRemove.length > 0) ? (
                      <button
                        type="button"
                        onClick={exportReconciliationCSV}
                        className="w-full mt-2 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl text-xs font-black hover:from-blue-700 hover:to-indigo-700 transition-all flex items-center justify-center gap-1.5"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M12 12m-9 0a9 9 0 1118 0 9 9 0 01-18 0z" />
                        </svg>
                        Export Reconciliation CSV
                      </button>
                    ) : (
                      <div className="text-[10px] text-gray-400 font-medium text-center py-1">Already synchronized perfectly!</div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <button 
              onClick={copyAsJSArray} 
              disabled={selectedCount === 0}
              className="w-full py-3 bg-gray-900 text-white rounded-2xl text-xs font-black hover:bg-black transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-gray-200 opacity-90"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Copy as JS Array
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