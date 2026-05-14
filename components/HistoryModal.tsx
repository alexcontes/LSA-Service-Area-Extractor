import React, { useEffect, useState } from 'react';
import { collection, query, where, orderBy, onSnapshot, Timestamp } from 'firebase/firestore';
import { db, getTrackingContext } from '../lib/firebase';
import { motion, AnimatePresence } from 'motion/react';

interface HistoryItem {
  id: string;
  userId: string;
  accountId: string;
  timestamp: Timestamp;
  type: 'search' | 'push';
  areas: any[];
  campaignId?: string;
  resultCount?: number;
}

const HistoryModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'searches' | 'pushes'>('searches');
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { accountId } = getTrackingContext();
  const [selectedDetails, setSelectedDetails] = useState<any[] | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);
    const collectionName = activeTab === 'searches' ? 'history_searches' : 'history_pushes';
    const q = query(
      collection(db, collectionName),
      where('accountId', '==', accountId),
      orderBy('timestamp', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        type: activeTab === 'searches' ? 'search' : 'push'
      })) as HistoryItem[];
      setItems(data);
      setLoading(false);
    }, (error) => {
      console.error("Firestore error:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [isOpen, activeTab, accountId]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 sm:p-6">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />
          
          <motion.div 
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            className="relative bg-white w-full max-w-2xl h-[80vh] rounded-[40px] shadow-2xl flex flex-col overflow-hidden border border-gray-100"
          >
            {/* Header */}
            <div className="p-8 border-b border-gray-50 flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-2xl font-black text-gray-900 tracking-tight">Operation History</h2>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">Account ID: {accountId}</p>
              </div>
              <button 
                onClick={onClose}
                className="p-3 hover:bg-gray-100 rounded-2xl transition-colors text-gray-400"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Tabs */}
            <div className="flex px-8 gap-4 border-b border-gray-50 bg-gray-50/50 shrink-0">
              <button 
                onClick={() => setActiveTab('searches')}
                className={`py-6 px-4 text-xs font-black uppercase tracking-widest border-b-4 transition-all ${
                  activeTab === 'searches' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
              >
                Searches
              </button>
              <button 
                onClick={() => setActiveTab('pushes')}
                className={`py-6 px-4 text-xs font-black uppercase tracking-widest border-b-4 transition-all ${
                  activeTab === 'pushes' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
              >
                LSA Pushes
              </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-8 space-y-4">
              {loading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="w-10 h-10 border-4 border-blue-50 border-t-blue-600 rounded-full animate-spin"></div>
                </div>
              ) : items.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400">
                  <svg className="w-16 h-16 mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="font-bold uppercase tracking-widest text-[10px]">No history found</p>
                </div>
              ) : (
                items.map((item) => (
                  <div 
                    key={item.id}
                    className="p-6 rounded-3xl border border-gray-100 bg-white hover:border-blue-100 hover:shadow-lg transition-all group cursor-pointer"
                    onClick={() => setSelectedDetails(item.areas)}
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-xl ${activeTab === 'searches' ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-600'}`}>
                          {activeTab === 'searches' ? (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                          ) : (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-black text-gray-900">{item.userId}</p>
                          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                            {item.timestamp?.toDate().toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="bg-gray-50 px-3 py-1 rounded-full text-[9px] font-black text-gray-500 uppercase tracking-widest">
                        {item.areas.length} Areas
                      </div>
                    </div>
                    {activeTab === 'pushes' && (
                      <p className="text-[11px] font-bold text-gray-600 bg-gray-50 p-2 rounded-xl mt-2 truncate">
                        Target CAM: {item.campaignId}
                      </p>
                    )}
                    <div className="mt-4 flex items-center justify-between border-t border-gray-50 pt-4">
                      <span className="text-[10px] font-black uppercase tracking-widest text-blue-600">View Details</span>
                      <svg className="w-4 h-4 text-blue-600 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Details Overlay */}
            <AnimatePresence>
              {selectedDetails && (
                <motion.div 
                  initial={{ x: '100%' }}
                  animate={{ x: 0 }}
                  exit={{ x: '100%' }}
                  className="absolute inset-0 bg-white z-50 flex flex-col"
                >
                  <div className="p-8 border-b border-gray-50 flex items-center gap-4">
                    <button 
                      onClick={() => setSelectedDetails(null)}
                      className="p-3 hover:bg-gray-100 rounded-2xl transition-colors text-gray-900"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <div>
                      <h3 className="text-xl font-black text-gray-900 tracking-tight">Area Breakdown</h3>
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{selectedDetails.length} items found</p>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-8 space-y-2">
                    {selectedDetails.map((area: any, idx) => (
                      <div key={idx} className="flex items-center justify-between p-4 rounded-2xl bg-gray-50">
                        <div className="flex items-center gap-3">
                           <span className="text-xs font-black text-gray-900">{area.name}</span>
                           <span className="text-[9px] text-gray-400 font-bold uppercase">{area.stateCode}</span>
                        </div>
                        <span className="text-[9px] px-2 py-0.5 rounded-full bg-white border border-gray-200 text-gray-600 font-black uppercase shadow-xs shrink-0">
                          {area.type}
                        </span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default HistoryModal;
