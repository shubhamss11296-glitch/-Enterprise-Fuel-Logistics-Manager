
import { db } from '../db';
import { Vehicle, VehicleStatus, Trip } from '../types';

export class VehicleService {
  static async createVehicle(data: Partial<Vehicle>): Promise<void> {
    if (!data.vehicleNumber) throw new Error('Vehicle Number is required');
    
    const existing = await db.getById<Vehicle>('vehicles', data.vehicleNumber);
    if (existing) throw new Error('Vehicle already exists');

    const vehicle: Vehicle = {
      vehicleNumber: data.vehicleNumber,
      vehicleType: data.vehicleType || 'Unknown',
      fuelCardCompany: data.fuelCardCompany || 'NA',
      avgLoadedKMPL: Number(data.avgLoadedKMPL) || 0,
      avgEmptyKMPL: Number(data.avgEmptyKMPL) || 0,
      status: data.status || VehicleStatus.ACTIVE,
      createdAt: Date.now()
    };

    await db.put('vehicles', vehicle);
  }

  static async updateVehicle(data: Partial<Vehicle>): Promise<void> {
    if (!data.vehicleNumber) throw new Error('Vehicle Number is required for update');
    
    const existing = await db.getById<Vehicle>('vehicles', data.vehicleNumber);
    if (!existing) throw new Error('Vehicle not found');
    if (existing.status === VehicleStatus.DELETED) throw new Error('Cannot edit a deleted vehicle. Restore it first.');

    const updated: Vehicle = {
      ...existing,
      vehicleType: data.vehicleType || existing.vehicleType,
      fuelCardCompany: data.fuelCardCompany || existing.fuelCardCompany,
      avgLoadedKMPL: data.avgLoadedKMPL !== undefined ? Number(data.avgLoadedKMPL) : existing.avgLoadedKMPL,
      avgEmptyKMPL: data.avgEmptyKMPL !== undefined ? Number(data.avgEmptyKMPL) : existing.avgEmptyKMPL,
      status: data.status || existing.status
    };

    await db.put('vehicles', updated);
  }

  static async softDeleteVehicle(vehicleNumber: string, performer: string): Promise<void> {
    const vehicle = await db.getById<Vehicle>('vehicles', vehicleNumber);
    if (!vehicle) throw new Error('Vehicle not found');

    const trips = await db.getByIndex<Trip>('trips', 'vehicleNumber', vehicleNumber);
    const activeTrips = trips.filter(t => !t.isDeleted);
    
    vehicle.status = VehicleStatus.DELETED;
    await db.put('vehicles', vehicle);

    await db.put('audit_logs', {
      logId: crypto.randomUUID(),
      timestamp: Date.now(),
      entityType: 'VEHICLE',
      entityId: vehicleNumber,
      action: 'VEHICLE_SOFT_DELETED',
      reason: activeTrips.length > 0 ? `Archived unit with ${activeTrips.length} manifest records` : 'Decommissioned from master',
      performedBy: performer
    });
  }

  static async restoreVehicle(vehicleNumber: string, performer: string): Promise<void> {
    const vehicle = await db.getById<Vehicle>('vehicles', vehicleNumber);
    if (!vehicle) throw new Error('Vehicle not found');

    vehicle.status = VehicleStatus.INACTIVE;
    await db.put('vehicles', vehicle);

    await db.put('audit_logs', {
      logId: crypto.randomUUID(),
      timestamp: Date.now(),
      entityType: 'VEHICLE',
      entityId: vehicleNumber,
      action: 'VEHICLE_RESTORED',
      reason: 'Record restored to Inactive state for operational audit',
      performedBy: performer
    });
  }

  static async getAllVehicles(): Promise<Vehicle[]> {
    return db.getAll<Vehicle>('vehicles');
  }
}
