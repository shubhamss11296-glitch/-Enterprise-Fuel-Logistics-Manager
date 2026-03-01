
import { db } from '../db';
import { FuelTransaction, ReconciliationStatus, AuditLog, FuelAllocation } from '../types';
import { ReconciliationEngine } from './ReconciliationEngine';

export class FuelService {
  static async uploadTransactions(txns: Partial<FuelTransaction>[]): Promise<void> {
    const affectedVehicles = new Set<string>();

    for (const data of txns) {
      if (!data.txnId || !data.vehicleNumber || !data.volume) continue;

      const txn: FuelTransaction = {
        txnId: data.txnId,
        vehicleNumber: data.vehicleNumber,
        txnDateTime: data.txnDateTime || new Date().toISOString(),
        outletName: data.outletName || 'Unknown',
        outletLocation: data.outletLocation || 'Unknown',
        state: data.state || 'Unknown',
        product: data.product || 'HSD',
        pricePerLiter: Number(data.pricePerLiter) || 0,
        volume: Number(data.volume) || 0,
        availableVolume: Number(data.volume) || 0,
        amount: Number(data.amount) || 0,
        odometer: Number(data.odometer) || 0,
        reconciliationStatus: ReconciliationStatus.UNMATCHED,
        linkedTripId: null,
        createdAt: Date.now()
      };

      await db.put('fuel_transactions', txn);
      affectedVehicles.add(txn.vehicleNumber);
    }

    for (const vNum of affectedVehicles) {
      await ReconciliationEngine.reconcileForVehicle(vNum);
    }
  }

  static async getAllTransactions(): Promise<FuelTransaction[]> {
    return db.getAll<FuelTransaction>('fuel_transactions');
  }

  /**
   * DELETE TRANSACTION
   * Allowed ONLY if unmatched and fully available (no remaining allocations).
   */
  static async deleteTransaction(txnId: string, performedBy: string): Promise<void> {
    const txn = await db.getById<FuelTransaction>('fuel_transactions', txnId);
    if (!txn) throw new Error('Transaction not found');

    // Strict Rule: Block delete if transaction has ANY allocations linked
    // We verify both reconciliation status and available volume to ensure it's completely unused
    if (txn.reconciliationStatus !== ReconciliationStatus.UNMATCHED || txn.availableVolume !== txn.volume) {
      throw new Error(`Transaction still partially used in other trips. Deallocate first.`);
    }

    await db.runAtomic(['fuel_transactions', 'audit_logs'], async (tx) => {
      tx.objectStore('fuel_transactions').delete(txnId);
      
      tx.objectStore('audit_logs').add({
        logId: crypto.randomUUID(),
        timestamp: Date.now(),
        entityType: 'FUEL_TXN',
        entityId: txnId,
        action: 'FUEL_TRANSACTION_DELETED_AFTER_DEALLOCATION',
        reason: `Physical record removed from ledger after verifying zero usage`,
        performedBy
      });
    });
  }

  /**
   * FORCE DELETE TRANSACTION WITH ALLOCATIONS
   * Administrative override to unlink and remove a physical record.
   * NOTE: This is an override and should be used with extreme caution.
   */
  static async deleteTransactionWithAllocations(txnId: string, performedBy: string): Promise<void> {
    const txn = await db.getById<FuelTransaction>('fuel_transactions', txnId);
    if (!txn) throw new Error('Transaction record missing');

    const allocations = await db.getByIndex<FuelAllocation>('fuel_allocations', 'txnId', txnId);
    const affectedTripIds = Array.from(new Set(allocations.map(a => a.tripId)));

    await db.runAtomic(['fuel_allocations', 'fuel_transactions', 'trips', 'audit_logs'], async (tx) => {
      // 1. Delete all associated allocations
      for (const alloc of allocations) {
        tx.objectStore('fuel_allocations').delete(alloc.allocationId);
      }

      // 2. Delete the physical transaction
      tx.objectStore('fuel_transactions').delete(txnId);

      // 3. Log the administrative override
      tx.objectStore('audit_logs').add({
        logId: crypto.randomUUID(),
        timestamp: Date.now(),
        entityType: 'FUEL_TXN',
        entityId: txnId,
        action: 'ADMIN_FORCE_DELETE_TXN_WITH_UNLINK',
        reason: `Unlinked from ${affectedTripIds.length} trips and deleted from ledger.`,
        performedBy
      });
    });

    // 4. Recalculate affected trips to update their balance and status
    for (const tripId of affectedTripIds) {
      await ReconciliationEngine.recalcTrip(tripId);
    }
  }
}
