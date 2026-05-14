import React, { useState } from 'react';

interface HeaderProps {
  onRadiusExtract?: (address: string, radius: number) => void;
  onHistoryClick?: () => void;
}

const Header: React.FC<HeaderProps> = ({ onRadiusExtract, onHistoryClick }) => {
  const [address, setAddress] = useState('');
  const [radius, setRadius] = useState(10);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (address.trim() && onRadiusExtract) {
      onRadiusExtract(address.trim(), radius);
    }
  };

  return (
    <header className="bg-white border-b px-6 py-4 flex flex-col lg:flex-row items-center justify-between z-10 shadow-sm shrink-0 gap-4">
      <div className="flex items-center gap-3 w-full lg:w-auto">
        <div className="bg-blue-600 p-2.5 rounded-xl shadow-lg shadow-blue-100 shrink-0">
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
        <div>
          <h1 className="text-xl font-black text-gray-900 tracking-tight leading-tight uppercase italic">LSA Radial</h1>
          <p className="text-[9px] text-blue-600 font-black uppercase tracking-[0.2em]">Targeting Suite</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 max-w-3xl w-full flex items-center gap-2 bg-gray-50 p-1.5 rounded-2xl border border-gray-100 shadow-inner focus-within:border-blue-200 transition-all">
        <div className="flex-1 flex items-center gap-3 px-3">
          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input 
            type="text" 
            placeholder="Enter business address, zip, or city..." 
            className="bg-transparent border-none focus:ring-0 text-sm w-full placeholder:text-gray-400 font-medium py-2"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </div>
        
        <div className="h-8 w-px bg-gray-200"></div>
        
        <div className="flex items-center gap-3 px-4 min-w-[120px]">
          <div className="flex flex-col">
            <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Radius</span>
            <div className="flex items-center gap-1">
              <input 
                type="number" 
                min="1" 
                max="100" 
                className="bg-transparent border-none focus:ring-0 text-sm w-10 font-black text-blue-600 p-0"
                value={radius}
                onChange={(e) => setRadius(parseInt(e.target.value) || 1)}
              />
              <span className="text-[10px] font-bold text-gray-400 uppercase">mi</span>
            </div>
          </div>
        </div>

        <button 
          type="submit"
          disabled={!address.trim()}
          className="bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-black px-8 py-3 rounded-xl transition-all shadow-lg shadow-blue-100 uppercase tracking-widest active:scale-95 shrink-0 disabled:opacity-40 disabled:pointer-events-none"
        >
          Extract Data
        </button>
      </form>
      
      <div className="hidden xl:flex items-center gap-4">
        <button 
          onClick={onHistoryClick}
          className="flex items-center gap-2 bg-white border border-gray-100 hover:border-gray-200 p-2 pr-4 rounded-xl shadow-sm transition-all group"
        >
          <div className="h-8 w-8 rounded-lg bg-gray-50 flex items-center justify-center text-gray-400 group-hover:text-blue-600 group-hover:bg-blue-50 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">History</span>
        </button>
        <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-black border-2 border-white shadow-sm text-xs">
          LSA
        </div>
      </div>
    </header>
  );
};

export default Header;
