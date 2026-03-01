
import { VehicleService } from './VehicleService';
import { TripService } from './TripService';
import { FuelService } from './FuelService';
import { db } from '../db';
import { VehicleStatus } from '../types';

export class SampleDataService {
  /**
   * Enterprise Data Seeder.
   * Creates a scenario: 
   * Trip 1: Takes extra fuel -> EXCESS.
   * Trip 2: Inherits excess fuel -> CLOSED (without pumping extra).
   */
  static async seed() {
    // 1. Vehicles
    const vehicles = [
      {
        vehicleNumber: 'SCF-DEMO-001',
        vehicleType: 'TRUCK-32T',
        fuelCardCompany: 'HPCL-FLEET',
        avgLoadedKMPL: 4.0,
        avgEmptyKMPL: 6.0,
        status: VehicleStatus.ACTIVE
      }
    ];

    for (const v of vehicles) {
      try { await VehicleService.createVehicle(v); } catch(e) {}
    }

    // 2. Trips
    const day1 = '2023-11-01';
    const day2 = '2023-11-02';

    const trips = [
      {
        vehicleNumber: 'SCF-DEMO-001',
        tripDate: day1,
        origin: 'Mumbai Hub',
        destination: 'Pune Hub',
        loadKM: 200, // Req: 200/4 = 50L
        emptyKM: 0,
      },
      {
        vehicleNumber: 'SCF-DEMO-001',
        tripDate: day2,
        origin: 'Pune Hub',
        destination: 'Mumbai Hub',
        loadKM: 80, // Req: 80/4 = 20L
        emptyKM: 0,
      }
    ];

    // Note: createTrip triggers reconciliation, but we'll upload fuel after
    for (const t of trips) {
      await TripService.createTrip(t);
    }

    // 3. Fuel Transaction (One large pump on Day 1)
    const fuelTxns = [
      {
        txnId: 'TXN-DEMO-EXCESS',
        vehicleNumber: 'SCF-DEMO-001',
        txnDateTime: `${day1}T08:30:00Z`,
        outletName: 'Highway Pump #01',
        volume: 70, // 50 required for Trip 1, 20 inherited by Trip 2
        amount: 6650,
        state: 'Maharashtra',
        pricePerLiter: 95
      }
    ];

    // This will trigger the SCF logic: 
    // Trip 1 (50 required) + 70 pumped = 20 EXCESS.
    // Trip 2 (20 required) + 20 Inherited = 0 CLOSED.
    await FuelService.uploadTransactions(fuelTxns);
  }

  static generateCSVTemplate(type: 'trip' | 'fuel') {
    // Legacy support for manual triggers if needed
    console.warn("CSV templates are deprecated. Use XLSX service.");
  }
}
