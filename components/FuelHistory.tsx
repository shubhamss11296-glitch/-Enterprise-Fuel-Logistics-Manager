
import React, { useState, useEffect } from 'react';
import { FuelService } from '../services/FuelService';
import { ExcelService } from '../services/ExcelService';
import { SampleDataService } from '../services/SampleDataService';
import { FuelTransaction, ReconciliationStatus, TripStatus, UserRole, FuelAllocation, Trip } from '../types';
import { Upload, CheckCircle2, Clock, DatabaseZap, Download, Link as LinkIcon, Trash2, X, AlertTriangle, Info, ChevronDown, ChevronUp, MapPin } from 'lucide-react';
import BulkUploadModal from './BulkUploadModal';
import { AuthService } from '../services/AuthService';
import { db } from '../db';

interface FuelHistoryProps {
  preFilter?: TripStatus | 'ALL';
}

interface DeleteState {
  txn: FuelTransaction;
  allocations: (FuelAllocation & { tripDetails?: Trip })[];
}

interface EnrichedTransaction extends FuelTransaction {
  allocations: (FuelAllocation & { tripDetails?: Trip })[];
  isExpanded?: boolean;
}

const FuelHistory: React.FC<FuelHistoryProps> = ({ preFilter }) => {
  const [user] = useState(AuthService.getCurrentUser());
  const [txns, setTxns] = useState<EnrichedTransaction[]>([]);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteContext, setDeleteContext] = useState<DeleteState | null>(null);

  const isAdmin = user?.role === UserRole.ADMIN;

  const loadTxns = async () => {
    try {
      setIsLoading(true);
      const data = await FuelService.getAllTransactions();
      const allAllocs = await db.getAll<FuelAllocation>('fuel_allocations');
      const allTrips = await db.getAll<Trip>('trips');

      const enriched = data.map(txn => {
        const txnAllocs = allAllocs
          .filter(a => a.txnId === txn.txnId)
          .map(a => ({
            ...a,
            tripDetails: allTrips.find(t => t.tripId === a.tripId)
          }));
        
        const totalUsed = txnAllocs.reduce((sum, a) => sum + a.allocatedVolume, 0);
        const available = Math.max(0, Math.round((txn.volume - totalUsed) * 100) / 100);

        return { 
          ...txn, 
          availableVolume: available,
          allocations: txnAllocs, 
          isExpanded: false 
        };
      });

      setTxns(enriched || []);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadTxns(); }, []);

  const handleDownloadTemplate = () => {
    ExcelService.downloadTemplate('fuel');
  };

  const handleSeedData = async () => {
    if (!confirm("This will populate the system with testing data. Continue?")) return;
    setIsSeeding(true);
    await SampleDataService.seed();
    await loadTxns();
    setIsSeeding(false);
    alert("Enterprise Demo Data loaded and reconciled.");
  };

  const toggleExpand = (txnId: string) => {
    setTxns(prev => prev.map(t => t.txnId === txnId ? { ...t, isExpanded: !t.isExpanded } : t));
  };

  const initiateDelete = async (txn: FuelTransaction) => {
    if (!isAdmin) return alert("Restricted: Admin access required to delete ledger records.");
    
    const allocs = await db.getByIndex<FuelAllocation>('fuel_allocations', 'txnId', txn.txnId);
    
    const enrichedAllocs = await Promise.all(allocs.map(async (a) => {
      const trip = await db.getById<Trip>('trips', a.tripId);
      return { ...a, tripDetails: trip };
    }));

    setDeleteContext({
      txn,
      allocations: enrichedAllocs
    });
  };

  const confirmDelete = async () => {
    if (!deleteContext || !isAdmin) return;
    
    try {
      if (deleteContext.allocations.length === 0) {
        await FuelService.deleteTransaction(deleteContext.txn.txnId, user?.username || 'Admin');
      } else {
        await FuelService.deleteTransactionWithAllocations(deleteContext.txn.txnId, user?.username || 'Admin');
      }
      setDeleteContext(null);
      await loadTxns();
    } catch (e: any) {
      alert(e.message);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-400">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500 mb-4"></div>
        <p className="text-sm font-black uppercase tracking-widest text-center">Fetching Transaction Ledger...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 rounded-3xl p-8 text-white flex flex-col md:flex-row justify-between items-center shadow-2xl shadow-slate-900/40 gap-6">
        <div>
          <h2 className="text-3xl font-black mb-2 uppercase tracking-tight">Fuel Transaction Ledger</h2>
          <p className="text-slate-400 text-sm font-medium">CCMS / Fuel Statement reconciliation with trip manifests</p>
        </div>
        <div className="flex flex-wrap gap-3">
          {isAdmin && (
            <button 
              onClick={handleSeedData}
              disabled={isSeeding}
              className="px-6 py-3 bg-emerald-600/20 border border-emerald-600/50 text-emerald-400 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-emerald-600/30 transition-all flex items-center gap-2"
            >
              <DatabaseZap size={16} /> {isSeeding ? 'Seeding...' : 'Load Sample Data'}
            </button>
          )}
          <button 
            onClick={handleDownloadTemplate}
            className="px-6 py-3 border border-slate-700 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center gap-2"
          >
            <Download size={16} /> Template
          </button>
          <button 
            onClick={() => setShowBulkModal(true)}
            className="px-8 py-3 bg-blue-600 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-blue-700 transition-all flex items-center gap-2 shadow-lg shadow-blue-500/20"
          >
            <Upload size={16} /> Upload XLSX
          </button>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
          <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">Transaction Audit Matrix (Horizontal Scroll Active)</h3>
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{txns.length} records processed</span>
        </div>
        <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-slate-300">
          <table className="w-full text-left whitespace-nowrap border-collapse table-fixed" style={{ minWidth: '3500px' }}>
            <thead className="bg-slate-50 text-[9px] text-slate-500 uppercase font-black tracking-widest border-b border-slate-100">
              <tr>
                <th className="px-4 py-4 w-40">Txn ID</th>
                <th className="px-4 py-4 w-32">Terminal ID</th>
                <th className="px-4 py-4 w-32">Merchant ID</th>
                <th className="px-4 py-4 w-32">BatchID / ROC</th>
                <th className="px-4 py-4 w-48">Retail Outlet Name</th>
                <th className="px-4 py-4 w-64">Retail Outlet Address</th>
                <th className="px-4 py-4 w-48">Retail Outlet Location</th>
                <th className="px-4 py-4 w-32">Retail Outlet City</th>
                <th className="px-4 py-4 w-32">Retail Outlet District</th>
                <th className="px-4 py-4 w-32">Retail Outlet State</th>
                <th className="px-4 py-4 w-28">Retail Outlet PIN Code</th>
                <th className="px-4 py-4 w-32">Retail Outlet PAN</th>
                <th className="px-4 py-4 w-28">Credit/Debit</th>
                <th className="px-4 py-4 w-40">Account Number</th>
                <th className="px-4 py-4 w-32">Mobile No.</th>
                <th className="px-4 py-4 w-32">Vehicle No.</th>
                <th className="px-4 py-4 w-48">Txn Date and Time</th>
                <th className="px-4 py-4 w-32">Txn Date</th>
                <th className="px-4 py-4 w-32">Txn Type</th>
                <th className="px-4 py-4 w-28">Source</th>
                <th className="px-4 py-4 w-24">Product</th>
                <th className="px-4 py-4 w-32">Product per Ltr</th>
                <th className="px-4 py-4 w-32">Volume (Ltr.)</th>
                <th className="px-4 py-4 w-32">Service Charge</th>
                <th className="px-4 py-4 w-32">Amount</th>
                <th className="px-4 py-4 w-28">Discount</th>
                <th className="px-4 py-4 w-32">Odometer Reading</th>
                <th className="px-4 py-4 w-32">Closing Balance</th>
                <th className="px-4 py-4 w-32">Status</th>
                <th className="px-4 py-4 w-64">Linked Trips / Manifests</th>
                <th className="px-4 py-4 w-24 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-[10px] font-bold text-slate-700">
              {txns.length === 0 ? (
                <tr>
                  <td colSpan={31} className="py-20 text-center text-slate-400 font-bold italic uppercase tracking-widest">
                    No physical transaction data found.
                  </td>
                </tr>
              ) : txns.sort((a,b) => b.createdAt - a.createdAt).map((txn) => (
                <React.Fragment key={txn.txnId}>
                  <tr className={`hover:bg-slate-50/80 transition-all group ${txn.isExpanded ? 'bg-slate-50' : ''}`}>
                    <td className="px-4 py-4 font-black truncate">{txn.txnId}</td>
                    <td className="px-4 py-4 text-slate-400 truncate">{txn.terminalId || '-'}</td>
                    <td className="px-4 py-4 text-slate-400 truncate">{txn.merchantId || '-'}</td>
                    <td className="px-4 py-4 text-slate-400 truncate">{txn.batchId || '-'}</td>
                    <td className="px-4 py-4 font-black truncate">{txn.outletName}</td>
                    <td className="px-4 py-4 text-slate-400 truncate">{txn.outletAddress || '-'}</td>
                    <td className="px-4 py-4 text-slate-400 truncate">{txn.outletLocation}</td>
                    <td className="px-4 py-4 text-slate-400 truncate">{txn.outletCity || '-'}</td>
                    <td className="px-4 py-4 text-slate-400 truncate">{txn.outletDistrict || '-'}</td>
                    <td className="px-4 py-4 font-black truncate">{txn.state}</td>
                    <td className="px-4 py-4 text-slate-400 truncate">{txn.outletPin || '-'}</td>
                    <td className="px-4 py-4 text-slate-400 truncate font-mono">{txn.outletPan || '-'}</td>
                    <td className="px-4 py-4 truncate uppercase text-[8px] font-black">{txn.paymentMode || '-'}</td>
                    <td className="px-4 py-4 text-slate-400 truncate">{txn.accountNumber || '-'}</td>
                    <td className="px-4 py-4 text-slate-400 truncate">{txn.mobileNumber || '-'}</td>
                    <td className="px-4 py-4 font-black text-blue-600">{txn.vehicleNumber}</td>
                    <td className="px-4 py-4 text-slate-500 font-mono">{txn.txnDateTime}</td>
                    <td className="px-4 py-4 text-slate-500 font-mono">{txn.txnDateTime.split('T')[0]}</td>
                    <td className="px-4 py-4 text-slate-400 truncate uppercase text-[8px]">{txn.txnType || '-'}</td>
                    <td className="px-4 py-4 text-slate-400 truncate uppercase text-[8px] font-black">{txn.source || '-'}</td>
                    <td className="px-4 py-4 font-black text-slate-400">{txn.product}</td>
                    <td className="px-4 py-4 font-black">{txn.pricePerLiter.toFixed(2)}</td>
                    <td className="px-4 py-4 font-black text-blue-600">{txn.volume.toLocaleString()} L</td>
                    <td className="px-4 py-4 text-slate-400">{txn.serviceCharge?.toFixed(2) || '0.00'}</td>
                    <td className="px-4 py-4 font-black text-emerald-600">₹ {txn.amount.toLocaleString()}</td>
                    <td className="px-4 py-4 text-slate-400">{txn.discount?.toFixed(2) || '0.00'}</td>
                    <td className="px-4 py-4 font-mono text-slate-500">{txn.odometer.toLocaleString()}</td>
                    <td className="px-4 py-4 text-slate-400">{txn.closingBalance?.toLocaleString() || '-'}</td>
                    <td className="px-4 py-4">
                      <span className={`px-2 py-0.5 rounded text-[7px] font-black border uppercase flex items-center gap-1 w-fit ${
                        txn.reconciliationStatus === ReconciliationStatus.MATCHED ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                        txn.reconciliationStatus === ReconciliationStatus.PARTIAL ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-slate-50 text-slate-400 border-slate-200'
                      }`}>
                        {txn.reconciliationStatus === ReconciliationStatus.MATCHED ? <CheckCircle2 size={8}/> : <Clock size={8}/>}
                        {txn.reconciliationStatus}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      {txn.allocations.length > 0 ? (
                        <button 
                          onClick={() => toggleExpand(txn.txnId)}
                          className="flex items-center gap-2 text-[8px] font-black text-blue-600 uppercase hover:text-blue-800 transition-colors text-left"
                        >
                          <LinkIcon size={10} className="shrink-0" />
                          <span className="truncate max-w-[150px]">
                            {txn.allocations.length === 1 
                              ? `${txn.allocations[0].tripDetails?.tripNo || 'Unknown'}` 
                              : `Mapped to ${txn.allocations.length} Trips`}
                          </span>
                          {txn.isExpanded ? <ChevronUp size={10}/> : <ChevronDown size={10}/>}
                        </button>
                      ) : (
                        <span className="text-slate-300 font-black tracking-widest">-</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-right">
                      {isAdmin && (
                        <button 
                          onClick={() => initiateDelete(txn)}
                          className="p-1.5 rounded-lg transition-all text-slate-300 hover:text-red-500 hover:bg-red-50"
                          title="Purge Transaction"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </td>
                  </tr>
                  {txn.isExpanded && (
                    <tr className="bg-slate-50/30">
                      <td colSpan={31} className="px-4 py-0">
                        <div className="my-2 border border-slate-200 rounded-2xl bg-white shadow-sm overflow-hidden animate-in slide-in-from-top-2 duration-200 max-w-2xl">
                          <div className="px-6 py-2 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                            <h4 className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Active Manifest Mappings</h4>
                            <span className="text-[8px] font-black text-blue-600 uppercase tracking-widest">Allocated: {(txn.volume - txn.availableVolume).toFixed(1)}L</span>
                          </div>
                          <table className="w-full text-left">
                            <thead className="text-[7px] text-slate-400 font-black uppercase tracking-widest border-b border-slate-50 bg-slate-50/20">
                              <tr>
                                <th className="px-6 py-2">Trip Number</th>
                                <th className="px-6 py-2">Trip Date</th>
                                <th className="px-6 py-2 text-right">Allocated Vol (L)</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50 text-[9px] font-bold text-slate-600">
                              {txn.allocations.map(a => (
                                <tr key={a.allocationId} className="hover:bg-blue-50/30 transition-colors">
                                  <td className="px-6 py-2 text-blue-600 uppercase tracking-tight">{a.tripDetails?.tripNo || 'Unknown'}</td>
                                  <td className="px-6 py-2 font-mono">{a.tripDetails?.tripDate || 'N/A'}</td>
                                  <td className="px-6 py-2 text-right text-slate-900 font-black">{a.allocatedVolume.toLocaleString()}L</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {deleteContext && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[110] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 flex flex-col">
            <div className="p-8 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <div>
                <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Confirm Purge</h3>
                <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mt-1">Ref ID: {deleteContext.txn.txnId}</p>
              </div>
              <button onClick={() => setDeleteContext(null)} className="p-2 hover:bg-white rounded-full transition-all">
                <X size={24} className="text-slate-400" />
              </button>
            </div>
            
            <div className="p-8 space-y-6">
              {deleteContext.allocations.length === 0 ? (
                <div className="text-center py-6">
                  <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-inner">
                    <Info size={32} />
                  </div>
                  <p className="text-slate-600 font-black uppercase tracking-tight">Transaction is unlinked.</p>
                  <p className="text-slate-400 text-xs mt-1 font-bold uppercase tracking-widest leading-relaxed text-center">This record is not mapped to any trip manifest.<br/>Remove permanently from the ledger?</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-amber-50 border border-amber-100 p-5 rounded-[2rem] flex gap-5 items-start">
                    <div className="p-2 bg-amber-100 text-amber-600 rounded-xl shadow-sm">
                      <AlertTriangle size={24} />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-amber-900 uppercase tracking-tight">Active Links Detected</h4>
                      <p className="text-[11px] text-amber-700 font-bold leading-relaxed mt-1 uppercase tracking-tight">
                        Deleting this transaction will force-unlink it from the following manifests.<br/>
                        Trip balances will be adjusted to "Pending" or "In-Transit".
                      </p>
                    </div>
                  </div>
                  
                  <div className="border border-slate-100 rounded-[2rem] overflow-hidden shadow-sm">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50 text-[9px] text-slate-400 font-black uppercase tracking-widest border-b border-slate-100">
                        <tr>
                          <th className="px-6 py-4">Manifest No</th>
                          <th className="px-6 py-4">Unit ID</th>
                          <th className="px-6 py-4 text-right">Usage (L)</th>
                          <th className="px-6 py-4 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 text-[10px] font-black text-slate-600">
                        {deleteContext.allocations.map(a => (
                          <tr key={a.allocationId}>
                            <td className="px-6 py-4 text-blue-600 uppercase tracking-tight">{a.tripDetails?.tripNo || 'N/A'}</td>
                            <td className="px-6 py-4 tracking-tighter">{a.tripDetails?.vehicleNumber || 'N/A'}</td>
                            <td className="px-6 py-4 text-right">{a.allocatedVolume.toLocaleString()}L</td>
                            <td className="px-6 py-4 text-center">
                              <span className={`px-2 py-0.5 rounded-lg text-[8px] font-black uppercase border ${
                                a.tripDetails?.status === TripStatus.CLOSED ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-blue-50 text-blue-700 border-blue-100'
                              }`}>
                                {a.tripDetails?.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="p-8 border-t border-slate-50 bg-slate-50/50 flex gap-4">
              <button 
                onClick={() => setDeleteContext(null)}
                className="flex-1 py-4 font-black text-slate-500 bg-white border border-slate-200 rounded-2xl hover:bg-slate-50 transition-all uppercase tracking-widest text-xs shadow-sm"
              >
                Abort
              </button>
              <button 
                onClick={confirmDelete}
                className="flex-1 py-4 font-black text-white bg-red-600 rounded-2xl shadow-xl shadow-red-500/20 hover:bg-red-700 transition-all uppercase tracking-widest text-xs"
              >
                {deleteContext.allocations.length > 0 ? 'Force Unlink & Purge' : 'Purge Record'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showBulkModal && (
        <BulkUploadModal 
          type="fuel"
          onClose={() => setShowBulkModal(false)}
          onSuccess={loadTxns}
          saveService={async (data) => {
            await FuelService.uploadTransactions(data);
          }}
        />
      )}
    </div>
  );
};

export default FuelHistory;
