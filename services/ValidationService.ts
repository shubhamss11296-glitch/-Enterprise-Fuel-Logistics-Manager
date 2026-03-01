
import { db } from '../db';
import { Vehicle, Trip, FuelTransaction, RejectedRow, VehicleStatus, ReconciliationStatus } from '../types';

export class ValidationService {
  static async validateVehicles(rows: any[]): Promise<{ valid: Partial<Vehicle>[], rejected: RejectedRow[] }> {
    const valid: Partial<Vehicle>[] = [];
    const rejected: RejectedRow[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; 
      
      const vehicleNumber = row['Vehicle Number']?.toString().trim().toUpperCase();
      const avgLoaded = parseFloat(row['Avg Loaded KMPL']);
      const avgEmpty = parseFloat(row['Avg Empty KMPL']);

      if (!vehicleNumber) {
        rejected.push({ row: rowNum, reason: 'Vehicle Number is missing', data: row });
        continue;
      }

      if (isNaN(avgLoaded) || avgLoaded <= 0 || isNaN(avgEmpty) || avgEmpty <= 0) {
        rejected.push({ row: rowNum, reason: 'Invalid KMPL values (must be > 0)', data: row });
        continue;
      }

      const existing = await db.getById('vehicles', vehicleNumber);
      if (existing) {
        rejected.push({ row: rowNum, reason: 'Duplicate: Vehicle already exists in master', data: row });
        continue;
      }

      valid.push({
        vehicleNumber,
        vehicleType: row['Vehicle Type'] || 'TRUCK-10T',
        fuelCardCompany: row['Fuel Card Company'] || 'NA',
        avgLoadedKMPL: avgLoaded,
        avgEmptyKMPL: avgEmpty,
        status: VehicleStatus.ACTIVE
      });
    }

    return { valid, rejected };
  }

  static async validateTrips(rows: any[]): Promise<{ valid: Partial<Trip>[], rejected: RejectedRow[] }> {
    const valid: Partial<Trip>[] = [];
    const rejected: RejectedRow[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;

      const vehicleNumber = row['Vehicle Number']?.toString().trim().toUpperCase();
      const tripDateRaw = row['Trip Date (YYYY-MM-DD)'];
      const loadKM = parseFloat(row['Load KM']);
      const emptyKM = parseFloat(row['Empty KM']);

      if (!vehicleNumber || !tripDateRaw) {
        rejected.push({ row: rowNum, reason: 'Mandatory fields missing (Vehicle/Date)', data: row });
        continue;
      }

      const vehicle = await db.getById<Vehicle>('vehicles', vehicleNumber);
      if (!vehicle) {
        rejected.push({ row: rowNum, reason: `Vehicle ${vehicleNumber} not found in Master`, data: row });
        continue;
      }

      if (vehicle.status === VehicleStatus.DELETED) {
        rejected.push({ row: rowNum, reason: `Vehicle ${vehicleNumber} is DELETED. Restore it from Master first.`, data: row });
        continue;
      }

      if (isNaN(loadKM) || isNaN(emptyKM)) {
        rejected.push({ row: rowNum, reason: 'Invalid KM values', data: row });
        continue;
      }

      const isReposition = row['Reposition (YES/NO)']?.toString().toUpperCase() === 'YES';

      valid.push({
        vehicleNumber,
        tripDate: new Date(tripDateRaw).toISOString().split('T')[0],
        origin: row['Origin']?.toString() || 'Unknown',
        destination: row['Destination']?.toString() || 'Unknown',
        loadKM,
        emptyKM,
        reposition: isReposition ? 'YES' : 'NO',
        repositionLocation: isReposition ? (row['Reposition Location']?.toString() || 'Unspecified') : null,
        driverName: row['Driver Name']?.toString() || null,
        driverContact: row['Driver Contact']?.toString() || null
      });
    }

    return { valid, rejected };
  }

  static async validateFuel(rows: any[]): Promise<{ valid: Partial<FuelTransaction>[], rejected: RejectedRow[] }> {
    const valid: Partial<FuelTransaction>[] = [];
    const rejected: RejectedRow[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;

      const txnId = row['Transaction ID']?.toString().trim();
      const vehicleNumber = row['Vehicle No.']?.toString().trim().toUpperCase() || row['Vehicle Number']?.toString().trim().toUpperCase();
      const volume = parseFloat(row['Volume (Ltr.)']) || parseFloat(row['Volume']);
      const amount = parseFloat(row['Amount']);

      if (!txnId || !vehicleNumber || isNaN(volume) || isNaN(amount)) {
        rejected.push({ row: rowNum, reason: 'Missing txnId, vehicle, or invalid volume/amount', data: row });
        continue;
      }

      const vehicle = await db.getById<Vehicle>('vehicles', vehicleNumber);
      if (!vehicle) {
        rejected.push({ row: rowNum, reason: `Vehicle ${vehicleNumber} not found in Master`, data: row });
        continue;
      }

      if (vehicle.status === VehicleStatus.DELETED) {
        rejected.push({ row: rowNum, reason: `Vehicle ${vehicleNumber} is DELETED. Restore it from Master first.`, data: row });
        continue;
      }

      const existing = await db.getById('fuel_transactions', txnId);
      if (existing) {
        rejected.push({ row: rowNum, reason: 'Duplicate: Transaction ID already processed', data: row });
        continue;
      }

      valid.push({
        txnId,
        terminalId: row['Terminal ID']?.toString(),
        merchantId: row['Merchant ID']?.toString(),
        batchId: row['BatchID / ROC']?.toString(),
        outletName: row['Retail Outlet Name']?.toString() || row['Outlet Name']?.toString() || 'Unknown',
        outletAddress: row['Retail Outlet Address']?.toString(),
        outletLocation: row['Retail Outlet Location']?.toString() || row['Outlet Location']?.toString() || 'Unknown',
        outletCity: row['Retail Outlet City']?.toString(),
        outletDistrict: row['Retail Outlet District']?.toString(),
        state: row['Retail Outlet State']?.toString() || row['State']?.toString() || 'Unknown',
        outletPin: row['Retail Outlet PIN Code']?.toString(),
        outletPan: row['Retail Outlet PAN']?.toString(),
        paymentMode: row['Credit/Debit']?.toString(),
        accountNumber: row['Account Number']?.toString(),
        mobileNumber: row['Mobile No.']?.toString(),
        vehicleNumber,
        txnDateTime: row['Txn Date and Time'] ? new Date(row['Txn Date and Time']).toISOString() : (row['Date Time (YYYY-MM-DD HH:mm)'] ? new Date(row['Date Time (YYYY-MM-DD HH:mm)']).toISOString() : new Date().toISOString()),
        txnType: row['Txn Type']?.toString(),
        source: row['Source']?.toString(),
        product: row['Product']?.toString() || 'HSD',
        pricePerLiter: parseFloat(row['Product per Ltr']) || parseFloat(row['Price']) || 0,
        volume,
        availableVolume: volume,
        serviceCharge: parseFloat(row['Service Charge']) || 0,
        amount,
        discount: parseFloat(row['Discount']) || 0,
        odometer: parseFloat(row['Odometer Reading']) || parseFloat(row['Odometer']) || 0,
        closingBalance: parseFloat(row['Closing Balance']) || 0,
        reconciliationStatus: ReconciliationStatus.UNMATCHED,
        linkedTripId: null,
        createdAt: Date.now()
      });
    }

    return { valid, rejected };
  }
}
