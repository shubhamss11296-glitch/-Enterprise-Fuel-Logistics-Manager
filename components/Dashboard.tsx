
import React, { useEffect, useState, useMemo } from 'react';
import { ReportingService, DashboardFilters } from '../services/ReportingService';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { AlertCircle, CheckCircle, Package, TrendingUp, RefreshCw, Layers, Fuel, DollarSign, Map, Zap, Calendar, Search } from 'lucide-react';
import { TripStatus, Vehicle } from '../types';
import { db } from '../db';

interface Props {
  onNavigate: (tab: 'dashboard' | 'vehicles' | 'trips' | 'fuel' | 'reports', filter?: any) => void;
}

const Dashboard: React.FC<Props> = ({ onNavigate }) => {
  const [stats, setStats] = useState<any>(null);
  const [stateReport, setStateReport] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filters, setFilters] = useState<DashboardFilters>({
    vehicleNumber: '',
    startDate: '',
    endDate: ''
  });

  const load = async () => {
    setIsRefreshing(true);
    const [s, r, v] = await Promise.all([
      ReportingService.getDashboardStats(filters),
      ReportingService.getStateWiseReport(filters),
      db.getAll<Vehicle>('vehicles')
    ]);
    setStats(s);
    setStateReport(r);
    setVehicles(v);
    setTimeout(() => setIsRefreshing(false), 300);
  };

  useEffect(() => { load(); }, [filters]);

  if (!stats) return null;

  const tripChartData = [
    { name: 'Pending', value: stats.pendingTrips || 0, color: '#f59e0b', status: TripStatus.PENDING_FOR_CLOSING },
    { name: 'Closed', value: stats.closedTrips || 0, color: '#10b981', status: TripStatus.CLOSED },
    { name: 'Excess', value: stats.excessTrips || 0, color: '#6366f1', status: TripStatus.EXCESS },
  ];

  const hasNoData = stats.totalTrips === 0 && stats.totalVolume === 0;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header & Global Filters */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Intelligence Dashboard</h1>
          <p className="text-sm text-slate-500 font-medium">Data-driven insights from the enterprise ledger</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 bg-white p-2 rounded-2xl border border-slate-200 shadow-sm w-full lg:w-auto">
          <div className="flex items-center gap-2 px-3 border-r border-slate-100">
            <Calendar size={16} className="text-slate-400" />
            <input 
              type="date" 
              value={filters.startDate} 
              onChange={e => setFilters({...filters, startDate: e.target.value})}
              className="text-[11px] font-black uppercase outline-none bg-transparent"
            />
            <span className="text-slate-300">to</span>
            <input 
              type="date" 
              value={filters.endDate} 
              onChange={e => setFilters({...filters, endDate: e.target.value})}
              className="text-[11px] font-black uppercase outline-none bg-transparent"
            />
          </div>
          <div className="flex items-center gap-2 px-3">
            <Search size={16} className="text-slate-400" />
            <select 
              value={filters.vehicleNumber}
              onChange={e => setFilters({...filters, vehicleNumber: e.target.value})}
              className="text-[11px] font-black uppercase outline-none bg-transparent min-w-[120px]"
            >
              <option value="">Global Fleet</option>
              {vehicles.map(v => (
                <option key={v.vehicleNumber} value={v.vehicleNumber}>{v.vehicleNumber}</option>
              ))}
            </select>
          </div>
          <button 
            onClick={load}
            className="p-2.5 bg-slate-900 text-white rounded-xl hover:bg-black transition-all"
            title="Refresh Data"
          >
            <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* KPI Row 1: Manifest Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard 
          icon={<Package className="text-blue-500" />} 
          label="Total Manifests" 
          value={stats.totalTrips} 
          subText={`${stats.totalDistance.toLocaleString()} Total KM`}
          onClick={() => onNavigate('trips', 'ALL')}
        />
        <MetricCard 
          icon={<AlertCircle className="text-amber-500" />} 
          label="Pending Settlement" 
          value={stats.pendingTrips} 
          subText="Manual Audit Required"
          isWarning={stats.pendingTrips > 0}
          onClick={() => onNavigate('trips', TripStatus.PENDING_FOR_CLOSING)}
        />
        <MetricCard 
          icon={<CheckCircle className="text-emerald-500" />} 
          label="Closed & Settled" 
          value={stats.closedTrips} 
          subText="Clean Matching"
          onClick={() => onNavigate('trips', TripStatus.CLOSED)}
        />
        <MetricCard 
          icon={<Layers className="text-indigo-500" />} 
          label="Surplus / Excess" 
          value={stats.excessTrips} 
          subText="Carry Forward Pool"
          onClick={() => onNavigate('trips', TripStatus.EXCESS)}
        />
      </div>

      {/* KPI Row 2: Resource Ledger */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <SecondaryCard 
          icon={<Fuel className="text-blue-600" />}
          label="Purchased Volume"
          value={`${stats.totalVolume.toLocaleString()} L`}
          subValue={`₹ ${stats.totalAmount.toLocaleString()}`}
        />
        <SecondaryCard 
          icon={<Zap className="text-amber-600" />}
          label="Available Physical Pool"
          value={`${stats.availablePool.toLocaleString()} L`}
          subValue={`${stats.totalConsumed.toLocaleString()} L Consumed`}
          isHighlighted
        />
        <SecondaryCard 
          icon={<DollarSign className="text-emerald-600" />}
          label="Efficiency Index"
          value={`₹ ${stats.costPerKM}/KM`}
          subValue={`${stats.avgFuelPerTrip} L Avg/Trip`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Visual Analytics */}
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm relative overflow-hidden group">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">Manifest Lifecycle Distribution</h3>
              <p className="text-xs text-slate-500 font-medium">Filtered by current selection</p>
            </div>
            <TrendingUp size={20} className="text-slate-300" />
          </div>
          
          {hasNoData ? (
            <div className="h-64 flex flex-col items-center justify-center text-slate-300">
              <Package size={48} className="mb-4 opacity-20" />
              <p className="font-black uppercase tracking-widest text-[10px]">No ledger data for current filter</p>
            </div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={tripChartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 900, fill: '#64748b'}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#94a3b8'}} />
                  <Tooltip 
                    cursor={{fill: '#f8fafc'}} 
                    contentStyle={{borderRadius: '24px', border: 'none', boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.1)'}} 
                  />
                  <Bar 
                    dataKey="value" 
                    radius={[12, 12, 0, 0]} 
                    barSize={60}
                    onClick={(data: any) => onNavigate('trips', data.status)}
                    cursor="pointer"
                  >
                    {tripChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Regional Spend */}
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">State-Wise Logistical Spend</h3>
              <p className="text-xs text-slate-500 font-medium">Purchase concentration by region</p>
            </div>
            <Map size={20} className="text-slate-300" />
          </div>
          
          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
            {stateReport.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-300 py-20">
                <Map size={48} className="mb-4 opacity-20" />
                <p className="font-black uppercase tracking-widest text-[10px]">No purchase records found</p>
              </div>
            ) : (
              <table className="w-full text-left">
                <thead className="text-[10px] text-slate-400 border-b border-slate-100 uppercase font-black tracking-widest">
                  <tr>
                    <th className="pb-4">Region</th>
                    <th className="pb-4 text-right">Volume (L)</th>
                    <th className="pb-4 text-right">Spend (INR)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {stateReport.map((row, i) => (
                    <tr key={i} className="group hover:bg-slate-50 transition-colors">
                      <td className="py-4 font-black text-slate-700 text-sm uppercase tracking-tight">{row.state}</td>
                      <td className="py-4 font-black text-slate-500 text-right text-xs">{row.volume.toLocaleString()}</td>
                      <td className="py-4 font-black text-blue-600 text-right text-sm">₹ {row.amount.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const MetricCard = ({ icon, label, value, subText, isWarning = false, onClick }: any) => (
  <button 
    onClick={onClick}
    className={`p-6 rounded-[2.5rem] border bg-white shadow-sm transition-all text-left hover:shadow-2xl hover:scale-[1.03] group relative overflow-hidden ${
      isWarning ? 'border-amber-200' : 'border-slate-100'
    }`}
  >
    <div className={`absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 rounded-full blur-3xl opacity-10 group-hover:opacity-20 transition-opacity ${
      isWarning ? 'bg-amber-400' : 'bg-blue-400'
    }`} />
    
    <div className="flex justify-between items-start mb-6">
      <div className={`p-3 rounded-2xl ${isWarning ? 'bg-amber-100' : 'bg-slate-50'}`}>{icon}</div>
      {isWarning && (
        <span className="flex items-center gap-1 text-[8px] font-black px-2 py-0.5 bg-amber-100 text-amber-700 rounded-lg uppercase tracking-widest border border-amber-200">
          Audit Required
        </span>
      )}
    </div>
    <h4 className="text-4xl font-black text-slate-900 tracking-tighter leading-none mb-2">{value || 0}</h4>
    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
    <p className="mt-4 text-[10px] font-bold text-slate-400 uppercase tracking-tighter flex items-center gap-1.5">
      <span className={isWarning ? 'text-amber-500' : 'text-blue-500'}>●</span> {subText}
    </p>
  </button>
);

const SecondaryCard = ({ icon, label, value, subValue, isHighlighted = false }: any) => (
  <div className={`p-6 rounded-[2.5rem] border transition-all relative overflow-hidden ${
    isHighlighted ? 'bg-slate-900 border-slate-900 text-white shadow-2xl shadow-slate-900/20' : 'bg-white border-slate-100'
  }`}>
    {isHighlighted && <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/20 blur-3xl rounded-full -mr-16 -mt-16" />}
    
    <div className="flex items-center gap-3 mb-4">
      <div className={`p-2.5 rounded-xl ${isHighlighted ? 'bg-white/10 text-white' : 'bg-slate-50 text-slate-400'}`}>
        {icon}
      </div>
      <p className={`text-[10px] font-black uppercase tracking-widest ${isHighlighted ? 'text-slate-400' : 'text-slate-400'}`}>
        {label}
      </p>
    </div>
    <div className="flex items-end justify-between">
      <h5 className={`text-2xl font-black tracking-tight ${isHighlighted ? 'text-white' : 'text-slate-900'}`}>
        {value || "No Data"}
      </h5>
      <p className={`text-[10px] font-black uppercase tracking-tight ${isHighlighted ? 'text-blue-400' : 'text-slate-500'}`}>
        {subValue}
      </p>
    </div>
  </div>
);

export default Dashboard;
