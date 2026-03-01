
import React, { useEffect, useState } from 'react';
import { ReportingService } from '../services/ReportingService';
import { Fuel, MapPin, Gauge } from 'lucide-react';

const Reports: React.FC = () => {
  const [performance, setPerformance] = useState<any[]>([]);
  const [stateData, setStateData] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      setPerformance(await ReportingService.getVehiclePerformance());
      setStateData(await ReportingService.getStateWiseReport());
    };
    load();
  }, []);

  return (
    <div className="space-y-8">
      {/* Performance Matrix */}
      <section>
        <div className="flex items-center gap-2 mb-6">
          <div className="p-1.5 bg-blue-100 text-blue-600 rounded-lg"><Gauge size={20}/></div>
          <h3 className="text-xl font-black text-slate-800">Vehicle Performance Matrix</h3>
        </div>
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-[10px] text-slate-500 uppercase font-black tracking-widest border-b border-slate-200">
              <tr>
                <th className="px-8 py-5">Vehicle Number</th>
                <th className="px-8 py-5">Total Distance (KM)</th>
                <th className="px-8 py-5">Fuel Used (L)</th>
                <th className="px-8 py-5">Actual KMPL</th>
                <th className="px-8 py-5">Expected KMPL</th>
                <th className="px-8 py-5">Variance (%)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {performance.map((p, i) => {
                const variance = ((p.actualKMPL - p.expectedKMPL) / p.expectedKMPL * 100).toFixed(1);
                const isBad = parseFloat(variance) < -10;
                return (
                  <tr key={i} className="hover:bg-slate-50 transition-colors">
                    <td className="px-8 py-5 font-black text-slate-800">{p.vehicleNumber}</td>
                    <td className="px-8 py-5 font-bold text-slate-600">{p.totalKM.toLocaleString()}</td>
                    <td className="px-8 py-5 font-bold text-slate-600">{p.totalFuel.toLocaleString()}</td>
                    <td className="px-8 py-5 font-black text-slate-900">{p.actualKMPL}</td>
                    <td className="px-8 py-5 font-medium text-slate-500">{p.expectedKMPL}</td>
                    <td className="px-8 py-5">
                      <span className={`px-2 py-1 rounded text-[10px] font-black ${isBad ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {variance}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Regional Spend */}
      <section>
        <div className="flex items-center gap-2 mb-6">
          <div className="p-1.5 bg-indigo-100 text-indigo-600 rounded-lg"><MapPin size={20}/></div>
          <h3 className="text-xl font-black text-slate-800">Regional Fuel Logistics Spend</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {stateData.map((row, i) => (
            <div key={i} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{row.state}</p>
                <h4 className="text-2xl font-black text-slate-800 mt-1">₹ {row.amount.toLocaleString()}</h4>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold text-slate-500 uppercase">Volume</p>
                <p className="text-sm font-black text-indigo-600">{row.volume.toLocaleString()} L</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default Reports;
