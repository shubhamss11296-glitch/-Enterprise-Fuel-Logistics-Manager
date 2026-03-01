
import React, { useState, useEffect, useMemo } from 'react';
import { VehicleService } from '../services/VehicleService';
import { ExcelService } from '../services/ExcelService';
import { Vehicle, VehicleStatus, UserRole } from '../types';
// Added missing 'X' icon to the imports
import { Plus, Search, Edit2, Upload, Download, Trash2, Filter, RotateCcw, X } from 'lucide-react';
import BulkUploadModal from './BulkUploadModal';
import { AuthService } from '../services/AuthService';

const VehicleMaster: React.FC = () => {
  const [user] = useState(AuthService.getCurrentUser());
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'ALL' | VehicleStatus>(VehicleStatus.ACTIVE);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [formData, setFormData] = useState<any>({
    vehicleNumber: '',
    vehicleType: 'TRUCK-10T',
    fuelCardCompany: '',
    avgLoadedKMPL: '',
    avgEmptyKMPL: '',
    status: VehicleStatus.ACTIVE
  });

  const isAdmin = user?.role === UserRole.ADMIN;

  const loadVehicles = async () => {
    setVehicles(await VehicleService.getAllVehicles());
  };

  useEffect(() => { loadVehicles(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editMode) {
        await VehicleService.updateVehicle(formData);
      } else {
        await VehicleService.createVehicle(formData);
      }
      handleClose();
      loadVehicles();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleEdit = (v: Vehicle) => {
    if (v.status === VehicleStatus.DELETED) return;
    setFormData(v);
    setEditMode(true);
    setShowModal(true);
  };

  const handleDelete = async (vehicleNumber: string) => {
    if (!isAdmin) return alert('Restricted: Admin access required.');
    if (!confirm(`Mark vehicle ${vehicleNumber} as DELETED? This will prevent new trip/fuel entries but keep historical data.`)) return;
    
    try {
      await VehicleService.softDeleteVehicle(vehicleNumber, user?.username || 'Admin');
      loadVehicles();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleRestore = async (vehicleNumber: string) => {
    if (!isAdmin) return alert('Restricted: Admin access required.');
    if (!confirm(`Restore vehicle ${vehicleNumber} to INACTIVE state?`)) return;

    try {
      await VehicleService.restoreVehicle(vehicleNumber, user?.username || 'Admin');
      loadVehicles();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleClose = () => {
    setShowModal(false);
    setEditMode(false);
    setFormData({
      vehicleNumber: '',
      vehicleType: 'TRUCK-10T',
      fuelCardCompany: '',
      avgLoadedKMPL: '',
      avgEmptyKMPL: '',
      status: VehicleStatus.ACTIVE
    });
  };

  const filteredVehicles = useMemo(() => {
    let list = vehicles;
    
    if (statusFilter !== 'ALL') {
      list = list.filter(v => v.status === statusFilter);
    }
    
    if (searchTerm) {
      const lowSearch = searchTerm.toLowerCase();
      list = list.filter(v => 
        v.vehicleNumber.toLowerCase().includes(lowSearch) ||
        v.vehicleType.toLowerCase().includes(lowSearch) ||
        v.fuelCardCompany.toLowerCase().includes(lowSearch)
      );
    }
    
    return list;
  }, [vehicles, statusFilter, searchTerm]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex gap-4 items-center flex-1 w-full">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Search Vehicle Master..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm w-full focus:ring-2 focus:ring-blue-500 outline-none shadow-sm font-bold"
            />
          </div>
          <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
            <Filter size={14} className="text-slate-400" />
            <select 
              value={statusFilter} 
              onChange={e => setStatusFilter(e.target.value as any)}
              className="text-[10px] font-black uppercase outline-none bg-transparent cursor-pointer"
            >
              <option value="ALL">All Status</option>
              <option value={VehicleStatus.ACTIVE}>Active Only</option>
              <option value={VehicleStatus.INACTIVE}>Inactive Only</option>
              <option value={VehicleStatus.DELETED}>Deleted Only</option>
            </select>
          </div>
        </div>
        <div className="flex gap-3 w-full md:w-auto">
          <button 
            onClick={() => ExcelService.downloadTemplate('vehicle')}
            className="p-2.5 bg-white hover:bg-slate-50 text-slate-600 rounded-xl transition-colors border border-slate-200 shadow-sm"
            title="XLSX Template"
          >
            <Download size={18} />
          </button>
          <button 
            onClick={() => setShowBulkModal(true)}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-50 transition-all shadow-sm"
          >
            <Upload size={18} /> Bulk Ingest
          </button>
          <button 
            onClick={() => setShowModal(true)}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-xl shadow-blue-900/10"
          >
            <Plus size={18} /> Add Vehicle
          </button>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left whitespace-nowrap">
            <thead className="bg-slate-900 text-[10px] text-slate-400 uppercase font-black border-b border-slate-800 tracking-widest">
              <tr>
                <th className="px-8 py-5">Vehicle Number</th>
                <th className="px-8 py-5">Type</th>
                <th className="px-8 py-5">Fuel Card</th>
                <th className="px-8 py-5">Loaded KMPL</th>
                <th className="px-8 py-5">Empty KMPL</th>
                <th className="px-8 py-5">Status</th>
                <th className="px-8 py-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredVehicles.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-8 py-20 text-center text-slate-400 font-bold uppercase tracking-widest text-xs italic">
                    No matching records in master ledger.
                  </td>
                </tr>
              ) : filteredVehicles.map((v) => (
                <tr key={v.vehicleNumber} className={`hover:bg-slate-50 transition-colors group ${v.status === VehicleStatus.DELETED ? 'opacity-50 grayscale' : ''}`}>
                  <td className={`px-8 py-5 font-black text-slate-800 ${v.status === VehicleStatus.DELETED ? 'line-through' : ''}`}>
                    {v.vehicleNumber}
                  </td>
                  <td className="px-8 py-5 text-sm font-black text-slate-500 uppercase">{v.vehicleType}</td>
                  <td className="px-8 py-5 text-sm font-bold text-slate-400">{v.fuelCardCompany}</td>
                  <td className="px-8 py-5 text-sm font-black text-blue-600">{v.avgLoadedKMPL}</td>
                  <td className="px-8 py-5 text-sm font-black text-slate-600">{v.avgEmptyKMPL}</td>
                  <td className="px-8 py-5">
                    <span className={`px-3 py-1 rounded-lg text-[9px] font-black border uppercase tracking-widest ${
                      v.status === VehicleStatus.ACTIVE ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                      v.status === VehicleStatus.INACTIVE ? 'bg-amber-50 text-amber-600 border-amber-100' :
                      'bg-red-50 text-red-600 border-red-100'
                    }`}>
                      {v.status}
                    </span>
                  </td>
                  <td className="px-8 py-5 text-right">
                    <div className="flex justify-end gap-2">
                      <button 
                        onClick={() => handleEdit(v)} 
                        disabled={v.status === VehicleStatus.DELETED}
                        className={`p-2 rounded-xl transition-all ${
                          v.status === VehicleStatus.DELETED 
                            ? 'text-slate-200 cursor-not-allowed' 
                            : 'hover:bg-blue-50 text-blue-600'
                        }`}
                        title={v.status === VehicleStatus.DELETED ? "Cannot edit deleted unit" : "Edit Master"}
                      >
                        <Edit2 size={16} />
                      </button>
                      
                      {isAdmin && (
                        v.status === VehicleStatus.DELETED ? (
                          <button 
                            onClick={() => handleRestore(v.vehicleNumber)}
                            className="p-2 hover:bg-emerald-50 text-emerald-600 rounded-xl transition-all"
                            title="Restore Vehicle"
                          >
                            <RotateCcw size={16} />
                          </button>
                        ) : (
                          <button 
                            onClick={() => handleDelete(v.vehicleNumber)} 
                            className="p-2 hover:bg-red-50 text-slate-300 hover:text-red-500 rounded-xl transition-all"
                            title="Soft Delete"
                          >
                            <Trash2 size={16} />
                          </button>
                        )
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-8 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
              <div>
                <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight">{editMode ? 'Edit Master Record' : 'Add Unit ID'}</h3>
                <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-1">Vehicle Master Ledger</p>
              </div>
              <button onClick={handleClose} className="p-2 hover:bg-white rounded-full transition-all text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-8 space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="col-span-2">
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 tracking-widest ml-1">Vehicle Number (Primary Key)</label>
                  <input 
                    required
                    readOnly={editMode}
                    value={formData.vehicleNumber}
                    onChange={e => setFormData({...formData, vehicleNumber: e.target.value.toUpperCase()})}
                    className={`w-full px-5 py-3.5 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-blue-500/10 font-black ${editMode ? 'bg-slate-100 cursor-not-allowed text-slate-400' : 'bg-white'}`}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 tracking-widest ml-1">Asset Classification</label>
                  <select 
                    value={formData.vehicleType}
                    onChange={e => setFormData({...formData, vehicleType: e.target.value})}
                    className="w-full px-5 py-3.5 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-blue-500/10 font-black text-xs uppercase"
                  >
                    <option>TRUCK-10T</option>
                    <option>TRUCK-20T</option>
                    <option>TRUCK-32T</option>
                    <option>TRAILER-40T</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 tracking-widest ml-1">Fueling Entity</label>
                  <input 
                    value={formData.fuelCardCompany}
                    onChange={e => setFormData({...formData, fuelCardCompany: e.target.value})}
                    className="w-full px-5 py-3.5 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-blue-500/10 font-black text-sm uppercase"
                    placeholder="HPCL / IOCL"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 tracking-widest ml-1">Avg Loaded KMPL</label>
                  <input 
                    required type="number" step="0.1"
                    value={formData.avgLoadedKMPL}
                    onChange={e => setFormData({...formData, avgLoadedKMPL: e.target.value})}
                    className="w-full px-5 py-3.5 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-blue-500/10 font-black text-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 tracking-widest ml-1">Avg Empty KMPL</label>
                  <input 
                    required type="number" step="0.1"
                    value={formData.avgEmptyKMPL}
                    onChange={e => setFormData({...formData, avgEmptyKMPL: e.target.value})}
                    className="w-full px-5 py-3.5 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-blue-500/10 font-black text-slate-600"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 tracking-widest ml-1">Operational Lifecycle Status</label>
                  <div className="flex gap-4 mt-2">
                    <label className={`flex-1 flex items-center justify-center gap-2 py-3 border rounded-2xl cursor-pointer transition-all ${formData.status === VehicleStatus.ACTIVE ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'bg-white border-slate-200 text-slate-400 grayscale'}`}>
                      <input type="radio" className="hidden" checked={formData.status === VehicleStatus.ACTIVE} onChange={() => setFormData({...formData, status: VehicleStatus.ACTIVE})} />
                      <span className="text-[10px] font-black uppercase tracking-widest">Active</span>
                    </label>
                    <label className={`flex-1 flex items-center justify-center gap-2 py-3 border rounded-2xl cursor-pointer transition-all ${formData.status === VehicleStatus.INACTIVE ? 'bg-amber-50 border-amber-500 text-amber-700' : 'bg-white border-slate-200 text-slate-400 grayscale'}`}>
                      <input type="radio" className="hidden" checked={formData.status === VehicleStatus.INACTIVE} onChange={() => setFormData({...formData, status: VehicleStatus.INACTIVE})} />
                      <span className="text-[10px] font-black uppercase tracking-widest">Inactive</span>
                    </label>
                  </div>
                </div>
              </div>
              <div className="flex gap-4 pt-6 border-t border-slate-50">
                <button type="button" onClick={handleClose} className="flex-1 py-4 font-black text-[10px] uppercase tracking-widest text-slate-400 bg-slate-100 rounded-2xl hover:bg-slate-200 transition-all">Cancel</button>
                <button type="submit" className="flex-1 py-4 font-black text-[10px] uppercase tracking-widest text-white bg-slate-900 rounded-2xl shadow-xl shadow-slate-900/20 hover:bg-black transition-all">Commit Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showBulkModal && (
        <BulkUploadModal 
          type="vehicle"
          onClose={() => setShowBulkModal(false)}
          onSuccess={loadVehicles}
          saveService={async (data) => {
            for (const v of data) {
              await VehicleService.createVehicle(v);
            }
          }}
        />
      )}
    </div>
  );
};

export default VehicleMaster;
