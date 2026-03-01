
import { db } from '../db';
import { User, UserRole, UserPermissions, AuditLog } from '../types';

export class AuthService {
  private static SESSION_KEY = 'fuelops_session';

  /**
   * Simple hashing for demo purposes (production would use bcrypt on server)
   */
  private static async hash(text: string): Promise<string> {
    const msgUint8 = new TextEncoder().encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  static async ensureDefaultAdmin(): Promise<void> {
    const users = await db.getAll<User>('users');
    if (users.length === 0) {
      const passwordHash = await this.hash('admin123');
      const admin: User = {
        username: 'admin',
        fullName: 'Root System Administrator',
        passwordHash,
        role: UserRole.SUPER_ADMIN,
        status: 'ACTIVE',
        permissions: {
          dashboard: true,
          vehicles: true,
          trips: true,
          fuel: true,
          analytics: true,
          admin: true
        },
        createdAt: Date.now()
      };
      await db.put('users', admin);
      console.log('Production Root Admin provisioned: admin / admin123');
    }
  }

  static async login(username: string, password: string): Promise<User> {
    const user = await db.getById<User>('users', username);
    if (!user) throw new Error('Invalid credentials');
    if (user.status === 'DISABLED') throw new Error('Account suspended. Contact Security Admin.');

    const providedHash = await this.hash(password);
    if (user.passwordHash !== providedHash) throw new Error('Invalid credentials');

    user.lastLogin = Date.now();
    await db.put('users', user);

    localStorage.setItem(this.SESSION_KEY, JSON.stringify(user));

    await db.put('audit_logs', {
      logId: crypto.randomUUID(),
      timestamp: Date.now(),
      entityType: 'USER',
      entityId: username,
      action: 'LOGIN_SUCCESS',
      reason: `User ${username} started an active session`,
      performedBy: username
    });

    return user;
  }

  static logout() {
    const user = this.getCurrentUser();
    if (user) {
      db.put('audit_logs', {
        logId: crypto.randomUUID(),
        timestamp: Date.now(),
        entityType: 'USER',
        entityId: user.username,
        action: 'LOGOUT_SUCCESS',
        reason: `User ${user.username} terminated the session`,
        performedBy: user.username
      });
    }
    localStorage.removeItem(this.SESSION_KEY);
  }

  static getCurrentUser(): User | null {
    const session = localStorage.getItem(this.SESSION_KEY);
    return session ? JSON.parse(session) : null;
  }

  static async createUser(data: Partial<User>, creator: string): Promise<void> {
    if (!data.username || !data.passwordHash) throw new Error('Identity UID and Access Key required');
    
    const existing = await db.getById<User>('users', data.username);
    if (existing) throw new Error('Identity UID already in use');

    const newUser: User = {
      username: data.username,
      fullName: data.fullName || data.username,
      passwordHash: await this.hash(data.passwordHash),
      role: data.role || UserRole.VIEWER,
      status: 'ACTIVE',
      assignedVehicles: data.assignedVehicles || [],
      permissions: data.permissions || {
        dashboard: true,
        vehicles: false,
        trips: false,
        fuel: false,
        analytics: true,
        admin: false
      },
      createdAt: Date.now()
    };

    await db.put('users', newUser);

    await db.put('audit_logs', {
      logId: crypto.randomUUID(),
      timestamp: Date.now(),
      entityType: 'USER',
      entityId: newUser.username,
      action: 'USER_PROVISIONED',
      reason: `New identity created with role ${newUser.role}`,
      performedBy: creator
    });
  }

  static async updateUser(username: string, updates: Partial<User>, performer: string): Promise<void> {
    const user = await db.getById<User>('users', username);
    if (!user) throw new Error('Identity not found');

    if (updates.passwordHash) {
      updates.passwordHash = await this.hash(updates.passwordHash);
    }

    const updatedUser = { ...user, ...updates };
    await db.put('users', updatedUser);

    await db.put('audit_logs', {
      logId: crypto.randomUUID(),
      timestamp: Date.now(),
      entityType: 'USER',
      entityId: username,
      action: 'USER_METADATA_UPDATED',
      reason: `Updated: ${Object.keys(updates).filter(k => k !== 'passwordHash').join(', ')}`,
      performedBy: performer
    });
  }

  static async resetPassword(username: string, newPass: string, performer: string): Promise<void> {
    const hash = await this.hash(newPass);
    await this.updateUser(username, { passwordHash: hash }, performer);
    
    await db.put('audit_logs', {
      logId: crypto.randomUUID(),
      timestamp: Date.now(),
      entityType: 'USER',
      entityId: username,
      action: 'PASSWORD_RESET',
      reason: `Administrative password reset enforced`,
      performedBy: performer
    });
  }

  static async getAllUsers(): Promise<User[]> {
    return db.getAll<User>('users');
  }

  /**
   * Granular permission checking
   */
  static canAccessModule(user: User, module: keyof UserPermissions): boolean {
    if (user.role === UserRole.SUPER_ADMIN) return true;
    return user.permissions[module] === true;
  }

  static async canAccessVehicle(user: User, vehicleNumber: string): Promise<boolean> {
    if (user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN) return true;
    if (!user.assignedVehicles || user.assignedVehicles.length === 0) return true;
    return user.assignedVehicles.includes(vehicleNumber);
  }
}
