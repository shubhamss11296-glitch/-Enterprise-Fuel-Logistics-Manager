
export enum VehicleStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  DELETED = 'DELETED'
}

export enum TripStatus {
  IN_TRANSIT = 'IN_TRANSIT',
  PENDING_FOR_CLOSING = 'PENDING_FOR_CLOSING',
  CLOSED = 'CLOSED',
  EXCESS = 'EXCESS'
}

export enum ReconciliationStatus {
  UNMATCHED = 'UNMATCHED',
  PARTIAL = 'PARTIAL',
  MATCHED = 'MATCHED'
}

export enum AllocationType {
  NORMAL = 'NORMAL',
  EXCESS_CARRY = 'EXCESS_CARRY',
  MANUAL_ADJUSTMENT = 'MANUAL_ADJUSTMENT',
  TOLERANCE_ADJUSTMENT = 'TOLERANCE_ADJUSTMENT'
}

export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  OPERATOR = 'OPERATOR',
  VIEWER = 'VIEWER'
}

export interface UserPermissions {
  dashboard: boolean;
  vehicles: boolean;
  trips: boolean;
  fuel: boolean;
  analytics: boolean;
  admin: boolean;
}

export interface User {
  username: string; // Primary Key
  passwordHash: string;
  role: UserRole;
  fullName: string;
  status: 'ACTIVE' | 'DISABLED';
  assignedVehicles?: string[]; // Empty means access to all
  permissions: UserPermissions; // Module-level access control
  createdAt: number;
  lastLogin?: number;
}

export interface AuditLog {
  logId: string;
  timestamp: number;
  entityType: 'TRIP' | 'FUEL_TXN' | 'ALLOCATION' | 'USER' | 'VEHICLE' | 'SYSTEM';
  entityId: string;
  action: string;
  reason: string;
  performedBy: string;
}

export interface Vehicle {
  vehicleNumber: string;
  vehicleType: string;
  fuelCardCompany: string;
  avgLoadedKMPL: number;
  avgEmptyKMPL: number;
  status: VehicleStatus;
  createdAt: number;
}

export interface FuelAllocation {
  allocationId: string;
  tripId: string;
  txnId: string | 'VIRTUAL_CARRY' | 'ADJUSTMENT';
  allocatedVolume: number;
  type: AllocationType;
  createdAt: number;
  isManual?: boolean;
}

export interface TripAttachment {
  attachmentId: string;
  tripId: string;
  revisionId?: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  fileData: Blob | string; // Stored as Blob in IndexedDB
  uploadedBy: string;
  uploadedAt: number;
}

export interface TripRevision {
  revisionId: string;
  timestamp: number;
  loadKM: number;
  emptyKM: number;
  repositionKM?: number;
  requiredFuel: number;
  docUrl?: string; // Legacy URL support
  docName?: string;
  attachmentId?: string; // Link to new attachment store
  revisedBy: string;
}

export interface Trip {
  tripId: string;
  tripNo: string; // Visible Unique ID
  tripDate: string; 
  vehicleNumber: string;
  origin: string;
  destination: string;
  reposition: 'YES' | 'NO';
  repositionLocation: string | null;
  repositionKM?: number;
  driverName: string | null;
  driverContact: string | null;
  loadKM: number;
  emptyKM: number;
  totalKM: number;
  avgLoadedKMPL_snapshot: number;
  avgEmptyKMPL_snapshot: number;
  requiredFuel: number; 
  consumedFuel: number;
  balanceFuel: number;
  status: TripStatus;
  revisionFlag: 'YES' | 'NO';
  createdAt: number;
  auditClose?: boolean;
  docUrl?: string; // Legacy
  docName?: string;
  attachmentId?: string; // Link to latest attachment
  isDeleted?: boolean;
  deletedAt?: number;
  deletedBy?: string;
  revisions?: TripRevision[];
}

export interface FuelTransaction {
  txnId: string;
  terminalId?: string;
  merchantId?: string;
  batchId?: string;
  outletName: string;
  outletAddress?: string;
  outletLocation: string;
  outletCity?: string;
  outletDistrict?: string;
  state: string;
  outletPin?: string;
  outletPan?: string;
  paymentMode?: string;
  accountNumber?: string;
  mobileNumber?: string;
  vehicleNumber: string;
  txnDateTime: string;
  txnType?: string;
  source?: string;
  product: string;
  pricePerLiter: number;
  volume: number;
  availableVolume: number;
  serviceCharge?: number;
  amount: number;
  discount?: number;
  odometer: number;
  closingBalance?: number;
  reconciliationStatus: ReconciliationStatus;
  linkedTripId: string | null;
  createdAt: number;
}

export interface RejectedRow {
  row: number;
  column?: string;
  reason: string;
  data: any;
}

export interface UploadResult {
  acceptedCount: number;
  rejected: RejectedRow[];
  totalRows: number;
}
