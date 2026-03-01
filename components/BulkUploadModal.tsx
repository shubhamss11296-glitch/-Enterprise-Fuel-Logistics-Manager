
import React, { useState } from 'react';
import { ExcelService } from '../services/ExcelService';
import { ValidationService } from '../services/ValidationService';
import { UploadResult, RejectedRow } from '../types';
import { X, FileSpreadsheet, CheckCircle, AlertTriangle, Info, Loader2 } from 'lucide-react';

interface Props {
  type: 'vehicle' | 'trip' | 'fuel';
  onClose: () => void;
  onSuccess: () => void;
  saveService: (data: any[]) => Promise<void>;
}

const BulkUploadModal: React.FC<Props> = ({ type, onClose, onSuccess, saveService }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    try {
      const rawData = await ExcelService.parseExcel(file);
      let validationResult: { valid: any[], rejected: RejectedRow[] };

      switch (type) {
        case 'vehicle': validationResult = await ValidationService.validateVehicles(rawData); break;
        case 'trip': validationResult = await ValidationService.validateTrips(rawData); break;
        case 'fuel': validationResult = await ValidationService.validateFuel(rawData); break;
      }

      if (validationResult.valid.length > 0) {
        await saveService(validationResult.valid);
      }

      setResult({
        acceptedCount: validationResult.valid.length,
        rejected: validationResult.rejected,
        totalRows: rawData.length
      });
    } catch (err: any) {
      alert("Error processing file: " + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-[2rem] w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Bulk {type} Data Ingestion</h3>
            <p className="text-xs text-slate-500 font-bold mt-1">Enterprise Standard XLSX Validation Engine</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white rounded-full transition-all border border-transparent hover:border-slate-200">
            <X size={24} className="text-slate-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8">
          {!result ? (
            <div className="space-y-6">
              <div className="bg-blue-50 border border-blue-100 p-6 rounded-2xl flex items-start gap-4">
                <div className="p-2 bg-blue-100 text-blue-600 rounded-lg"><Info size={20}/></div>
                <div>
                  <h4 className="text-sm font-black text-blue-900 uppercase tracking-widest mb-1">Pre-processing Instructions</h4>
                  <ul className="text-xs text-blue-700 font-medium list-disc list-inside space-y-1">
                    <li>Use the standardized FuelOps template for best results.</li>
                    <li>Duplicate records based on Primary Keys will be automatically rejected.</li>
                    <li>KM and Fuel values must be numeric.</li>
                  </ul>
                </div>
              </div>

              <label className="border-4 border-dashed border-slate-100 rounded-3xl p-12 flex flex-col items-center justify-center cursor-pointer hover:border-blue-200 hover:bg-blue-50/30 transition-all group">
                <input type="file" className="hidden" accept=".xlsx" onChange={handleFileUpload} disabled={isProcessing} />
                {isProcessing ? (
                  <div className="text-center">
                    <Loader2 size={48} className="text-blue-600 animate-spin mx-auto mb-4" />
                    <p className="font-black text-slate-900">Validating & Injecting Data...</p>
                  </div>
                ) : (
                  <>
                    <div className="p-4 bg-slate-50 rounded-2xl group-hover:scale-110 transition-transform mb-4">
                      <FileSpreadsheet size={40} className="text-slate-400 group-hover:text-blue-600" />
                    </div>
                    <p className="font-black text-slate-900 text-lg">Click to select .xlsx file</p>
                    <p className="text-slate-400 text-xs mt-2 font-bold uppercase tracking-widest">or drag and drop here</p>
                  </>
                )}
              </label>
            </div>
          ) : (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-3xl text-center">
                  <CheckCircle size={32} className="text-emerald-500 mx-auto mb-2" />
                  <p className="text-3xl font-black text-emerald-900">{result.acceptedCount}</p>
                  <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Accepted Rows</p>
                </div>
                <div className="bg-amber-50 border border-amber-100 p-6 rounded-3xl text-center">
                  <AlertTriangle size={32} className="text-amber-500 mx-auto mb-2" />
                  <p className="text-3xl font-black text-amber-900">{result.rejected.length}</p>
                  <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Rejected Rows</p>
                </div>
              </div>

              {result.rejected.length > 0 && (
                <div className="border border-slate-200 rounded-3xl overflow-hidden">
                  <div className="bg-slate-50 px-6 py-3 border-b border-slate-200 flex justify-between">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Rejection Detail Report</span>
                  </div>
                  <div className="max-h-60 overflow-y-auto">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50 text-[10px] text-slate-400 uppercase font-black tracking-tighter">
                        <tr>
                          <th className="px-6 py-2">Row</th>
                          <th className="px-6 py-2">Error Reason</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {result.rejected.map((rej, i) => (
                          <tr key={i} className="text-xs">
                            <td className="px-6 py-3 font-bold text-slate-400">{rej.row}</td>
                            <td className="px-6 py-3 font-bold text-red-600">{rej.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <button 
                onClick={() => { onSuccess(); onClose(); }}
                className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-slate-900/30 hover:bg-black transition-all"
              >
                Return to Management
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BulkUploadModal;
