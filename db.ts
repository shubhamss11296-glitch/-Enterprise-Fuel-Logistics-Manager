
import { Vehicle, Trip, FuelTransaction, FuelAllocation, AuditLog, User, TripAttachment } from './types';

const DB_NAME = 'FuelOps_Enterprise_Ledger_v4';
const DB_VERSION = 4; // Incremented for Attachments store

export class Database {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        if (!db.objectStoreNames.contains('vehicles')) {
          db.createObjectStore('vehicles', { keyPath: 'vehicleNumber' });
        }
        
        if (!db.objectStoreNames.contains('trips')) {
          const tripStore = db.createObjectStore('trips', { keyPath: 'tripId' });
          tripStore.createIndex('vehicleNumber', 'vehicleNumber', { unique: false });
          tripStore.createIndex('isDeleted', 'isDeleted', { unique: false });
        }
        
        if (!db.objectStoreNames.contains('fuel_transactions')) {
          const txnStore = db.createObjectStore('fuel_transactions', { keyPath: 'txnId' });
          txnStore.createIndex('vehicleNumber', 'vehicleNumber', { unique: false });
        }

        if (!db.objectStoreNames.contains('fuel_allocations')) {
          const allocStore = db.createObjectStore('fuel_allocations', { keyPath: 'allocationId' });
          allocStore.createIndex('tripId', 'tripId', { unique: false });
          allocStore.createIndex('txnId', 'txnId', { unique: false });
        }

        if (!db.objectStoreNames.contains('audit_logs')) {
          const logStore = db.createObjectStore('audit_logs', { keyPath: 'logId' });
          logStore.createIndex('entityId', 'entityId', { unique: false });
        }

        if (!db.objectStoreNames.contains('users')) {
          db.createObjectStore('users', { keyPath: 'username' });
        }

        if (!db.objectStoreNames.contains('trip_attachments')) {
          const attachmentStore = db.createObjectStore('trip_attachments', { keyPath: 'attachmentId' });
          attachmentStore.createIndex('tripId', 'tripId', { unique: false });
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onerror = () => reject('Database initialization failed');
    });
  }

  private getStore(name: string, mode: IDBTransactionMode = 'readonly') {
    if (!this.db) throw new Error('Database not initialized');
    return this.db.transaction(name, mode).objectStore(name);
  }

  async runAtomic(storeNames: string[], callback: (tx: IDBTransaction) => Promise<void>): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(storeNames, 'readwrite');
      let isFinished = false;

      const finish = (error?: any) => {
        if (isFinished) return;
        isFinished = true;
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      };

      tx.oncomplete = () => finish();
      tx.onerror = () => finish(tx.error || new Error('Transaction failed'));
      tx.onabort = () => finish(new Error('Transaction aborted'));

      callback(tx).catch(err => {
        if (!isFinished) {
          try {
            tx.abort();
          } catch (abortErr) {}
          finish(err);
        }
      });
    });
  }

  async getAll<T>(storeName: string): Promise<T[]> {
    return new Promise((resolve, reject) => {
      const store = this.getStore(storeName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(`Error fetching ${storeName}`);
    });
  }

  async put<T>(storeName: string, data: T): Promise<void> {
    return new Promise((resolve, reject) => {
      const store = this.getStore(storeName, 'readwrite');
      const request = store.put(data);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(`Error saving to ${storeName}`);
    });
  }

  async getById<T>(storeName: string, id: string): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      const store = this.getStore(storeName);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(`Error fetching item from ${storeName}`);
    });
  }

  async delete(storeName: string, id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const store = this.getStore(storeName, 'readwrite');
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(`Error deleting from ${storeName}`);
    });
  }

  async getByIndex<T>(storeName: string, indexName: string, value: any): Promise<T[]> {
    return new Promise((resolve, reject) => {
      const store = this.getStore(storeName);
      const index = store.index(indexName);
      const request = index.getAll(value);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(`Error searching index ${indexName} in ${storeName}`);
    });
  }
}

export const db = new Database();
