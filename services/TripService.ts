
import { db } from '../db';
import { Trip, TripStatus, Vehicle, TripRevision, TripAttachment } from '../types';
import { ReconciliationEngine } from './ReconciliationEngine';
import { AuthService } from './AuthService';

export class TripService {
  static async createTrip(data: Partial<Trip> & { file?: File }, isRevision: boolean = false): Promise<void> {
    if (!data.vehicleNumber || !data.tripDate || data.loadKM === undefined || data.emptyKM === undefined) {
      throw new Error('Incomplete manifest data.');
    }

    const vehicle = await db.getById<Vehicle>('vehicles', data.vehicleNumber);
    if (!vehicle) throw new Error(`Vehicle ${data.vehicleNumber} not found.`);

    const user = AuthService.getCurrentUser();

    // Generate Trip Number: T-{Year}{Month}-{RandomShort}
    const now = new Date();
    const yearMonth = now.toISOString().slice(2, 7).replace('-', '');
    const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
    const tripNo = `T-${yearMonth}-${randomPart}`;

    const loadKM = Number(data.loadKM);
    const emptyKM = Number(data.emptyKM);
    const repoKM = Number(data.repositionKM || 0);
    const totalKM = loadKM + emptyKM + repoKM;
    
    const reqFuel = Math.round((loadKM / vehicle.avgLoadedKMPL) + ((emptyKM + repoKM) / vehicle.avgEmptyKMPL));

    const tripId = crypto.randomUUID();
    let attachmentId: string | undefined = undefined;

    if (data.file) {
      attachmentId = crypto.randomUUID();
      const attachment: TripAttachment = {
        attachmentId,
        tripId,
        fileName: data.file.name,
        fileType: data.file.type,
        fileSize: data.file.size,
        fileData: data.file,
        uploadedBy: user?.username || 'System',
        uploadedAt: Date.now()
      };
      await db.put('trip_attachments', attachment);
    }

    const trip: Trip = {
      tripId,
      tripNo: data.tripNo || tripNo,
      tripDate: data.tripDate,
      vehicleNumber: data.vehicleNumber,
      origin: data.origin || 'N/A',
      destination: data.destination || 'N/A',
      reposition: data.reposition === 'YES' ? 'YES' : 'NO',
      repositionLocation: data.reposition === 'YES' ? (data.repositionLocation || 'Unspecified') : null,
      repositionKM: repoKM,
      driverName: data.driverName || null,
      driverContact: data.driverContact || null,
      loadKM,
      emptyKM,
      totalKM,
      avgLoadedKMPL_snapshot: vehicle.avgLoadedKMPL,
      avgEmptyKMPL_snapshot: vehicle.avgEmptyKMPL,
      requiredFuel: reqFuel,
      consumedFuel: 0,
      balanceFuel: reqFuel,
      status: TripStatus.IN_TRANSIT,
      revisionFlag: isRevision ? 'YES' : 'NO',
      createdAt: Date.now(),
      docUrl: data.docUrl,
      docName: data.docName || (data.file ? data.file.name : undefined),
      attachmentId,
      isDeleted: false,
      revisions: []
    };

    await db.put('trips', trip);
    
    // Auto-Reconciliation on creation
    await ReconciliationEngine.reconcileTrip(trip.tripId);
    await ReconciliationEngine.reconcileForVehicle(trip.vehicleNumber);
  }

  static async softDeleteTrip(tripId: string): Promise<void> {
    const trip = await db.getById<Trip>('trips', tripId);
    if (!trip) throw new Error('Trip not found.');
    
    trip.isDeleted = true;
    trip.deletedAt = Date.now();
    trip.deletedBy = AuthService.getCurrentUser()?.username || 'System Admin';
    
    await db.put('trips', trip);
    await ReconciliationEngine.reconcileForVehicle(trip.vehicleNumber);
  }

  static async forceCloseTrip(tripId: string): Promise<void> {
    const trip = await db.getById<Trip>('trips', tripId);
    if (!trip) throw new Error('Trip not found.');
    
    const balance = trip.requiredFuel - trip.consumedFuel;
    
    if (balance !== 0) {
      await ReconciliationEngine.addAdjustment(
        tripId, 
        balance, 
        `Audit Settlement: Force closing manifest with ${balance}L variance`
      );
    } else {
      trip.auditClose = true;
      await db.put('trips', trip);
      await ReconciliationEngine.reconcileForVehicle(trip.vehicleNumber);
    }
  }

  static async getAllTrips(): Promise<Trip[]> {
    const trips = await db.getAll<Trip>('trips');
    return trips.filter(t => !t.isDeleted).sort((a, b) => b.createdAt - a.createdAt);
  }

  static async bulkCreateTrips(rows: Partial<Trip>[]): Promise<void> {
    for (const row of rows) {
      await this.createTrip(row);
    }
  }

  static async reviseTrip(originalTripId: string, updatedData: Partial<Trip> & { file?: File }): Promise<void> {
    const original = await db.getById<Trip>('trips', originalTripId);
    if (!original) throw new Error('Reference trip missing.');

    const user = AuthService.getCurrentUser();
    const revisionId = crypto.randomUUID();

    let newAttachmentId: string | undefined = undefined;
    if (updatedData.file) {
      newAttachmentId = crypto.randomUUID();
      const attachment: TripAttachment = {
        attachmentId: newAttachmentId,
        tripId: originalTripId,
        revisionId,
        fileName: updatedData.file.name,
        fileType: updatedData.file.type,
        fileSize: updatedData.file.size,
        fileData: updatedData.file,
        uploadedBy: user?.username || 'System',
        uploadedAt: Date.now()
      };
      await db.put('trip_attachments', attachment);
    }

    // 1. Create a snapshot of current state for history
    const revision: TripRevision = {
      revisionId,
      timestamp: Date.now(),
      loadKM: original.loadKM,
      emptyKM: original.emptyKM,
      repositionKM: original.repositionKM || 0,
      requiredFuel: original.requiredFuel,
      docUrl: original.docUrl,
      docName: original.docName,
      attachmentId: original.attachmentId,
      revisedBy: user?.username || 'System'
    };

    // 2. Prepare merged data while keeping ID stable
    const loadKM = Number(updatedData.loadKM ?? original.loadKM);
    const emptyKM = Number(updatedData.emptyKM ?? original.emptyKM);
    const repoKM = Number(updatedData.repositionKM ?? original.repositionKM ?? 0);
    const totalKM = loadKM + emptyKM + repoKM;
    
    // Recalculate based on original vehicle snapshot to maintain consistency
    const reqFuel = Math.round((loadKM / original.avgLoadedKMPL_snapshot) + ((emptyKM + repoKM) / original.avgEmptyKMPL_snapshot));

    const updatedTrip: Trip = {
      ...original,
      ...updatedData,
      tripId: original.tripId, // CRITICAL: Keep ID stable to maintain fuel links
      loadKM,
      emptyKM,
      repositionKM: repoKM,
      totalKM,
      requiredFuel: reqFuel,
      reposition: updatedData.reposition || original.reposition,
      repositionLocation: updatedData.reposition === 'YES' ? updatedData.repositionLocation : null,
      revisionFlag: 'YES',
      auditClose: false, // BUG FIX: Reset closure flag upon revision to force re-verification
      attachmentId: newAttachmentId || original.attachmentId,
      docName: updatedData.file ? updatedData.file.name : (updatedData.docName || original.docName),
      revisions: [...(original.revisions || []), revision]
    };

    await db.put('trips', updatedTrip);

    // 3. Trigger re-reconciliation as the fuel requirement has likely changed
    await ReconciliationEngine.recalcTrip(updatedTrip.tripId);
    await ReconciliationEngine.reconcileTrip(updatedTrip.tripId);
  }
}
