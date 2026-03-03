
import React, { useState, useEffect } from 'react';
import { FuelService } from '../services/FuelService';
import { ExcelService } from '../services/ExcelService';
import { SampleDataService } from '../services/SampleDataService';
import { FuelTransaction, ReconciliationStatus, TripStatus, UserRole, FuelAllocation, Trip } from '../types';
import { Upload, CheckCircle2, Clock, DatabaseZap, Download, Link as LinkIcon, Trash2, X, AlertTriangle, Info, ChevronDown, ChevronUp } from 'lucide-react';
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

const FuelHistory: React.FC<FuelHistoryProps> = () => {
  const [user] = useState(AuthService.getCurrentUser());
  const [txns, setTxns] = useState<EnrichedTransaction[]>([]);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteContext, setDeleteContext] = useState<DeleteState | null>(null);

  // ✅ FINAL ROLE CONTROL
  const canDelete =
    user?.role === UserRole.ADMIN ||
    user?.role === UserRole.SUPER_ADMIN;

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
    setTxns(prev => prev.map(t =>
      t.txnId === txnId ? { ...t, isExpanded: !t.isExpanded } : t
    ));
  };

  // ✅ FIXED DELETE INIT
  const initiateDelete = async (txn: FuelTransaction) => {
    if (!canDelete) return alert("Access Restricted");

    const allocs = await db.getByIndex<FuelAllocation>('fuel_allocations', 'txnId', txn.txnId);

    const enrichedAllocs = await Promise.all(
      allocs.map(async (a) => {
        const trip = await db.getById<Trip>('trips', a.tripId);
        return { ...a, tripDetails: trip };
      })
    );

    setDeleteContext({
      txn,
      allocations: enrichedAllocs
    });
  };

  // ✅ FIXED CONFIRM DELETE
  const confirmDelete = async () => {
    if (!deleteContext || !canDelete) return;

    try {
      if (deleteContext.allocations.length === 0) {
        await FuelService.deleteTransaction(
          deleteContext.txn.txnId,
          user?.username || 'Admin'
        );
      } else {
        await FuelService.deleteTransactionWithAllocations(
          deleteContext.txn.txnId,
          user?.username || 'Admin'
        );
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
        <p className="text-sm font-black uppercase tracking-widest text-center">
          Fetching Transaction Ledger...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* HEADER */}
      <div className="bg-slate-900 rounded-3xl p-8 text-white flex justify-between items-center shadow-2xl">
        <div>
          <h2 className="text-3xl font-black">Fuel Transaction Ledger</h2>
          <p className="text-slate-400 text-sm">CCMS / Fuel Statement reconciliation</p>
        </div>

        <div className="flex gap-3">
          {canDelete && (
            <button
              onClick={handleSeedData}
              disabled={isSeeding}
              className="px-6 py-3 bg-emerald-600/20 border border-emerald-600/50 text-emerald-400 rounded-2xl text-xs font-black uppercase"
            >
              <DatabaseZap size={16} /> {isSeeding ? 'Seeding...' : 'Load Sample Data'}
            </button>
          )}

          <button
            onClick={handleDownloadTemplate}
            className="px-6 py-3 border border-slate-700 rounded-2xl text-xs font-black uppercase"
          >
            <Download size={16} /> Template
          </button>

          <button
            onClick={() => setShowBulkModal(true)}
            className="px-8 py-3 bg-blue-600 rounded-2xl text-xs font-black uppercase"
          >
            <Upload size={16} /> Upload XLSX
          </button>
        </div>
      </div>

      {/* TABLE */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left whitespace-nowrap table-fixed" style={{ minWidth: '2000px' }}>
            <thead className="bg-slate-50 text-xs uppercase font-black">
              <tr>
                <th className="px-4 py-3">Txn ID</th>
                <th className="px-4 py-3">Vehicle</th>
                <th className="px-4 py-3">State</th>
                <th className="px-4 py-3">Volume</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>

            <tbody>
              {txns.map(txn => (
                <tr key={txn.txnId} className="border-t">
                  <td className="px-4 py-3">{txn.txnId}</td>
                  <td className="px-4 py-3">{txn.vehicleNumber}</td>
                  <td className="px-4 py-3">{txn.state}</td>
                  <td className="px-4 py-3">{txn.volume} L</td>
                  <td className="px-4 py-3">₹ {txn.amount}</td>
                  <td className="px-4 py-3 text-right">
                    {canDelete && (
                      <button
                        onClick={() => initiateDelete(txn)}
                        className="text-red-500"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* DELETE MODAL */}
      {deleteContext && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center">
          <div className="bg-white p-8 rounded-2xl w-96">
            <h3 className="text-lg font-bold mb-4">Confirm Delete</h3>
            <p className="text-sm mb-6">
              Are you sure you want to delete Txn ID: {deleteContext.txn.txnId} ?
            </p>

            <div className="flex gap-4">
              <button
                onClick={() => setDeleteContext(null)}
                className="flex-1 border rounded-xl py-2"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 bg-red-600 text-white rounded-xl py-2"
              >
                Delete
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
