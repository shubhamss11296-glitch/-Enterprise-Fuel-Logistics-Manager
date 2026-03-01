
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { TripService } from '../services/TripService';
import { ExcelService } from '../services/ExcelService';
import { Trip, Vehicle, TripStatus, FuelAllocation, FuelTransaction, AllocationType, UserRole, ReconciliationStatus, TripRevision, TripAttachment } from '../types';
import { Plus, Download, RotateCw, Upload, CheckCircle, ShieldCheck, Search, X, Trash2, FileText, MapPin, ExternalLink, Info, PlusCircle, Check, History, Paperclip, Edit3, File, Eye } from 'lucide-react';
import { db } from '../db';
import BulkUploadModal from './BulkUploadModal';
import { ReconciliationEngine } from '../services/ReconciliationEngine';
import { AuthService } from '../services/AuthService';

interface TripLogProps {
  preFilter?: TripStatus | 'ALL';
}

interface AllocationDisplay extends FuelAllocation {
  txnDate?: string;
  txnOutlet?: string;
}

const TripLog: React.FC<TripLogProps> = ({ preFilter }) => {
  const [user] = useState(AuthService.getCurrentUser());
  const [trips, setTrips] = useState<Trip[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showDrillDown, setShowDrillDown] = useState<Trip | null>(null);
  const [drillAllocations, setDrillAllocations] = useState<AllocationDisplay[]>([]);
  const [drillAttachments, setDrillAttachments] = useState<TripAttachment[]>([]);
  const [availableTxns, setAvailableTxns] = useState<FuelTransaction[]>([]);
  const [reviseMode, setReviseMode] = useState(false);
  const [activeTripId, setActiveTripId] = useState<string | null>(null);
  const [vehicleSearch, setVehicleSearch] = useState('');
  const [globalSearch, setGlobalSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | TripStatus>('ALL');
  const [isLoading, setIsLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState<any>({
    vehicleNumber: '',
    tripDate: new Date().toISOString().split('T')[0],
    origin: '',
    destination: '',
    loadKM: '',
    emptyKM: '',
    reposition: 'NO',
    repositionLocation: '',
    repositionKM: '',
    driverName: '',
    driverContact: '',
    docUrl: '',
    docName: '',
    file: null
  });

  // Fix: UserRole.VIEW_ONLY does not exist, using UserRole.VIEWER instead
  const canEdit = user?.role !== UserRole.VIEWER;
  const isAdmin = user?.role === UserRole.ADMIN;

  useEffect(() => {
    if (preFilter) setStatusFilter(preFilter);
  }, [preFilter]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [tripsData, vList] = await Promise.all([
        TripService.getAllTrips(),
        db.getAll<Vehicle>('vehicles')
      ]);

      const filteredTrips = (user?.role === UserRole.ADMIN || !user?.assignedVehicles || user.assignedVehicles.length === 0)
        ? tripsData
        : tripsData.filter(t => user.assignedVehicles?.includes(t.vehicleNumber));

      setTrips(filteredTrips || []);
      setVehicles(vList ? vList.filter(v => v.status === 'ACTIVE') : []);
    } catch (error) {
      console.error("Failed to load data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const openDrillDown = async (trip: Trip) => {
    await ReconciliationEngine.reconcileTrip(trip.tripId);
    const refreshedTrip = await db.getById<Trip>('trips', trip.tripId);
    if (!refreshedTrip) return;

    const allocs = await db.getByIndex<FuelAllocation>('fuel_allocations', 'tripId', refreshedTrip.tripId);
    const allTxns = await db.getAll<FuelTransaction>('fuel_transactions');
    const attachments = await db.getByIndex<TripAttachment>('trip_attachments', 'tripId', refreshedTrip.tripId);
    
    const enrichedAllocs: AllocationDisplay[] = allocs.map(a => {
      const txn = allTxns.find(t => t.txnId === a.txnId);
      return {
        ...a,
        txnDate: txn ? txn.txnDateTime : undefined,
        txnOutlet: txn ? txn.outletName : (a.txnId === 'MANUAL_ENTRY' ? 'Adjustment' : a.txnId)
      };
    });

    const vTxns = allTxns.filter(t => t.vehicleNumber === refreshedTrip.vehicleNumber && t.reconciliationStatus !== ReconciliationStatus.MATCHED);
    
    setDrillAllocations(enrichedAllocs);
    setDrillAttachments(attachments || []);
    setAvailableTxns(vTxns);
    setShowDrillDown(refreshedTrip);
  };

  const handleManualLink = async (txnId: string) => {
    if (!canEdit) return alert('Restricted: View Only Access');
    if (!showDrillDown) return;
    const volumeStr = prompt("Enter volume to link manually (Liters):");
    if (volumeStr === null) return;
    const vol = parseFloat(volumeStr);
    if (isNaN(vol) || vol <= 0) return alert("Invalid volume.");
    const reason = prompt("Enter reason for manual override:");
    if (!reason) return alert("Reason is required.");
    try {
      await ReconciliationEngine.manualLink(showDrillDown.tripId, txnId, vol, reason);
      const updatedTrip = await db.getById<Trip>('trips', showDrillDown.tripId);
      if (updatedTrip) await openDrillDown(updatedTrip);
      await loadData();
    } catch (e: any) { alert(e.message); }
  };

  const handleGenericAdjustment = async () => {
    if (!canEdit) return alert('Restricted: View Only Access');
    if (!showDrillDown) return;
    const volumeStr = prompt("Enter manual adjustment volume (Liters):");
    if (volumeStr === null) return;
    const vol = parseFloat(volumeStr);
    if (isNaN(vol)) return;
    const reason = prompt("Enter adjustment reason:");
    if (!reason) return;
    try {
      await ReconciliationEngine.addAdjustment(showDrillDown.tripId, vol, reason);
      const updatedTrip = await db.getById<Trip>('trips', showDrillDown.tripId);
      if (updatedTrip) await openDrillDown(updatedTrip);
      await loadData();
    } catch (e: any) { alert(e.message); }
  };

  const handleRemoveLink = async (allocId: string) => {
    if (!isAdmin) return alert('Restricted: Admin required for ledger modification');
    if (!showDrillDown) return;
    if (showDrillDown.status !== TripStatus.CLOSED) {
      return alert("Trip must be CLOSED to modify allocations (Rule: Restricted controlled removal)");
    }
    if (!confirm("Remove this ledger entry? Transaction volume will be restored to pool.")) return;
    try {
      await ReconciliationEngine.removeAllocation(allocId, user?.username || 'Admin');
      const updatedTrip = await db.getById<Trip>('trips', showDrillDown.tripId);
      if (updatedTrip) await openDrillDown(updatedTrip);
      await loadData();
    } catch (e: any) { alert(e.message); }
  };

  const handleConfirmClose = async (trip: Trip) => {
    if (!canEdit) return alert('Restricted: Edit access required');
    const balance = trip.balanceFuel;
    if (Math.abs(balance) > 3) { // Threshold updated to 3L
      alert(`Closing blocked: Current variance (${balance}L) exceeds allowable tolerance of 3L.`);
      return;
    }
    if (!confirm(`Settle remaining variance of ${balance}L and close manifest ${trip.tripNo}?`)) return;
    try {
      await ReconciliationEngine.settleVariance(trip.tripId);
      await loadData();
    } catch (err: any) { alert(err.message); }
  };

  const handleClose = () => {
    setShowModal(false);
    setReviseMode(false);
    setActiveTripId(null);
    setVehicleSearch('');
    setFormData({
      vehicleNumber: '',
      tripDate: new Date().toISOString().split('T')[0],
      origin: '',
      destination: '',
      loadKM: '',
      emptyKM: '',
      reposition: 'NO',
      repositionLocation: '',
      repositionKM: '',
      driverName: '',
      driverContact: '',
      docUrl: '',
      docName: '',
      file: null
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (reviseMode && activeTripId) {
        await TripService.reviseTrip(activeTripId, formData);
      } else {
        await TripService.createTrip(formData);
      }
      handleClose();
      await loadData();
    } catch (err: any) { alert(err.message); }
  };

  const handleRevise = (trip: Trip) => {
    if (!canEdit) return;
    setReviseMode(true);
    setActiveTripId(trip.tripId);
    setVehicleSearch(trip.vehicleNumber);
    setFormData({
      vehicleNumber: trip.vehicleNumber,
      tripDate: trip.tripDate,
      origin: trip.origin,
      destination: trip.destination,
      loadKM: trip.loadKM.toString(),
      emptyKM: trip.emptyKM.toString(),
      reposition: trip.reposition,
      repositionLocation: trip.repositionLocation || '',
      repositionKM: trip.repositionKM?.toString() || '',
      driverName: trip.driverName || '',
      driverContact: trip.driverContact || '',
      docUrl: trip.docUrl || '',
      docName: trip.docName || '',
      file: null
    });
    setShowModal(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.size > 10 * 1024 * 1024) {
        alert("File size exceeds 10MB limit.");
        return;
      }
      setFormData({ ...formData, file: selectedFile, docName: selectedFile.name });
    }
  };

  const handleReconcileManually = async (tripId: string) => {
    try {
      await ReconciliationEngine.reconcileTrip(tripId);
      await loadData();
    } catch (err: any) { alert(err.message); }
  };

  const handleForceClose = async (tripId: string) => {
    if (!isAdmin) return alert('Restricted: Admin settlement required');
    if (!confirm("Force close this manifest?")) return;
    try {
      await TripService.forceCloseTrip(tripId);
      await loadData();
    } catch (err: any) { alert(err.message); }
  };

  const handleSoftDelete = async (tripId: string) => {
    if (!isAdmin) return alert('Restricted: Admin required for deletion');
    if (!confirm("Soft delete this manifest?")) return;
    try {
      await TripService.softDeleteTrip(tripId);
      await loadData();
    } catch (err: any) { alert(err.message); }
  };

  const downloadAttachment = (attachment: TripAttachment) => {
    const url = URL.createObjectURL(attachment.fileData as Blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = attachment.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const viewAttachment = (attachment: TripAttachment) => {
    const url = URL.createObjectURL(attachment.fileData as Blob);
    window.open(url, '_blank');
  };

  const filteredTrips = useMemo(() => {
    if (!Array.isArray(trips)) return [];
    let list = trips;
    if (statusFilter !== 'ALL') { list = list.filter(t => t.status === statusFilter); }
    if (globalSearch) {
      const s = globalSearch.toLowerCase();
      list = list.filter(t => t.tripNo.toLowerCase().includes(s) || t.vehicleNumber.toLowerCase().includes(s) || t.origin.toLowerCase().includes(s) || t.destination.toLowerCase().includes(s));
    }
    return list;
  }, [trips, statusFilter, globalSearch]);

  const filteredVehicles = useMemo(() => {
    if (!vehicleSearch) return [];
    return vehicles.filter(v => v.vehicleNumber.toLowerCase().includes(vehicleSearch.toLowerCase()));
  }, [vehicles, vehicleSearch]);

  const getStatusStyle = (trip: Trip) => {
    if (trip.auditClose) return 'bg-slate-900 text-white border-slate-900';
    switch (trip.status) {
      case TripStatus.IN_TRANSIT: return 'bg-blue-50 text-blue-600 border-blue-100';
      case TripStatus.PENDING_FOR_CLOSING: return 'bg-amber-100 text-amber-700 border-amber-200';
      case TripStatus.CLOSED: return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case TripStatus.EXCESS: return 'bg-indigo-600 text-white border-indigo-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex gap-4 items-center flex-1">
          <div className="flex bg-white rounded-xl border border-slate-200 p-1">
            {['ALL', TripStatus.IN_TRANSIT, TripStatus.PENDING_FOR_CLOSING, TripStatus.CLOSED].map((s) => (
              <button key={s} onClick={() => setStatusFilter(s as any)} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${statusFilter === s ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}>{s.replace(/_/g, ' ')}</button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input type="text" placeholder="Search Trip No, Vehicle..." value={globalSearch} onChange={e => setGlobalSearch(e.target.value)} className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:ring-4 focus:ring-blue-500/10 font-bold w-64" />
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={() => ExcelService.downloadTemplate('trip')} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-bold shadow-sm hover:bg-slate-50"><Download size={18} /> Template</button>
          {canEdit && (
            <>
              <button onClick={() => setShowBulkModal(true)} className="flex items-center gap-2 px-4 py-2 bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-sm font-bold hover:bg-slate-200 transition-colors shadow-sm"><Upload size={18} /> Bulk Upload</button>
              <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-black hover:bg-blue-700 transition-all shadow-xl shadow-blue-900/20"><Plus size={18} /> New Trip Entry</button>
            </>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-slate-300">
          <table className="w-full text-left whitespace-nowrap border-separate border-spacing-0">
            <thead className="bg-slate-900 text-[9px] text-slate-400 uppercase font-black tracking-widest sticky top-0 z-[5]">
              <tr>
                <th className="px-5 py-3.5 border-b border-slate-800">Trip No</th>
                <th className="px-5 py-3.5 border-b border-slate-800">Vehicle</th>
                <th className="px-5 py-3.5 border-b border-slate-800">Trip Date</th>
                <th className="px-5 py-3.5 border-b border-slate-800">Origin</th>
                <th className="px-5 py-3.5 border-b border-slate-800">Destination</th>
                <th className="px-5 py-3.5 border-b border-slate-800">Reposition</th>
                <th className="px-5 py-3.5 text-center border-b border-slate-800">KM</th>
                <th className="px-5 py-3.5 text-center border-b border-slate-800">Status</th>
                <th className="px-5 py-3.5 border-b border-slate-800">Req (L)</th>
                <th className="px-5 py-3.5 border-b border-slate-800">Cons (L)</th>
                <th className="px-5 py-3.5 border-b border-slate-800">Bal (L)</th>
                <th className="px-5 py-3.5 text-right border-b border-slate-800">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-[11px] font-bold">
              {filteredTrips.length === 0 ? (
                <tr><td colSpan={12} className="py-20 text-center text-slate-400 font-bold italic uppercase tracking-widest">No accessible manifest logs.</td></tr>
              ) : filteredTrips.map((trip) => (
                <tr key={trip.tripId} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-5 py-3 font-black text-slate-900">
                    <div className="flex items-center gap-2">
                      {trip.tripNo}
                      {trip.revisionFlag === 'YES' && <span className="text-[7px] bg-indigo-50 text-indigo-500 px-1 py-0.5 rounded font-black border border-indigo-100">v{(trip.revisions?.length || 0) + 1}</span>}
                    </div>
                    {(trip.attachmentId || trip.docUrl) && <div className="mt-0.5 flex items-center gap-0.5 text-blue-500 text-[7px] font-black uppercase tracking-tighter"><Paperclip size={7} /> Doc</div>}
                  </td>
                  <td className="px-5 py-3 font-black text-slate-900">{trip.vehicleNumber}</td>
                  <td className="px-5 py-3 text-slate-600 font-mono">{trip.tripDate}</td>
                  <td className="px-5 py-3 text-slate-700 truncate max-w-[100px]">{trip.origin}</td>
                  <td className="px-5 py-3 text-slate-700 truncate max-w-[100px]">{trip.destination}</td>
                  <td className="px-5 py-3">
                    {trip.reposition === 'YES' ? (
                      <div className="flex flex-col">
                        <span className="text-[9px] font-black text-indigo-600 uppercase tracking-tighter">YES</span>
                        <span className="text-[7px] text-slate-400 font-bold truncate max-w-[100px]">{trip.repositionLocation}</span>
                      </div>
                    ) : (
                      <span className="text-[9px] font-black text-slate-300 uppercase">NO</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-center font-black text-slate-900">{trip.totalKM}</td>
                  <td className="px-5 py-3 text-center">
                    <div className="flex justify-center">
                      <span className={`px-2 py-0.5 rounded-md text-[8px] font-black border uppercase flex items-center gap-1 w-fit ${getStatusStyle(trip)}`}>
                        {trip.auditClose && <ShieldCheck size={9}/>}
                        {trip.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3 font-black text-slate-900">{trip.requiredFuel}</td>
                  <td className="px-5 py-3">
                    <button onClick={() => openDrillDown(trip)} className="group flex items-center gap-1 font-black text-blue-600 hover:text-blue-800 transition-all">{trip.consumedFuel}<ExternalLink size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" /></button>
                  </td>
                  <td className="px-5 py-3 font-black text-slate-900">{trip.balanceFuel}</td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex justify-end gap-1 items-center">
                      <button onClick={() => handleReconcileManually(trip.tripId)} className="p-1 hover:bg-slate-100 text-slate-400 hover:text-slate-900 rounded transition-colors" title="Reconcile Ledger"><RotateCw size={12} /></button>
                      {trip.status === TripStatus.PENDING_FOR_CLOSING && (
                        <button onClick={() => handleConfirmClose(trip)} className="flex items-center gap-1 px-1.5 py-0.5 bg-emerald-600 text-white text-[8px] font-black rounded hover:bg-emerald-700 uppercase transition-all" title="Verify variance and close manifest"><Check size={9} /> Close</button>
                      )}
                      <button onClick={() => handleRevise(trip)} disabled={!canEdit} className="p-1 hover:bg-blue-50 text-slate-400 hover:text-blue-600 rounded disabled:opacity-0 transition-colors" title="Revise Details"><Edit3 size={12} /></button>
                      <button onClick={() => handleRevise(trip)} disabled={!canEdit} className="p-1 hover:bg-indigo-50 text-indigo-500/40 hover:text-indigo-600 rounded disabled:opacity-0 transition-colors" title="Reposition Route"><MapPin size={12} /></button>
                      <button onClick={() => handleForceClose(trip.tripId)} disabled={!isAdmin} className="p-1 hover:bg-emerald-50 text-slate-300 hover:text-emerald-600 rounded disabled:opacity-0 transition-colors" title="Force Settle"><CheckCircle size={12} /></button>
                      <button onClick={() => handleSoftDelete(trip.tripId)} disabled={!isAdmin} className="p-1 hover:bg-red-50 text-slate-300 hover:text-red-600 rounded disabled:opacity-0 transition-colors" title="Delete Manifest"><Trash2 size={12} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showDrillDown && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-6xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-8 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
              <div>
                <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Enterprise Reconciliation & History</h3>
                <p className="text-[10px] text-slate-500 font-black mt-1 uppercase tracking-widest">Manifest: {showDrillDown.tripNo} | Unit: {showDrillDown.vehicleNumber} | Plan: {showDrillDown.requiredFuel}L</p>
              </div>
              <button onClick={() => setShowDrillDown(null)} className="p-2 hover:bg-white rounded-full transition-all"><X size={24} className="text-slate-400" /></button>
            </div>
            
            <div className="flex-1 overflow-hidden flex flex-col lg:flex-row p-8 gap-8">
              <div className="flex-1 flex flex-col space-y-8 overflow-y-auto pr-4 custom-scrollbar">
                <div className="space-y-4">
                  <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                    <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Active Fuel Allocation Ledger</h4>
                    {canEdit && <button onClick={handleGenericAdjustment} className="flex items-center gap-1.5 px-3 py-1 bg-emerald-600 text-white text-[9px] font-black rounded-lg hover:bg-emerald-700 uppercase"><PlusCircle size={10} /> Add Adjustment</button>}
                  </div>
                  <div className="border border-slate-100 rounded-2xl overflow-hidden">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50 text-[9px] text-slate-400 uppercase font-black tracking-widest border-b border-slate-100">
                        <tr>
                          <th className="px-4 py-3 text-center">Mode</th>
                          <th className="px-4 py-3">Reference</th>
                          <th className="px-4 py-3 text-right">Volume (L)</th>
                          {isAdmin && <th className="px-4 py-3"></th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {drillAllocations.map(a => (
                          <tr key={a.allocationId}>
                            <td className="px-4 py-3 text-center"><span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${a.isManual ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>{a.isManual ? 'Manual' : 'Auto'}</span></td>
                            <td className="px-4 py-3"><div className="text-[10px] font-black text-slate-900">{a.txnOutlet}</div><div className="text-[9px] font-bold text-slate-400">{a.txnDate ? new Date(a.txnDate).toLocaleDateString() : 'System Entry'}</div></td>
                            <td className="px-4 py-3 text-right font-black text-slate-900">{a.allocatedVolume.toLocaleString()}L</td>
                            {isAdmin && <td className="px-4 py-3 text-right"><button onClick={() => handleRemoveLink(a.allocationId)} className={`p-2 rounded-lg transition-colors ${showDrillDown.status === TripStatus.CLOSED ? 'text-slate-300 hover:text-red-500 hover:bg-red-50' : 'text-slate-200 cursor-not-allowed opacity-30'}`}><Trash2 size={16}/></button></td>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-2 border-b border-indigo-100 pb-2">
                    <History size={14} className="text-indigo-600" /><h4 className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Versioned Documents & Operational Audits</h4>
                  </div>
                  <div className="space-y-3">
                    <div className="p-5 border border-indigo-200 bg-indigo-50/30 rounded-2xl flex justify-between items-center group">
                      <div>
                        <div className="flex items-center gap-2 mb-1"><span className="px-2 py-0.5 bg-indigo-600 text-white text-[8px] font-black uppercase rounded">Latest v{(showDrillDown.revisions?.length || 0) + 1}</span><span className="text-[10px] font-black text-slate-900">Active Operational Snapshot</span></div>
                        <div className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">Req: {showDrillDown.requiredFuel}L | KM: {showDrillDown.loadKM}/{showDrillDown.emptyKM}{showDrillDown.repositionKM ? ` + Repo ${showDrillDown.repositionKM}` : ''}</div>
                        
                        <div className="mt-3 flex flex-wrap gap-2">
                          {drillAttachments.filter(att => att.attachmentId === showDrillDown.attachmentId).map(att => (
                            <div key={att.attachmentId} className="flex items-center gap-3 bg-white p-2 rounded-xl border border-indigo-100 shadow-sm">
                              <FileText size={16} className="text-blue-500" />
                              <div className="flex flex-col">
                                <span className="text-[10px] font-black text-slate-900 truncate max-w-[150px]">{att.fileName}</span>
                                <span className="text-[8px] text-slate-400 font-bold">{(att.fileSize / 1024).toFixed(1)} KB</span>
                              </div>
                              <div className="flex gap-1 ml-2">
                                <button onClick={() => viewAttachment(att)} className="p-1.5 hover:bg-blue-50 text-blue-600 rounded-lg transition-colors" title="View"><Eye size={12}/></button>
                                <button onClick={() => downloadAttachment(att)} className="p-1.5 hover:bg-slate-50 text-slate-600 rounded-lg transition-colors" title="Download"><Download size={12}/></button>
                              </div>
                            </div>
                          ))}
                          {showDrillDown.docUrl && !showDrillDown.attachmentId && (
                            <a href={showDrillDown.docUrl} target="_blank" className="flex items-center gap-1.5 bg-white px-3 py-2 rounded-xl border border-slate-200 text-blue-600 text-[10px] font-black uppercase hover:underline">
                              <Paperclip size={10} /> {showDrillDown.docName || 'External Link'}
                            </a>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[9px] font-black text-slate-400 uppercase">Effective From</div>
                        <div className="text-[10px] font-black text-slate-900">{new Date(showDrillDown.createdAt).toLocaleDateString()}</div>
                      </div>
                    </div>

                    {showDrillDown.revisions?.sort((a,b) => b.timestamp - a.timestamp).map((rev, idx) => (
                      <div key={rev.revisionId} className="p-5 border border-slate-100 bg-white rounded-2xl flex justify-between items-center opacity-70 hover:opacity-100 transition-opacity">
                        <div>
                          <div className="flex items-center gap-2 mb-1"><span className="px-2 py-0.5 bg-slate-200 text-slate-600 text-[8px] font-black uppercase rounded">v{showDrillDown.revisions!.length - idx}</span><span className="text-[10px] font-black text-slate-600 italic">Archived Snapshot</span></div>
                          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">Req: {rev.requiredFuel}L | KM: {rev.loadKM}/{rev.emptyKM}{rev.repositionKM ? ` + Repo ${rev.repositionKM}` : ''}</div>
                          
                          <div className="mt-2 flex flex-wrap gap-2">
                            {drillAttachments.filter(att => att.attachmentId === rev.attachmentId).map(att => (
                              <div key={att.attachmentId} className="flex items-center gap-2 bg-slate-50 px-2 py-1.5 rounded-lg border border-slate-100">
                                <FileText size={12} className="text-slate-400" />
                                <span className="text-[9px] font-bold text-slate-600 truncate max-w-[120px]">{att.fileName}</span>
                                <button onClick={() => downloadAttachment(att)} className="ml-1 text-slate-400 hover:text-blue-600 transition-colors"><Download size={10}/></button>
                              </div>
                            ))}
                            {rev.docUrl && !rev.attachmentId && (
                              <a href={rev.docUrl} target="_blank" className="flex items-center gap-1.5 text-slate-400 text-[10px] font-black uppercase hover:underline">
                                <Paperclip size={10} /> {rev.docName || 'Historical Link'}
                              </a>
                            )}
                          </div>
                        </div>
                        <div className="text-right"><div className="text-[9px] font-black text-slate-400 uppercase">Revised By {rev.revisedBy}</div><div className="text-[10px] font-black text-slate-500">{new Date(rev.timestamp).toLocaleDateString()}</div></div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {canEdit && (
                <div className="w-full lg:w-80 flex flex-col space-y-4 shrink-0">
                  <div className="flex justify-between items-center border-b border-blue-100 pb-2">
                    <h4 className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Available Physical Pool</h4>
                    <span className="text-[8px] font-black text-slate-400 uppercase">Unit: {showDrillDown.vehicleNumber}</span>
                  </div>
                  <div className="space-y-3 overflow-y-auto flex-1 pr-2 custom-scrollbar">
                    {availableTxns.length === 0 ? (
                      <div className="text-center py-10"><Info size={24} className="text-slate-200 mx-auto mb-2" /><p className="text-[9px] font-black text-slate-400 uppercase">No unlinked transactions</p></div>
                    ) : availableTxns.map(t => (
                      <div key={t.txnId} className="p-4 rounded-2xl border border-slate-200 bg-white hover:border-blue-500 transition-all group shadow-sm">
                        <div className="flex justify-between items-start mb-2"><div className="overflow-hidden"><div className="text-[10px] font-black text-slate-900 truncate">{t.outletName}</div><div className="text-[9px] text-slate-400 font-bold uppercase">{new Date(t.txnDateTime).toLocaleDateString()}</div></div><button onClick={() => handleManualLink(t.txnId)} className="shrink-0 px-3 py-1 bg-blue-600 text-white text-[9px] font-black rounded-lg hover:bg-blue-700 uppercase transition-all">Pair</button></div>
                        <div className="flex justify-between items-center pt-2 border-t border-slate-50 text-[9px] font-black text-slate-400 uppercase tracking-tight"><span>Avail: {t.availableVolume}L</span><span className="text-slate-900">Pool: {t.volume}L</span></div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            <div className="p-8 bg-slate-900 text-white flex justify-between items-center shrink-0">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-8 w-full text-center md:text-left">
                <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Required</span><span className="text-xl font-black">{showDrillDown.requiredFuel}L</span></div>
                <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Allocated</span><span className="text-xl font-black text-blue-400">{showDrillDown.consumedFuel}L</span></div>
                <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Balance</span><span className={`text-xl font-black ${showDrillDown.balanceFuel < 0 ? 'text-indigo-400' : 'text-amber-400'}`}>{showDrillDown.balanceFuel}L</span></div>
                <div className="md:text-right"><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Ledger Status</span><span className="text-xl font-black text-emerald-400 uppercase">{showDrillDown.status.replace(/_/g, ' ')}</span></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden my-auto animate-in zoom-in-95">
            <div className="p-8 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <div>
                <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight">{reviseMode ? 'Audit Revision / Reposition' : 'New Trip Manifest'}</h3>
                <p className="text-xs text-slate-500 font-bold mt-1 uppercase tracking-widest">Enterprise Ledger Matching</p>
              </div>
              <button onClick={handleClose} className="p-2 hover:bg-white rounded-full transition-all"><X size={24} className="text-slate-400" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-8 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="col-span-1">
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 tracking-widest">Vehicle Number</label>
                  <div className="relative group">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input required disabled={reviseMode} type="text" placeholder="Search Unit ID..." value={vehicleSearch} onChange={(e) => {setVehicleSearch(e.target.value); setFormData({...formData, vehicleNumber: ''}); }} className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-500/10 font-black bg-white" />
                  </div>
                  {vehicleSearch && !formData.vehicleNumber && (
                    <div className="mt-2 max-h-40 overflow-y-auto border border-slate-100 rounded-xl bg-white shadow-xl">
                      {filteredVehicles.map(v => (<button key={v.vehicleNumber} type="button" onClick={() => { setFormData({...formData, vehicleNumber: v.vehicleNumber}); setVehicleSearch(v.vehicleNumber); }} className="w-full text-left px-4 py-2 hover:bg-blue-50 font-black text-xs uppercase border-b border-slate-50 last:border-0">{v.vehicleNumber}</button>))}
                    </div>
                  )}
                </div>
                <div className="col-span-1"><label className="block text-[10px] font-black text-slate-400 uppercase mb-2 tracking-widest">Dispatch Date</label><input required type="date" value={formData.tripDate} onChange={e => setFormData({...formData, tripDate: e.target.value})} className="w-full px-4 py-3 border border-slate-200 rounded-xl font-bold bg-white outline-none focus:ring-4 focus:ring-blue-500/10" /></div>
                
                <div className="col-span-2 border-t border-slate-100 pt-6"><h4 className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-4">Route & Repositioning Data</h4><div className="grid grid-cols-2 gap-6">
                  <div><label className="block text-[10px] font-black text-slate-400 uppercase mb-2 tracking-widest">Origin (Start)</label><input required value={formData.origin} placeholder="Loading Point" onChange={e => setFormData({...formData, origin: e.target.value})} className="w-full px-4 py-3 border border-slate-200 rounded-xl font-bold outline-none focus:ring-4 focus:ring-blue-500/10" /></div>
                  <div><label className="block text-[10px] font-black text-slate-400 uppercase mb-2 tracking-widest">Destination (End)</label><input required value={formData.destination} placeholder="Unloading Point" onChange={e => setFormData({...formData, destination: e.target.value})} className="w-full px-4 py-3 border border-slate-200 rounded-xl font-bold outline-none focus:ring-4 focus:ring-blue-500/10" /></div>
                  <div><label className="block text-[10px] font-black text-slate-400 uppercase mb-2 tracking-widest">Repositioning Toggle</label><select value={formData.reposition} onChange={e => setFormData({...formData, reposition: e.target.value})} className="w-full px-4 py-3 border border-slate-200 rounded-xl font-black bg-white outline-none focus:ring-4 focus:ring-blue-500/10"><option value="NO">NO</option><option value="YES">YES</option></select></div>
                  <div><label className={`block text-[10px] font-black uppercase mb-2 tracking-widest ${formData.reposition === 'YES' ? 'text-slate-400' : 'text-slate-200'}`}>Reposition Location</label><input disabled={formData.reposition === 'NO'} value={formData.repositionLocation} placeholder="Off-route location" onChange={e => setFormData({...formData, repositionLocation: e.target.value})} className={`w-full px-4 py-3 border border-slate-200 rounded-xl font-bold outline-none focus:ring-4 focus:ring-blue-500/10 ${formData.reposition === 'NO' ? 'bg-slate-50' : 'bg-white'}`} /></div>
                </div></div>

                <div className="col-span-2 border-t border-slate-100 pt-6"><h4 className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-4">Distance Logistics (Recalculates Fuel)</h4><div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div><label className="block text-[10px] font-black text-slate-400 uppercase mb-2 tracking-widest">Loaded KM</label><input required type="number" min="0" value={formData.loadKM} onChange={e => setFormData({...formData, loadKM: e.target.value})} className="w-full px-4 py-3 border border-slate-200 rounded-xl font-black text-blue-600 outline-none focus:ring-4 focus:ring-blue-500/10" /></div>
                  <div><label className="block text-[10px] font-black text-slate-400 uppercase mb-2 tracking-widest">Empty KM</label><input required type="number" min="0" value={formData.emptyKM} onChange={e => setFormData({...formData, emptyKM: e.target.value})} className="w-full px-4 py-3 border border-slate-200 rounded-xl font-black text-slate-600 outline-none focus:ring-4 focus:ring-blue-500/10" /></div>
                  <div><label className="block text-[10px] font-black text-slate-400 uppercase mb-2 tracking-widest">Reposition KM</label><input type="number" min="0" value={formData.repositionKM} onChange={e => setFormData({...formData, repositionKM: e.target.value})} className="w-full px-4 py-3 border border-slate-200 rounded-xl font-black text-indigo-600 outline-none focus:ring-4 focus:ring-blue-500/10" /></div>
                </div></div>

                <div className="col-span-2 border-t border-slate-100 pt-6">
                  <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-widest mb-4">Document Management (PDF, Image, EML, XLSX)</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 tracking-widest">Document Label / Name</label>
                      <input type="text" placeholder="e.g. Proof of Delivery / Mail Copy" value={formData.docName} onChange={e => setFormData({...formData, docName: e.target.value})} className="w-full px-4 py-3 border border-slate-200 rounded-xl font-bold outline-none focus:ring-4 focus:ring-blue-500/10" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 tracking-widest">Upload Attachment (Max 10MB)</label>
                      <div 
                        onClick={() => fileInputRef.current?.click()}
                        className={`w-full px-4 py-3 border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center gap-3 cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all ${formData.file ? 'bg-emerald-50 border-emerald-400' : ''}`}
                      >
                        <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".pdf,image/*,.xls,.xlsx,.doc,.docx,.eml,.txt" />
                        {formData.file ? (
                          <div className="flex items-center gap-2 overflow-hidden">
                            <CheckCircle size={16} className="text-emerald-500 shrink-0" />
                            <span className="text-[10px] font-black text-emerald-700 uppercase truncate">{formData.file.name}</span>
                          </div>
                        ) : (
                          <>
                            <Upload size={16} className="text-slate-400" />
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Browse Manifest</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex gap-4 pt-4 border-t border-slate-100"><button type="button" onClick={handleClose} className="flex-1 py-4 font-black text-slate-500 bg-slate-100 rounded-2xl hover:bg-slate-200 transition-all uppercase tracking-widest text-xs">Discard</button><button type="submit" disabled={!formData.vehicleNumber} className="flex-1 py-4 font-black text-white bg-slate-900 rounded-2xl shadow-xl hover:bg-black transition-all uppercase tracking-widest text-xs disabled:opacity-50">Commit {reviseMode ? 'Changes' : 'Manifest'}</button></div>
            </form>
          </div>
        </div>
      )}

      {showBulkModal && <BulkUploadModal type="trip" onClose={() => setShowBulkModal(false)} onSuccess={loadData} saveService={async (data) => { await TripService.bulkCreateTrips(data); }} />}
    </div>
  );
};

export default TripLog;
