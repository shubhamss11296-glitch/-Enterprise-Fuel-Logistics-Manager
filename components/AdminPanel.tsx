
import React, { useState, useEffect } from 'react';
import { AuthService } from '../services/AuthService';
import { User, UserRole, UserPermissions, AuditLog } from '../types';
// Fix: Added missing 'X' icon import
import { UserPlus, Shield, UserX, UserCheck, Key, Search, Trash2, Edit3, History, ShieldAlert, CheckSquare, Square, Lock, Activity, Users, Settings, X } from 'lucide-react';
import { db } from '../db';

const AdminPanel: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'users' | 'audit' | 'system'>('users');
  const [users, setUsers] = useState<User[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [currentUser] = useState(AuthService.getCurrentUser());
  
  const [formData, setFormData] = useState({
    username: '',
    fullName: '',
    password: '',
    role: UserRole.VIEWER,
    assignedVehicles: '',
    permissions: {
      dashboard: true,
      vehicles: false,
      trips: false,
      fuel: false,
      analytics: true,
      admin: false
    }
  });

  const loadData = async () => {
    setUsers(await AuthService.getAllUsers());
    const logs = await db.getAll<AuditLog>('audit_logs');
    setAuditLogs(logs.sort((a, b) => b.timestamp - a.timestamp).slice(0, 100));
  };

  useEffect(() => { loadData(); }, []);

  const handleProvision = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editUser) {
        const updates: Partial<User> = {
          fullName: formData.fullName,
          role: formData.role,
          permissions: formData.permissions,
          assignedVehicles: formData.assignedVehicles ? formData.assignedVehicles.split(',').map(v => v.trim()) : []
        };
        if (formData.password) {
          await AuthService.resetPassword(editUser.username, formData.password, currentUser?.username || 'System');
        }
        await AuthService.updateUser(editUser.username, updates, currentUser?.username || 'System');
      } else {
        await AuthService.createUser({
          username: formData.username,
          fullName: formData.fullName,
          passwordHash: formData.password,
          role: formData.role,
          permissions: formData.permissions,
          assignedVehicles: formData.assignedVehicles ? formData.assignedVehicles.split(',').map(v => v.trim()) : []
        }, currentUser?.username || 'System');
      }
      
      closeModal();
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const openEdit = (user: User) => {
    setEditUser(user);
    setFormData({
      username: user.username,
      fullName: user.fullName,
      password: '',
      role: user.role,
      assignedVehicles: user.assignedVehicles?.join(', ') || '',
      permissions: user.permissions
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditUser(null);
    setFormData({
      username: '',
      fullName: '',
      password: '',
      role: UserRole.VIEWER,
      assignedVehicles: '',
      permissions: {
        dashboard: true,
        vehicles: false,
        trips: false,
        fuel: false,
        analytics: true,
        admin: false
      }
    });
  };

  const toggleUserStatus = async (user: User) => {
    if (user.role === UserRole.SUPER_ADMIN) return alert('Protected: Root admin status cannot be toggled');
    const newStatus = user.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    await AuthService.updateUser(user.username, { status: newStatus as any }, currentUser?.username || 'System');
    loadData();
  };

  const deleteUser = async (username: string) => {
    if (username === 'admin') return alert('Protected: Cannot delete root identity');
    if (!confirm(`Permanently purge identity ${username} from governance?`)) return;
    await db.delete('users', username);
    loadData();
  };

  const togglePermission = (key: keyof UserPermissions) => {
    setFormData({
      ...formData,
      permissions: {
        ...formData.permissions,
        [key]: !formData.permissions[key]
      }
    });
  };

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-slate-900 p-8 rounded-[2.5rem] text-white shadow-2xl">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Shield className="text-blue-400" size={32} />
            <h2 className="text-3xl font-black uppercase tracking-tight">Governance Console</h2>
          </div>
          <p className="text-slate-400 text-sm font-bold uppercase tracking-widest">Enterprise Access & Operational Compliance</p>
        </div>
        <div className="flex bg-slate-800 p-1 rounded-2xl border border-slate-700">
          <button onClick={() => setActiveSubTab('users')} className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeSubTab === 'users' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}>Identity Pool</button>
          <button onClick={() => setActiveSubTab('audit')} className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeSubTab === 'audit' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}>Security Audit</button>
          <button onClick={() => setActiveSubTab('system')} className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeSubTab === 'system' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}>Policy Engine</button>
        </div>
      </div>

      {activeSubTab === 'users' && (
        <div className="grid grid-cols-1 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex justify-between items-center mb-2">
             <div className="flex items-center gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                  <input type="text" placeholder="Filter Identities..." className="pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:ring-4 focus:ring-blue-500/10 font-bold w-64 shadow-sm" />
                </div>
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex gap-4">
                  <span className="flex items-center gap-1.5"><Users size={12}/> {users.length} Active Accounts</span>
                  <span className="flex items-center gap-1.5"><Activity size={12}/> {auditLogs.length} Events Logged</span>
                </div>
             </div>
             <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-blue-700 shadow-xl shadow-blue-500/20 transition-all"><UserPlus size={18} /> Provision Identity</button>
          </div>

          <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-[10px] text-slate-500 uppercase font-black tracking-widest border-b border-slate-100">
                  <tr>
                    <th className="px-8 py-5">Identity (UID)</th>
                    <th className="px-8 py-5">Role Classification</th>
                    <th className="px-8 py-5">Module Access Matrix</th>
                    <th className="px-8 py-5">Fleet Restriction</th>
                    <th className="px-8 py-5 text-center">Lifecycle</th>
                    <th className="px-8 py-5 text-right">Operations</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {users.map(user => (
                    <tr key={user.username} className="hover:bg-slate-50/80 transition-colors group">
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-4">
                          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black text-xs uppercase shadow-sm ${user.role === UserRole.SUPER_ADMIN ? 'bg-slate-900 text-white' : 'bg-blue-50 text-blue-600'}`}>
                            {user.username.slice(0,2)}
                          </div>
                          <div>
                            <div className="font-black text-slate-900 text-sm tracking-tight">{user.fullName}</div>
                            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">@{user.username}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-5">
                        <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase border tracking-widest flex items-center gap-1.5 w-fit ${
                          user.role === UserRole.SUPER_ADMIN ? 'bg-slate-900 text-white border-slate-900' :
                          user.role === UserRole.ADMIN ? 'bg-blue-50 text-blue-600 border-blue-100' :
                          user.role === UserRole.MANAGER ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                          'bg-slate-50 text-slate-500 border-slate-200'
                        }`}>
                          {user.role === UserRole.SUPER_ADMIN && <ShieldAlert size={10}/>}
                          {user.role}
                        </span>
                      </td>
                      <td className="px-8 py-5">
                        <div className="flex gap-1">
                          {Object.entries(user.permissions).map(([mod, active]) => (
                            <div key={mod} className={`w-2 h-2 rounded-full ${active ? 'bg-emerald-500' : 'bg-slate-200'}`} title={`${mod}: ${active ? 'Allowed' : 'Denied'}`} />
                          ))}
                        </div>
                        <div className="text-[7px] text-slate-400 font-black uppercase mt-1 tracking-tighter">D | V | T | F | A | Adm</div>
                      </td>
                      <td className="px-8 py-5">
                        <div className="text-[10px] font-bold text-slate-600 uppercase tracking-tight bg-slate-100 px-3 py-1 rounded-lg border border-slate-200 w-fit">
                          {(!user.assignedVehicles || user.assignedVehicles.length === 0) ? 'Global Scope' : `${user.assignedVehicles.length} Restricted Units`}
                        </div>
                      </td>
                      <td className="px-8 py-5 text-center">
                        <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                          user.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700 shadow-inner'
                        }`}>
                          {user.status}
                        </span>
                      </td>
                      <td className="px-8 py-5 text-right">
                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => openEdit(user)} className="p-2.5 hover:bg-blue-50 text-blue-600 rounded-xl transition-all" title="Enforce Policy Changes"><Edit3 size={16}/></button>
                          <button onClick={() => toggleUserStatus(user)} disabled={user.role === UserRole.SUPER_ADMIN} className={`p-2.5 rounded-xl transition-all disabled:opacity-0 ${user.status === 'ACTIVE' ? 'hover:bg-amber-50 text-amber-500' : 'hover:bg-emerald-50 text-emerald-500'}`}>
                            {user.status === 'ACTIVE' ? <UserX size={16}/> : <UserCheck size={16}/>}
                          </button>
                          <button onClick={() => deleteUser(user.username)} disabled={user.username === 'admin'} className="p-2.5 hover:bg-red-50 text-slate-300 hover:text-red-500 rounded-xl transition-all disabled:opacity-0"><Trash2 size={16}/></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeSubTab === 'audit' && (
        <div className="bg-slate-950 rounded-[2.5rem] p-8 text-white shadow-2xl h-[700px] flex flex-col border border-white/5 animate-in fade-in duration-500">
           <div className="flex justify-between items-center mb-8 border-b border-white/10 pb-6">
              <div>
                <h3 className="text-xl font-black uppercase tracking-tight flex items-center gap-2"><History className="text-blue-500"/> Operational Audit Stream</h3>
                <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mt-1">Real-time immutable ledger of system actions</p>
              </div>
              <div className="flex gap-3">
                 <button className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black uppercase hover:bg-white/10 transition-all">Download Log (.CSV)</button>
              </div>
           </div>
           <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar-dark">
              {auditLogs.map(log => (
                <div key={log.logId} className="p-5 bg-white/5 border border-white/10 rounded-2xl flex justify-between items-center hover:bg-white/[0.08] transition-all border-l-4 border-l-blue-500">
                   <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                         <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${
                           log.action.includes('SUCCESS') ? 'bg-emerald-500/20 text-emerald-400' :
                           log.action.includes('PROVISIONED') ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-500/20 text-slate-400'
                         }`}>
                           {log.action.replace(/_/g, ' ')}
                         </span>
                         <span className="text-[8px] text-slate-500 font-black uppercase tracking-widest">Target: {log.entityType} ({log.entityId.slice(0,8)}...)</span>
                      </div>
                      <p className="text-xs font-medium text-slate-300">{log.reason}</p>
                   </div>
                   <div className="text-right">
                      <div className="text-[10px] font-black text-slate-100 mb-0.5 uppercase tracking-tighter">By @{log.performedBy}</div>
                      <div className="text-[9px] font-bold text-slate-500">{new Date(log.timestamp).toLocaleString()}</div>
                   </div>
                </div>
              ))}
           </div>
        </div>
      )}

      {activeSubTab === 'system' && (
        <div className="bg-white rounded-[2.5rem] border border-slate-200 p-12 shadow-sm animate-in fade-in duration-500 text-center">
            <Settings size={64} className="text-slate-100 mx-auto mb-6" />
            <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight mb-2">Policy Configuration Engine</h3>
            <p className="text-slate-500 font-medium max-w-md mx-auto mb-8">Global system policies, data retention rules, and enterprise-wide defaults.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left max-w-4xl mx-auto">
               <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                  <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-4">Identity Policy</h4>
                  <div className="space-y-4">
                     <PolicyToggle label="Enforce Strong Passwords" active />
                     <PolicyToggle label="Automatic Session Timeout (30m)" active />
                     <PolicyToggle label="Two-Factor Authentication (2FA)" />
                  </div>
               </div>
               <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                  <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-4">Governance & Audit</h4>
                  <div className="space-y-4">
                     <PolicyToggle label="Immutable Audit Logs" active />
                     <PolicyToggle label="Strict Manifest-Fuel FIFO" active />
                     <PolicyToggle label="Enable Version Control History" active />
                  </div>
               </div>
            </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[120] flex items-center justify-center p-4">
          <div className="bg-white rounded-[3rem] w-full max-w-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[95vh]">
            <div className="p-10 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <div>
                <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight">{editUser ? 'Re-provision Identity' : 'Provision New Identity'}</h3>
                <p className="text-[11px] text-slate-500 font-black uppercase tracking-widest mt-1">IAM Governance Policy Manager</p>
              </div>
              <button onClick={closeModal} className="p-3 hover:bg-white rounded-full transition-all text-slate-300 hover:text-slate-500 border border-transparent hover:border-slate-100">
                <X size={28} />
              </button>
            </div>
            
            <form onSubmit={handleProvision} className="flex-1 overflow-y-auto p-10 space-y-10 custom-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <h4 className="text-[10px] font-black text-blue-600 uppercase tracking-widest border-b border-blue-50 pb-2">Primary Identification</h4>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">Identity UID (Username)</label>
                    <div className="relative">
                       <Users className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16}/>
                       <input required disabled={!!editUser} value={formData.username} onChange={e => setFormData({...formData, username: e.target.value.toLowerCase().replace(/\s/g, '')})} className={`w-full pl-12 pr-5 py-4 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-blue-500/10 font-black ${editUser ? 'bg-slate-100 text-slate-400' : 'bg-white'}`} placeholder="e.g. john.fleet" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">Display Name (Full Name)</label>
                    <input required value={formData.fullName} onChange={e => setFormData({...formData, fullName: e.target.value})} className="w-full px-5 py-4 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-blue-500/10 font-black" placeholder="John Doe" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">{editUser ? 'Reset Access Pass (Leave blank to keep)' : 'Initial Access Pass'}</label>
                    <div className="relative">
                       <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16}/>
                       <input required={!editUser} type="password" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} className="w-full pl-12 pr-5 py-4 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-blue-500/10 font-bold" placeholder="••••••••" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">Governance Role</label>
                    <select value={formData.role} onChange={e => setFormData({...formData, role: e.target.value as any})} className="w-full px-5 py-4 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-blue-500/10 font-black bg-white uppercase text-xs">
                      <option value={UserRole.VIEWER}>Analyst (Read Only)</option>
                      <option value={UserRole.OPERATOR}>Operations Operator</option>
                      <option value={UserRole.MANAGER}>Operations Manager</option>
                      <option value={UserRole.ADMIN}>Local Administrator</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-6">
                  <h4 className="text-[10px] font-black text-indigo-600 uppercase tracking-widest border-b border-indigo-50 pb-2">Module Permission Matrix</h4>
                  <div className="grid grid-cols-1 gap-3">
                    <PermissionToggle label="Dashboard Insights" active={formData.permissions.dashboard} onToggle={() => togglePermission('dashboard')} />
                    <PermissionToggle label="Vehicle Master Control" active={formData.permissions.vehicles} onToggle={() => togglePermission('vehicles')} />
                    <PermissionToggle label="Trip & Manifest Mgmt" active={formData.permissions.trips} onToggle={() => togglePermission('trips')} />
                    <PermissionToggle label="Fuel Ledger Mgmt" active={formData.permissions.fuel} onToggle={() => togglePermission('fuel')} />
                    <PermissionToggle label="Advanced Analytics" active={formData.permissions.analytics} onToggle={() => togglePermission('analytics')} />
                    <PermissionToggle label="Security Governance" active={formData.permissions.admin} onToggle={() => togglePermission('admin')} />
                  </div>
                  <div className="mt-8">
                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">Asset Restriction (Fleet Scope)</label>
                    <textarea value={formData.assignedVehicles} onChange={e => setFormData({...formData, assignedVehicles: e.target.value})} className="w-full px-5 py-4 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-blue-500/10 font-bold h-24 resize-none" placeholder="V001, V002 (CSV format or blank for Global)" />
                    <p className="text-[9px] text-slate-400 font-bold uppercase mt-1">Leave blank to grant access to the entire fleet.</p>
                  </div>
                </div>
              </div>
              <div className="flex gap-4 pt-8 border-t border-slate-100">
                <button type="button" onClick={closeModal} className="flex-1 py-5 font-black text-[10px] uppercase tracking-widest text-slate-400 bg-slate-100 rounded-2xl hover:bg-slate-200 transition-all">Cancel Operation</button>
                <button type="submit" className="flex-1 py-5 font-black text-[10px] uppercase tracking-widest text-white bg-slate-900 rounded-2xl shadow-2xl shadow-slate-900/30 hover:bg-black transition-all">Commit Identity</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const PermissionToggle = ({ label, active, onToggle }: { label: string, active: boolean, onToggle: () => void }) => (
  <button type="button" onClick={onToggle} className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${active ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-100 text-slate-400'}`}>
     <span className="text-[10px] font-black uppercase tracking-tight">{label}</span>
     {active ? <CheckSquare size={16}/> : <Square size={16}/>}
  </button>
);

const PolicyToggle = ({ label, active = false }: { label: string, active?: boolean }) => (
  <div className="flex items-center justify-between group">
     <span className="text-[10px] font-bold text-slate-600 uppercase">{label}</span>
     <div className={`w-10 h-5 rounded-full relative transition-all ${active ? 'bg-blue-600' : 'bg-slate-300'}`}>
        <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${active ? 'right-1' : 'left-1'}`} />
     </div>
  </div>
);

export default AdminPanel;
