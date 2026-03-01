
import React, { useState, useEffect } from 'react';
import { db } from './db';
import Dashboard from './components/Dashboard';
import VehicleMaster from './components/VehicleMaster';
import TripLog from './components/TripLog';
import FuelHistory from './components/FuelHistory';
import Reports from './components/Reports';
import AdminPanel from './components/AdminPanel';
import { Truck, Fuel, Navigation, LayoutDashboard, FileBarChart, AlertTriangle, Shield, LogOut, Lock, Menu, ChevronLeft, ChevronRight } from 'lucide-react';
import { TripStatus, User, UserRole, UserPermissions } from './types';
import { AuthService } from './services/AuthService';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'vehicles' | 'trips' | 'fuel' | 'reports' | 'admin'>('dashboard');
  const [tabFilter, setTabFilter] = useState<TripStatus | 'ALL' | undefined>(undefined);
  const [isDbReady, setIsDbReady] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  
  // Sidebar State
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    return localStorage.getItem('sidebar_collapsed') === 'true';
  });

  // Auth States
  const [user, setUser] = useState<User | null>(AuthService.getCurrentUser());
  const [loginCreds, setLoginCreds] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState<string | null>(null);

  useEffect(() => {
    db.init()
      .then(async () => {
        await AuthService.ensureDefaultAdmin();
        setIsDbReady(true);
      })
      .catch((err) => {
        console.error("Critical Database Error:", err);
        setDbError("Local Database access denied. Please ensure cookies/storage are enabled.");
      });
  }, []);

  // Set initial tab based on permissions
  useEffect(() => {
    // Fix: Map 'reports' tab to 'analytics' permission key to avoid type errors
    const currentModuleKey = activeTab === 'reports' ? 'analytics' : activeTab as any;
    
    if (user && !AuthService.canAccessModule(user, currentModuleKey)) {
       // Find first available module
       const modules: (keyof UserPermissions)[] = ['dashboard', 'vehicles', 'trips', 'fuel', 'analytics', 'admin'];
       for (const mod of modules) {
          if (AuthService.canAccessModule(user, mod)) {
             setActiveTab(mod === 'analytics' ? 'reports' : mod as any);
             break;
          }
       }
    }
  }, [user, activeTab]);

  // Persist Sidebar State
  useEffect(() => {
    localStorage.setItem('sidebar_collapsed', isSidebarCollapsed.toString());
  }, [isSidebarCollapsed]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    try {
      const loggedUser = await AuthService.login(loginCreds.username, loginCreds.password);
      setUser(loggedUser);
    } catch (err: any) {
      setLoginError(err.message);
    }
  };

  const handleLogout = () => {
    AuthService.logout();
    setUser(null);
    setActiveTab('dashboard');
  };

  const navigateTo = (tab: any, filter?: TripStatus | 'ALL') => {
    if (user && !AuthService.canAccessModule(user, tab === 'reports' ? 'analytics' : tab)) {
      return alert('Access Restricted: Policy violation detected.');
    }
    setTabFilter(filter);
    setActiveTab(tab);
  };

  const toggleSidebar = () => {
    setIsSidebarCollapsed(!isSidebarCollapsed);
  };

  if (dbError) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900 text-white p-8">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="p-4 bg-red-500/20 border border-red-500 rounded-3xl inline-block">
            <AlertTriangle size={48} className="text-red-500" />
          </div>
          <h1 className="text-2xl font-black uppercase tracking-tight">System Initialization Failed</h1>
          <p className="text-slate-400 font-medium">{dbError}</p>
          <button onClick={() => window.location.reload()} className="px-8 py-3 bg-white text-slate-900 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-100">Retry Connection</button>
        </div>
      </div>
    );
  }

  if (!isDbReady) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900 text-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-blue-500 mb-6 mx-auto"></div>
          <h1 className="text-xl font-black uppercase tracking-widest">FuelOps Enterprise</h1>
          <p className="text-slate-500 text-[10px] font-black uppercase mt-2">Connecting to Ledger...</p>
        </div>
      </div>
    );
  }

  // Login Screen
  if (!user) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-950 p-6">
        <div className="w-full max-w-sm">
          <div className="text-center mb-10">
            <div className="w-16 h-16 bg-blue-600 rounded-[2rem] flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-blue-500/20">
              <Lock className="text-white" size={32} />
            </div>
            <h1 className="text-3xl font-black text-white uppercase tracking-tighter">FuelOps <span className="text-blue-500">Secure</span></h1>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-2">Enterprise Resource Controller</p>
          </div>
          <form onSubmit={handleLogin} className="bg-white/5 border border-white/10 p-8 rounded-[2.5rem] backdrop-blur-xl space-y-6">
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">Identity UID</label>
                <input required type="text" value={loginCreds.username} onChange={e => setLoginCreds({...loginCreds, username: e.target.value})} className="w-full px-4 py-4 bg-white/5 border border-white/10 rounded-2xl outline-none focus:ring-4 focus:ring-blue-500/10 text-white font-black" placeholder="admin" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">Access Pass</label>
                <input required type="password" value={loginCreds.password} onChange={e => setLoginCreds({...loginCreds, password: e.target.value})} className="w-full px-4 py-4 bg-white/5 border border-white/10 rounded-2xl outline-none focus:ring-4 focus:ring-blue-500/10 text-white font-black" placeholder="••••••••" />
              </div>
            </div>
            {loginError && <p className="text-[10px] font-black text-red-400 uppercase text-center bg-red-400/10 py-2 rounded-xl border border-red-400/20">{loginError}</p>}
            <button type="submit" className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-blue-700 transition-all shadow-xl shadow-blue-600/20">Authorize Session</button>
            <p className="text-[9px] text-center text-slate-500 font-bold uppercase tracking-widest">Encryption Level: Enterprise RSA-256</p>
          </form>
        </div>
      </div>
    );
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <Dashboard onNavigate={navigateTo} />;
      case 'vehicles': return <VehicleMaster />;
      case 'trips': return <TripLog preFilter={tabFilter} />;
      case 'fuel': return <FuelHistory preFilter={tabFilter} />;
      case 'reports': return <Reports />;
      case 'admin': return <AdminPanel />;
      default: return <Dashboard onNavigate={navigateTo} />;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className={`${isSidebarCollapsed ? 'w-20' : 'w-64'} bg-slate-900 text-white flex flex-col shrink-0 transition-all duration-300 ease-in-out`}>
        <div className={`p-6 border-b border-slate-800 flex items-center ${isSidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
          <div className={`flex items-center gap-2 overflow-hidden transition-all duration-300 ${isSidebarCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
            <Fuel className="text-blue-400 shrink-0" size={24} />
            <div className="whitespace-nowrap">
              <h1 className="text-xl font-black">
                FUEL<span className="text-blue-400">OPS</span>
              </h1>
              <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-widest font-black">Controller</p>
            </div>
          </div>
          <button 
            onClick={toggleSidebar} 
            className={`p-2 rounded-xl hover:bg-slate-800 transition-colors text-slate-400 hover:text-white ${isSidebarCollapsed ? '' : 'ml-2'}`}
            title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            {isSidebarCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
          </button>
        </div>
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto scrollbar-hide">
          {AuthService.canAccessModule(user, 'dashboard') && <SidebarItem icon={<LayoutDashboard size={20} />} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => navigateTo('dashboard')} collapsed={isSidebarCollapsed} />}
          {AuthService.canAccessModule(user, 'vehicles') && <SidebarItem icon={<Truck size={20} />} label="Vehicle Master" active={activeTab === 'vehicles'} onClick={() => navigateTo('vehicles')} collapsed={isSidebarCollapsed} />}
          {AuthService.canAccessModule(user, 'trips') && <SidebarItem icon={<Navigation size={20} />} label="Trip Log" active={activeTab === 'trips'} onClick={() => navigateTo('trips', 'ALL')} collapsed={isSidebarCollapsed} />}
          {AuthService.canAccessModule(user, 'fuel') && <SidebarItem icon={<Fuel size={20} />} label="Fuel History" active={activeTab === 'fuel'} onClick={() => navigateTo('fuel')} collapsed={isSidebarCollapsed} />}
          {AuthService.canAccessModule(user, 'analytics') && <SidebarItem icon={<FileBarChart size={20} />} label="Analytics" active={activeTab === 'reports'} onClick={() => navigateTo('reports')} collapsed={isSidebarCollapsed} />}
          
          {(user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN) && AuthService.canAccessModule(user, 'admin') && (
            <div className="pt-4 mt-4 border-t border-white/5">
              <SidebarItem icon={<Shield size={20} />} label="Admin Panel" active={activeTab === 'admin'} onClick={() => navigateTo('admin')} collapsed={isSidebarCollapsed} />
            </div>
          )}
        </nav>
        <div className="p-4 border-t border-slate-800 bg-slate-900/50">
          <div className={`bg-slate-800 rounded-3xl border border-slate-700/50 transition-all duration-300 ${isSidebarCollapsed ? 'p-2' : 'p-4'}`}>
            <div className={`flex items-center gap-3 mb-3 ${isSidebarCollapsed ? 'justify-center' : ''}`}>
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-black text-[10px] shrink-0 uppercase">
                {user.username.slice(0,2)}
              </div>
              {!isSidebarCollapsed && (
                <div className="overflow-hidden">
                  <p className="text-[11px] font-black truncate">{user.fullName}</p>
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{user.role}</p>
                </div>
              )}
            </div>
            <button 
              onClick={handleLogout}
              className={`w-full flex items-center justify-center gap-2 py-2 bg-red-500/10 text-red-500 rounded-xl text-[10px] font-black uppercase hover:bg-red-500/20 transition-all border border-red-500/10 ${isSidebarCollapsed ? 'px-0' : ''}`}
              title={isSidebarCollapsed ? "Terminate Session" : ""}
            >
              <LogOut size={12} /> {!isSidebarCollapsed && "Terminate"}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto bg-slate-50 flex flex-col transition-all duration-300">
        <header className="bg-white border-b border-slate-200 sticky top-0 z-10 px-8 py-5 flex justify-between items-center shrink-0">
          <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">
            {activeTab === 'admin' ? 'Security & Governance' : activeTab.replace(/([A-Z])/g, ' $1')}
          </h2>
          <div className="flex items-center gap-4">
            <span className={`text-[10px] font-black bg-slate-100 px-4 py-1.5 rounded-full uppercase tracking-widest border border-slate-200 flex items-center gap-2 ${user.role === UserRole.SUPER_ADMIN ? 'text-blue-600' : 'text-slate-500'}`}>
              {user.role === UserRole.SUPER_ADMIN && <Shield size={10}/>} Role: {user.role}
            </span>
          </div>
        </header>
        <div className="p-8 flex-1">
          {renderContent()}
        </div>
      </main>
    </div>
  );
};

interface SidebarItemProps {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  collapsed?: boolean;
}

const SidebarItem: React.FC<SidebarItemProps> = ({ icon, label, active, onClick, collapsed }) => (
  <button
    onClick={onClick}
    title={collapsed ? label : ""}
    className={`w-full flex items-center rounded-2xl transition-all duration-300 group overflow-hidden ${
      active ? 'bg-blue-600 text-white shadow-xl shadow-blue-900/30' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
    } ${collapsed ? 'justify-center p-3' : 'px-4 py-3 gap-3'}`}
  >
    <span className={`${active ? 'text-white' : 'group-hover:text-blue-400'} shrink-0`}>{icon}</span>
    <span className={`text-xs font-black uppercase tracking-widest whitespace-nowrap transition-all duration-300 ${collapsed ? 'w-0 opacity-0 translate-x-10' : 'w-auto opacity-100 translate-x-0'}`}>
      {label}
    </span>
  </button>
);

export default App;
