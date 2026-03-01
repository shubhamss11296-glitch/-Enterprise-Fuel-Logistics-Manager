
import * as XLSX from 'xlsx';

export class ExcelService {
  static downloadTemplate(type: 'vehicle' | 'trip' | 'fuel') {
    let headers: string[] = [];
    let sampleData: any[] = [];
    let fileName = `fuelops_${type}_template.xlsx`;

    switch (type) {
      case 'vehicle':
        headers = ['Vehicle Number', 'Vehicle Type', 'Fuel Card Company', 'Avg Loaded KMPL', 'Avg Empty KMPL'];
        sampleData = [['MH01-AB-1234', 'TRUCK-32T', 'HPCL', 4.5, 6.5]];
        break;
      case 'trip':
        headers = ['Vehicle Number', 'Trip Date (YYYY-MM-DD)', 'Origin', 'Destination', 'Load KM', 'Empty KM', 'Reposition (YES/NO)', 'Reposition Location', 'Driver Name', 'Driver Contact'];
        sampleData = [['MH01-AB-1234', '2023-11-01', 'Mumbai Hub', 'Pune Depot', 150, 20, 'YES', 'Depot-B', 'John Doe', '9876543210']];
        break;
      case 'fuel':
        headers = [
          'Transaction ID', 'Terminal ID', 'Merchant ID', 'BatchID / ROC', 
          'Retail Outlet Name', 'Retail Outlet Address', 'Retail Outlet Location', 
          'Retail Outlet City', 'Retail Outlet District', 'Retail Outlet State', 
          'Retail Outlet PIN Code', 'Retail Outlet PAN', 'Credit/Debit', 
          'Account Number', 'Mobile No.', 'Vehicle No.', 'Txn Date and Time', 
          'Txn Type', 'Source', 'Product', 'Product per Ltr', 'Volume (Ltr.)', 
          'Service Charge', 'Amount', 'Discount', 'Odometer Reading', 'Closing Balance'
        ];
        sampleData = [['TXN-10001', 'TID-001', 'MID-001', 'B-45', 'HP Petrol', 'Vashi St.', 'Navi Mumbai', 'Mumbai', 'Thane', 'Maharashtra', '400703', 'ABCDE1234F', 'Debit', '123456XXXX', '9876543210', 'MH01-AB-1234', '2023-11-01 14:30', 'Retail', 'Card', 'HSD', 94.5, 45, 0, 4252.5, 0, 12500, 50000]];
        break;
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleData]);
    
    const wscols = headers.map(() => ({ wch: 20 }));
    ws['!cols'] = wscols;

    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, fileName);
  }

  static async parseExcel(file: File): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const json = XLSX.utils.sheet_to_json(worksheet);
          resolve(json);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }
}
