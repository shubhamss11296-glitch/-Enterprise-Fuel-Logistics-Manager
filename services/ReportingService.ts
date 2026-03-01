
import { db } from '../db';
import { Trip, TripStatus, FuelTransaction } from '../types';

export interface DashboardFilters {
  vehicleNumber?: string;
  startDate?: string;
  endDate?: string;
}

export class ReportingService {
  static async getDashboardStats(filters?: DashboardFilters) {
    try {
      let trips = (await db.getAll<Trip>('trips')).filter(t => !t.isDeleted);
      let txns = await db.getAll<FuelTransaction>('fuel_transactions');

      // Apply Filters
      if (filters?.vehicleNumber) {
        trips = trips.filter(t => t.vehicleNumber === filters.vehicleNumber);
        txns = txns.filter(t => t.vehicleNumber === filters.vehicleNumber);
      }
      if (filters?.startDate) {
        const start = new Date(filters.startDate).getTime();
        trips = trips.filter(t => new Date(t.tripDate).getTime() >= start);
        txns = txns.filter(t => new Date(t.txnDateTime).getTime() >= start);
      }
      if (filters?.endDate) {
        const end = new Date(filters.endDate).getTime();
        trips = trips.filter(t => new Date(t.tripDate).getTime() <= end);
        txns = txns.filter(t => new Date(t.txnDateTime).getTime() <= end);
      }

      const totalTrips = trips.length;
      const pendingTrips = trips.filter(t => t.status === TripStatus.PENDING_FOR_CLOSING).length;
      const closedTrips = trips.filter(t => t.status === TripStatus.CLOSED).length;
      const excessTrips = trips.filter(t => t.status === TripStatus.EXCESS).length;
      
      const totalConsumed = trips.reduce((acc, curr) => acc + (curr.consumedFuel || 0), 0);
      const totalDistance = trips.reduce((acc, curr) => acc + (curr.totalKM || 0), 0);
      
      const totalVolume = txns.reduce((acc, curr) => acc + (curr.volume || 0), 0);
      const totalAmount = txns.reduce((acc, curr) => acc + (curr.amount || 0), 0);
      const availablePool = txns.reduce((acc, curr) => acc + (curr.availableVolume || 0), 0);

      // Zero-safe calculations
      const avgFuelPerTrip = totalTrips > 0 ? (totalConsumed / totalTrips).toFixed(1) : "0";
      const costPerKM = totalDistance > 0 ? (totalAmount / totalDistance).toFixed(1) : "0";

      return {
        totalTrips,
        pendingTrips,
        closedTrips,
        excessTrips,
        totalConsumed: Math.round(totalConsumed),
        totalDistance: Math.round(totalDistance),
        totalVolume: Math.round(totalVolume),
        totalAmount: Math.round(totalAmount),
        availablePool: Math.round(availablePool),
        avgFuelPerTrip,
        costPerKM
      };
    } catch (error) {
      console.error("Dashboard calculation failed:", error);
      return {
        totalTrips: 0,
        pendingTrips: 0,
        closedTrips: 0,
        excessTrips: 0,
        totalConsumed: 0,
        totalDistance: 0,
        totalVolume: 0,
        totalAmount: 0,
        availablePool: 0,
        avgFuelPerTrip: "0",
        costPerKM: "0"
      };
    }
  }

  static async getStateWiseReport(filters?: DashboardFilters) {
    const txns = await db.getAll<FuelTransaction>('fuel_transactions');
    let filteredTxns = txns;

    if (filters?.vehicleNumber) {
      filteredTxns = filteredTxns.filter(t => t.vehicleNumber === filters.vehicleNumber);
    }
    if (filters?.startDate) {
      const start = new Date(filters.startDate).getTime();
      filteredTxns = filteredTxns.filter(t => new Date(t.txnDateTime).getTime() >= start);
    }
    if (filters?.endDate) {
      const end = new Date(filters.endDate).getTime();
      filteredTxns = filteredTxns.filter(t => new Date(t.txnDateTime).getTime() <= end);
    }

    const stateMap: Record<string, { volume: number; amount: number }> = {};

    filteredTxns.forEach(txn => {
      const state = txn.state || 'Unknown';
      if (!stateMap[state]) stateMap[state] = { volume: 0, amount: 0 };
      stateMap[state].volume += txn.volume;
      stateMap[state].amount += txn.amount;
    });

    return Object.entries(stateMap).map(([state, data]) => ({
      state,
      volume: Math.round(data.volume),
      amount: Math.round(data.amount)
    })).sort((a, b) => b.amount - a.amount);
  }

  static async getVehiclePerformance() {
    const trips = (await db.getAll<Trip>('trips')).filter(t => !t.isDeleted);
    const vehicles = await db.getAll<any>('vehicles');
    
    return vehicles.map(v => {
      const vTrips = trips.filter(t => t.vehicleNumber === v.vehicleNumber);
      const totalKM = vTrips.reduce((acc, t) => acc + (t.totalKM || 0), 0);
      const totalFuel = vTrips.reduce((acc, t) => acc + (t.consumedFuel || 0), 0);
      return {
        vehicleNumber: v.vehicleNumber,
        totalKM,
        totalFuel,
        actualKMPL: totalFuel > 0 ? (totalKM / totalFuel).toFixed(2) : "0",
        expectedKMPL: ((v.avgLoadedKMPL + v.avgEmptyKMPL) / 2).toFixed(2)
      };
    });
  }
}
