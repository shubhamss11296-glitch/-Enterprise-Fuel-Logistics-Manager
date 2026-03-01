
import { Trip, FuelTransaction, TripStatus, ReconciliationStatus, FuelAllocation, AllocationType, AuditLog } from '../types';
import { db } from '../db';

const TOLERANCE_LIMIT = 3; // Updated from 10 to 3 as per new enterprise policy

export class ReconciliationEngine {
  /**
   * RECALCULATE TRIP METRICS (Source of Truth)
   * Strictly derives consumedFuel and balanceFuel from the allocation ledger.
   */
  static async recalcTrip(tripId: string): Promise<Trip | undefined> {
    const trip = await db.getById<Trip>('trips', tripId);
    if (!trip || trip.isDeleted) return;

    // Strict Accounting Formula: ConsumedFuel = SUM(allocations)
    const allocs = await db.getByIndex<FuelAllocation>('fuel_allocations', 'tripId', tripId);
    const totalConsumed = allocs.reduce((sum, a) => sum + a.allocatedVolume, 0);

    trip.consumedFuel = Math.round(totalConsumed * 100) / 100;
    trip.balanceFuel = Math.round((trip.requiredFuel - trip.consumedFuel) * 100) / 100;

    /**
     * ATOMIC STATUS RESOLUTION LOGIC
     * 1. Manual Audit (auditClose) is the ONLY way to reach CLOSED.
     * 2. Significant negative balance (< -3L) results in EXCESS.
     * 3. Any activity (consumedFuel > 0) or Revision (revisionFlag) results in PENDING_FOR_CLOSING.
     * 4. No activity results in IN_TRANSIT.
     */
    if (trip.auditClose) {
      trip.status = TripStatus.CLOSED;
    } else if (trip.balanceFuel < -3) { 
      // Negative balance exceeding 3L tolerance
      trip.status = TripStatus.EXCESS;
    } else if (trip.consumedFuel > 0 || trip.revisionFlag === 'YES') {
      // Trip has fuel paired OR has been revised - requires manual audit to close
      trip.status = TripStatus.PENDING_FOR_CLOSING;
    } else {
      // New trip with no fuel linked yet
      trip.status = TripStatus.IN_TRANSIT;
    }

    await db.put('trips', trip);
    return trip;
  }

  /**
   * RECONCILE TRIP (Idempotent & Atomic)
   * Automatically pairs required fuel from the transaction pool.
   */
  static async reconcileTrip(tripId: string) {
    const trip = await db.getById<Trip>('trips', tripId);
    if (!trip || trip.isDeleted || (trip.status === TripStatus.CLOSED && !trip.revisionFlag)) return;

    const existingAllocs = await db.getByIndex<FuelAllocation>('fuel_allocations', 'tripId', tripId);
    let currentConsumed = existingAllocs.reduce((sum, a) => sum + a.allocatedVolume, 0);
    let deficit = Math.round((trip.requiredFuel - currentConsumed) * 100) / 100;

    // If already satisfied or over-allocated, stop
    if (deficit <= 0) {
      await this.recalcTrip(tripId);
      return;
    }

    // 1. Strict FIFO matching from Transaction Pool
    const eligibleTxns = await this.getEligibleTransactions(trip);
    
    for (const txn of eligibleTxns) {
      if (deficit <= 0) break;

      // Skip if this txn is already linked to this trip to avoid duplicates
      const alreadyLinked = existingAllocs.some(a => a.txnId === txn.txnId);
      if (alreadyLinked) continue;

      const available = await this.calculateTxnAvailableVolume(txn);
      if (available <= 0) continue;

      const take = Math.round(Math.min(available, deficit) * 100) / 100;
      if (take <= 0) continue;

      await db.runAtomic(['fuel_allocations', 'fuel_transactions', 'trips'], async (tx) => {
        const autoAlloc: FuelAllocation = {
          allocationId: `AUTO-${crypto.randomUUID()}`,
          tripId,
          txnId: txn.txnId,
          allocatedVolume: take,
          type: AllocationType.NORMAL,
          createdAt: Date.now(),
          isManual: false
        };
        tx.objectStore('fuel_allocations').add(autoAlloc);
        
        // Update local loop state
        currentConsumed += take;
        deficit = Math.round((deficit - take) * 100) / 100;

        // Sync Txn status immediately in-transaction if possible, or after loop
        txn.availableVolume = Math.round((available - take) * 100) / 100;
        if (txn.availableVolume <= 0) {
          txn.reconciliationStatus = ReconciliationStatus.MATCHED;
        } else {
          txn.reconciliationStatus = ReconciliationStatus.PARTIAL;
        }
        tx.objectStore('fuel_transactions').put(txn);
      });
    }

    // 2. Tolerance Settlement (Optional buffer for minor differences)
    if (deficit > 0 && deficit <= TOLERANCE_LIMIT) {
      const toleranceApplied = (await db.getByIndex<FuelAllocation>('fuel_allocations', 'tripId', tripId))
        .some(a => a.type === AllocationType.TOLERANCE_ADJUSTMENT);
      
      if (!toleranceApplied) {
        const tolAlloc: FuelAllocation = {
          allocationId: `TOL-${tripId}-${Date.now()}`,
          tripId,
          txnId: 'ADJUSTMENT',
          allocatedVolume: deficit,
          type: AllocationType.TOLERANCE_ADJUSTMENT,
          createdAt: Date.now(),
          isManual: false
        };
        await db.put('fuel_allocations', tolAlloc);
      }
    }

    await this.recalcTrip(tripId);
  }

  /**
   * SETTLE VARIANCE (Confirm Close)
   * Manually settles the remaining variance and transitions status to CLOSED.
   */
  static async settleVariance(tripId: string) {
    const trip = await db.getById<Trip>('trips', tripId);
    if (!trip) throw new Error('Trip manifest not found');

    const balance = Math.round((trip.requiredFuel - trip.consumedFuel) * 100) / 100;
    
    // Safety check for tolerance rules (strictly 3L)
    if (Math.abs(balance) > 3) {
      throw new Error(`Variance exceeds 3L allowable limit.`);
    }

    // If there is a minor variance (shortage or excess within 3L), settle it with a tolerance adjustment
    if (balance !== 0) {
      const allocId = `TOL-M-${tripId}-${Date.now()}`;
      const tolAlloc: FuelAllocation = {
        allocationId: allocId,
        tripId,
        txnId: 'ADJUSTMENT',
        allocatedVolume: balance,
        type: AllocationType.TOLERANCE_ADJUSTMENT,
        createdAt: Date.now(),
        isManual: false
      };
      await db.put('fuel_allocations', tolAlloc);
    }

    // Explicitly mark as manually closed/audited to transition status
    trip.auditClose = true;
    await db.put('trips', trip);
    await this.recalcTrip(tripId);
  }

  static async reconcileForVehicle(vehicleNumber: string) {
    if (!vehicleNumber) return;
    const allTrips = await db.getAll<Trip>('trips');
    const vehicleTrips = allTrips
      .filter(t => t.vehicleNumber === vehicleNumber && !t.isDeleted)
      .sort((a, b) => new Date(a.tripDate).getTime() - new Date(b.tripDate).getTime());

    for (const trip of vehicleTrips) {
      // Re-reconcile only if not closed or if we want to ensure FIFO across everything
      if (trip.status !== TripStatus.CLOSED || trip.revisionFlag === 'YES') {
        await this.reconcileTrip(trip.tripId);
      }
    }
  }

  static async manualLink(tripId: string, txnId: string, volume: number, reason: string) {
    const trip = await db.getById<Trip>('trips', tripId);
    const txn = await db.getById<FuelTransaction>('fuel_transactions', txnId);
    if (!trip || !txn) throw new Error('Data reference mismatch');
    if (txn.vehicleNumber !== trip.vehicleNumber) throw new Error(`Vehicle Mismatch`);

    const available = await this.calculateTxnAvailableVolume(txn);
    const requested = Math.round(volume * 100) / 100;
    
    // Allow manual pairing even if it exceeds trip requirement (user knows best)
    // but check if txn has that much volume available
    if (requested > available) throw new Error(`Over-allocation: Transaction only has ${available}L available.`);

    const allocId = `MANUAL-L-${crypto.randomUUID()}`;
    await db.runAtomic(['fuel_allocations', 'fuel_transactions', 'audit_logs', 'trips'], async (tx) => {
      const alloc: FuelAllocation = {
        allocationId: allocId,
        tripId,
        txnId,
        allocatedVolume: requested,
        type: AllocationType.MANUAL_ADJUSTMENT,
        createdAt: Date.now(),
        isManual: true
      };
      tx.objectStore('fuel_allocations').add(alloc);
      tx.objectStore('audit_logs').add({
        logId: crypto.randomUUID(),
        timestamp: Date.now(),
        entityType: 'ALLOCATION',
        entityId: allocId,
        action: 'MANUAL_LINK',
        reason: reason || 'Manual link override',
        performedBy: 'Fleet Controller'
      });
      
      // Update transaction status
      txn.availableVolume = Math.round((available - requested) * 100) / 100;
      if (txn.availableVolume <= 0) {
        txn.reconciliationStatus = ReconciliationStatus.MATCHED;
      } else {
        txn.reconciliationStatus = ReconciliationStatus.PARTIAL;
      }
      tx.objectStore('fuel_transactions').put(txn);
    });

    await this.recalcTrip(tripId);
    // Don't auto-reconcile other trips immediately to avoid changing manual overrides
  }

  static async addAdjustment(tripId: string, volume: number, reason: string) {
    const trip = await db.getById<Trip>('trips', tripId);
    if (!trip) throw new Error('Trip manifest not found');

    const allocId = `MANUAL-A-${tripId}-${Date.now()}`;
    await db.runAtomic(['fuel_allocations', 'audit_logs', 'trips'], async (tx) => {
      const alloc: FuelAllocation = {
        allocationId: allocId,
        tripId,
        txnId: 'MANUAL_ENTRY',
        allocatedVolume: Math.round(volume * 100) / 100,
        type: AllocationType.MANUAL_ADJUSTMENT,
        createdAt: Date.now(),
        isManual: true
      };
      tx.objectStore('fuel_allocations').add(alloc);
      tx.objectStore('audit_logs').add({
        logId: crypto.randomUUID(),
        timestamp: Date.now(),
        entityType: 'ALLOCATION',
        entityId: allocId,
        action: 'MANUAL_ADJUSTMENT_POSTED',
        reason: reason || 'Audit variance correction',
        performedBy: 'Fleet Controller'
      });
    });

    await this.recalcTrip(tripId);
  }

  static async syncTransactionStatus(txn: FuelTransaction) {
    const allocations = await db.getByIndex<FuelAllocation>('fuel_allocations', 'txnId', txn.txnId);
    const used = allocations.reduce((sum, a) => sum + a.allocatedVolume, 0);
    const available = Math.round((txn.volume - used) * 100) / 100;
    
    txn.availableVolume = Math.max(0, available);
    if (txn.availableVolume <= 0) {
      txn.reconciliationStatus = ReconciliationStatus.MATCHED;
    } else if (txn.availableVolume < txn.volume) {
      txn.reconciliationStatus = ReconciliationStatus.PARTIAL;
    } else {
      txn.reconciliationStatus = ReconciliationStatus.UNMATCHED;
      txn.linkedTripId = null;
    }
    await db.put('fuel_transactions', txn);
  }

  static async calculateTxnAvailableVolume(txn: FuelTransaction): Promise<number> {
    const allocations = await db.getByIndex<FuelAllocation>('fuel_allocations', 'txnId', txn.txnId);
    const used = allocations.reduce((sum, a) => sum + a.allocatedVolume, 0);
    return Math.max(0, Math.round((txn.volume - used) * 100) / 100);
  }

  private static async getPreviousTrip(currentTrip: Trip): Promise<Trip | undefined> {
    const allTrips = await db.getAll<Trip>('trips');
    const sorted = allTrips
      .filter(t => t.vehicleNumber === currentTrip.vehicleNumber && !t.isDeleted)
      .sort((a, b) => new Date(a.tripDate).getTime() - new Date(b.tripDate).getTime());
    const index = sorted.findIndex(t => t.tripId === currentTrip.tripId);
    return index > 0 ? sorted[index - 1] : undefined;
  }

  private static async getEligibleTransactions(trip: Trip): Promise<FuelTransaction[]> {
    const allTxns = await db.getAll<FuelTransaction>('fuel_transactions');
    return allTxns
      .filter(txn => txn.vehicleNumber === trip.vehicleNumber && txn.reconciliationStatus !== ReconciliationStatus.MATCHED)
      .sort((a, b) => new Date(a.txnDateTime).getTime() - new Date(b.txnDateTime).getTime());
  }

  static async removeAllocation(allocationId: string, performedBy: string = 'Admin') {
    const alloc = await db.getById<FuelAllocation>('fuel_allocations', allocationId);
    if (!alloc) throw new Error('Allocation record not found');

    const trip = await db.getById<Trip>('trips', alloc.tripId);
    if (!trip) throw new Error('Parent trip manifest not found');

    // RULE: Removal only allowed if trip is CLOSED
    if (trip.status !== TripStatus.CLOSED) {
      throw new Error(`Trip must be CLOSED to modify allocations (Rule: Restricted controlled removal)`);
    }

    const tripId = alloc.tripId;
    const txnId = alloc.txnId;

    await db.runAtomic(['fuel_allocations', 'fuel_transactions', 'trips', 'audit_logs'], async (tx) => {
      tx.objectStore('fuel_allocations').delete(allocationId);
      
      // Audit Log for Allocation Removal
      tx.objectStore('audit_logs').add({
        logId: crypto.randomUUID(),
        timestamp: Date.now(),
        entityType: 'ALLOCATION',
        entityId: allocationId,
        action: 'ALLOCATION_REMOVED_FROM_CLOSED_TRIP',
        reason: `Controlled removal of allocation from CLOSED trip ${trip.tripNo}`,
        performedBy
      });
    });

    // Restore transaction availability
    if (txnId && txnId !== 'VIRTUAL_CARRY' && txnId !== 'ADJUSTMENT' && txnId !== 'MANUAL_ENTRY') {
      const txn = await db.getById<FuelTransaction>('fuel_transactions', txnId as string);
      if (txn) await this.syncTransactionStatus(txn);
    }

    // Recalculate trip metrics ONLY for the affected trip
    await this.recalcTrip(tripId);
  }
}
