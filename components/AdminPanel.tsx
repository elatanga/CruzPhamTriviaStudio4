import React, { useState, useEffect } from 'react';
import { Users, Inbox, Shield, Search, Check, X, Copy, Trash2, Clock, Mail, MessageSquare, Plus, Loader2, RefreshCw, Key, Ban, UserCheck, AlertTriangle, Send, Eye, FileText, Smartphone } from 'lucide-react';
import { authService } from '../services/authService';
import { User, TokenRequest, AuditLogEntry, UserRole, UserSource } from '../types';

interface Props {
  currentUser: string;
  onClose: () => void;
  addToast: (type: any, msg: string) => void;
}

export const AdminPanel: React.FC<Props> = ({ currentUser, onClose, addToast }) => {
  const [activeTab, setActiveTab] = useState<'USERS' | 'INBOX' | 'AUDIT'>('USERS');
  const [users, setUsers] = useState<User[]>([]);
  const [requests, setRequests] = useState<TokenRequest[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [retryLoading, setRetryLoading] = useState<string | null>(null);
  
  // Master Admin Check
  const myself = users.find(u => u.username === currentUser);
  const isMaster = myself?.role === 'MASTER_ADMIN';

  // State: Filtering
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState<'ALL' | 'ADMIN' | 'PRODUCER'>('ALL');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'ACTIVE' | 'REVOKED'>('ALL');

  // State: Modals / Actions
  const [isCreating, setIsCreating] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', role: 'PRODUCER' as UserRole, duration: '', email: '', phone: '', tiktok: '', firstName: '', lastName: '' });
  const [actionLoading, setActionLoading] = useState<string | null>(null); 
  
  // Modals
  const [credentialModal, setCredentialModal] = useState<{username: string, token: string} | null>(null);
  const [viewUser, setViewUser] = useState<User | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    type: 'REVOKE' | 'GRANT' | 'REFRESH' | 'DELETE';
    username: string;
  } | null>(null);

  useEffect(() => {
    refreshData();
  }, [activeTab]);

  const refreshData = () => {
    setUsers(authService.getAllUsers());
    setRequests(authService.getRequests());
    setAuditLogs(authService.getAuditLogs());
  };

  // --- ACTIONS ---

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const duration = newUser.duration ? parseInt(newUser.duration) : undefined;
      const token = await authService.createUser(currentUser, { 
        username: newUser.username,
        email: newUser.email,
        phone: newUser.phone,
        profile: {
          firstName: newUser.firstName,
          lastName: newUser.lastName,
          tiktokHandle: newUser.tiktok,
          source: 'MANUAL_CREATE' as UserSource
        }
      }, newUser.role, duration);
      
      addToast('success', 'User created.');
      setCredentialModal({ username: newUser.username, token });
      
      setIsCreating(false);
      setNewUser({ username: '', role: 'PRODUCER', duration: '', email: '', phone: '', tiktok: '', firstName: '', lastName: '' });
      refreshData();
    } catch (e: any) {
      addToast('error', e.message);
    }
  };

  const handleRetryNotify = async (reqId: string) => {
    setRetryLoading(reqId);
    try {
      await authService.retryAdminNotification(reqId);
      addToast('success', 'Notification retry initiated.');
      refreshData(); // Refresh to see status update
    } catch (e) {
      addToast('error', 'Retry failed');
    } finally {
      setRetryLoading(null);
    }
  };

  const executeAction = async () => {
    if (!confirmAction) return;
    const { type, username } = confirmAction;
    setActionLoading(username);
    setConfirmAction(null);

    try {
      if (type === 'REFRESH') {
        const token = await authService.refreshToken(currentUser, username);
        setCredentialModal({ username, token });
        addToast('success', 'Token rotated successfully.');
      } else if (type === 'REVOKE') {
        await authService.toggleAccess(currentUser, username, true);
        addToast('success', 'Access revoked.');
      } else if (type === 'GRANT') {
        await authService.toggleAccess(currentUser, username, false);
        addToast('success', 'Access restored.');
      } else if (type === 'DELETE') {
        await authService.deleteUser(currentUser, username);
        addToast('info', 'User deleted.');
      }
      refreshData();
    } catch (e: any) {
      addToast('error', e.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleSendMessage = async (targetUsername: string, method: 'EMAIL' | 'SMS', content?: string) => {
    setActionLoading(targetUsername);
    const msg = content || `Hello ${targetUsername}, please access your CruzPham account.`;
    try {
      await authService.sendMessage(currentUser, targetUsername, method, msg);
      addToast('success', `${method} sent successfully.`);
      refreshData();
    } catch (e: any) {
      addToast('error', `Send failed: ${e.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  // --- FILTER LOGIC ---
  const filteredUsers = users.filter(u => {
    const matchSearch = 
      u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.phone && u.phone.includes(searchTerm)) ||
      (u.email && u.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (u.profile.tiktokHandle && u.profile.tiktokHandle.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchRole = filterRole === 'ALL' || u.role === filterRole;
    const matchStatus = filterStatus === 'ALL' || (filterStatus === 'REVOKED' ? u.status === 'REVOKED' : u.status === 'ACTIVE');

    return matchSearch && matchRole && matchStatus;
  });

  return (
    <div className="h-full flex flex-col bg-zinc-950 text-white font-sans">
      {/* Header */}
      <div className="flex-none h-16 bg-black border-b border-zinc-800 flex items-center justify-between px-6 shadow-md z-10">
        <h2 className="text-xl font-serif font-bold text-gold-500 tracking-wider flex items-center gap-2">
          <Shield className="w-6 h-6" /> ADMIN CONSOLE
        </h2>
        <div className="flex bg-zinc-900 p-1 rounded-full border border-zinc-800">
          <button onClick={() => setActiveTab('USERS')} className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${activeTab === 'USERS' ? 'bg-gold-600 text-black' : 'text-zinc-500 hover:text-white'}`}>USERS</button>
          <button onClick={() => setActiveTab('INBOX')} className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${activeTab === 'INBOX' ? 'bg-gold-600 text-black' : 'text-zinc-500 hover:text-white'}`}>INBOX</button>
          <button onClick={() => setActiveTab('AUDIT')} className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${activeTab === 'AUDIT' ? 'bg-gold-600 text-black' : 'text-zinc-500 hover:text-white'}`}>LOGS</button>
        </div>
        <button onClick={onClose} className="text-zinc-500 hover:text-white"><X className="w-6 h-6" /></button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden relative">
        <div className="h-full overflow-auto p-6 custom-scrollbar">
          
          {/* === USERS TAB === */}
          {activeTab === 'USERS' && (
            <div className="space-y-6 max-w-7xl mx-auto">
              {/* Toolbar */}
              <div className="flex flex-col md:flex-row gap-4 justify-between items-end md:items-center bg-zinc-900/50 p-4 rounded-lg border border-zinc-800">
                <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto">
                  <div className="flex items-center bg-black p-2 rounded border border-zinc-700 w-full md:w-64">
                    <Search className="w-4 h-4 text-zinc-500 ml-1" />
                    <input 
                      placeholder="Search users..."
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      className="bg-transparent border-none outline-none text-white text-xs ml-2 w-full placeholder:text-zinc-600"
                    />
                  </div>
                  <div className="flex gap-2">
                    <select value={filterRole} onChange={e => setFilterRole(e.target.value as any)} className="bg-black border border-zinc-700 text-xs text-zinc-300 rounded p-2 outline-none">
                      <option value="ALL">All Roles</option>
                      <option value="PRODUCER">Producers</option>
                      <option value="ADMIN">Admins</option>
                    </select>
                    <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)} className="bg-black border border-zinc-700 text-xs text-zinc-300 rounded p-2 outline-none">
                      <option value="ALL">All Status</option>
                      <option value="ACTIVE">Active</option>
                      <option value="REVOKED">Revoked</option>
                    </select>
                  </div>
                </div>
                <button onClick={() => setIsCreating(true)} className="bg-gold-600 hover:bg-gold-500 text-black font-bold px-4 py-2 rounded text-xs flex items-center gap-2 shadow-lg shadow-gold-500/10">
                  <Plus className="w-4 h-4" /> CREATE USER
                </button>
              </div>

              {/* Create User Form */}
              {isCreating && (
                <form onSubmit={handleCreateUser} className="bg-zinc-900 p-6 rounded-lg border border-gold-500/30 mb-6 animate-in slide-in-from-top-4">
                  <h3 className="text-gold-500 font-bold mb-4 flex items-center gap-2"><Plus className="w-4 h-4" /> New Account</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase text-zinc-500 font-bold">Username *</label>
                      <input required value={newUser.username} onChange={e => setNewUser({...newUser, username: e.target.value})} className="w-full bg-black border border-zinc-700 p-2 rounded text-white text-xs focus:border-gold-500 outline-none" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase text-zinc-500 font-bold">First Name</label>
                      <input value={newUser.firstName} onChange={e => setNewUser({...newUser, firstName: e.target.value})} className="w-full bg-black border border-zinc-700 p-2 rounded text-white text-xs focus:border-gold-500 outline-none" />
                    </div>
                     <div className="space-y-1">
                      <label className="text-[10px] uppercase text-zinc-500 font-bold">Last Name</label>
                      <input value={newUser.lastName} onChange={e => setNewUser({...newUser, lastName: e.target.value})} className="w-full bg-black border border-zinc-700 p-2 rounded text-white text-xs focus:border-gold-500 outline-none" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase text-zinc-500 font-bold">Role</label>
                      <select value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value as UserRole})} className="w-full bg-black border border-zinc-700 p-2 rounded text-white text-xs outline-none">
                        <option value="PRODUCER">Producer</option>
                        {isMaster && <option value="ADMIN">Admin</option>}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase text-zinc-500 font-bold">Email (Optional)</label>
                      <input type="email" value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} className="w-full bg-black border border-zinc-700 p-2 rounded text-white text-xs focus:border-gold-500 outline-none" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase text-zinc-500 font-bold">Phone (Optional)</label>
                      <input type="tel" value={newUser.phone} onChange={e => setNewUser({...newUser, phone: e.target.value})} className="w-full bg-black border border-zinc-700 p-2 rounded text-white text-xs focus:border-gold-500 outline-none" />
                    </div>
                     <div className="space-y-1">
                      <label className="text-[10px] uppercase text-zinc-500 font-bold">Duration (Mins, Optional)</label>
                      <input type="number" placeholder="Permanent" value={newUser.duration} onChange={e => setNewUser({...newUser, duration: e.target.value})} className="w-full bg-black border border-zinc-700 p-2 rounded text-white text-xs focus:border-gold-500 outline-none" />
                    </div>
                  </div>
                  <div className="flex justify-end gap-3">
                    <button type="button" onClick={() => setIsCreating(false)} className="text-zinc-500 hover:text-white px-4 py-2 text-xs">Cancel</button>
                    <button type="submit" className="bg-gold-600 text-black font-bold px-6 py-2 rounded text-xs hover:bg-gold-500">Generate & Send</button>
                  </div>
                </form>
              )}

              {/* Users Grid */}
              <div className="grid grid-cols-1 gap-4">
                {filteredUsers.map(u => (
                  <div key={u.id} className={`bg-zinc-900 border p-4 rounded-lg flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between group transition-all ${u.status === 'REVOKED' ? 'border-red-900/50 opacity-70' : 'border-zinc-800 hover:border-zinc-600'}`}>
                    {/* (User Info & Actions - Same as previous) */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <h4 className="font-bold text-white text-lg truncate">{u.username}</h4>
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase ${u.role === 'MASTER_ADMIN' ? 'bg-purple-900 text-purple-200' : u.role === 'ADMIN' ? 'bg-blue-900 text-blue-200' : 'bg-gold-900/30 text-gold-500'}`}>
                          {u.role}
                        </span>
                        {u.status === 'REVOKED' && <span className="bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded uppercase">REVOKED</span>}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
                        <span>{u.profile.firstName} {u.profile.lastName}</span>
                        {u.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {u.email}</span>}
                        {u.phone && <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" /> {u.phone}</span>}
                      </div>
                    </div>
                    {/* Action Buttons */}
                    {u.role !== 'MASTER_ADMIN' && (
                      <div className="flex flex-wrap items-center gap-2">
                         <button onClick={() => setViewUser(u)} className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded border border-zinc-700" title="View Details">
                           <FileText className="w-4 h-4" />
                         </button>
                         <div className="w-px h-6 bg-zinc-800 mx-1" />
                         <button 
                           onClick={() => setConfirmAction({ type: 'REFRESH', username: u.username })}
                           disabled={actionLoading === u.username}
                           className="flex items-center gap-1 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-[10px] font-bold uppercase border border-zinc-700"
                           title="Rotate Token"
                         >
                           {actionLoading === u.username ? <Loader2 className="w-3 h-3 animate-spin"/> : <RefreshCw className="w-3 h-3" />} Token
                         </button>
                         <div className="w-px h-6 bg-zinc-800 mx-1" />
                         {u.status === 'REVOKED' ? (
                           <button onClick={() => setConfirmAction({ type: 'GRANT', username: u.username })} className="text-green-500 hover:bg-green-900/20 px-3 py-1.5 rounded text-[10px] font-bold uppercase border border-green-900 flex items-center gap-1">
                             <UserCheck className="w-3 h-3" /> Grant
                           </button>
                         ) : (
                           <button onClick={() => setConfirmAction({ type: 'REVOKE', username: u.username })} className="text-orange-500 hover:bg-orange-900/20 px-3 py-1.5 rounded text-[10px] font-bold uppercase border border-orange-900 flex items-center gap-1">
                             <Ban className="w-3 h-3" /> Revoke
                           </button>
                         )}
                         <button onClick={() => setConfirmAction({ type: 'DELETE', username: u.username })} className="text-red-500 hover:bg-red-900/20 p-1.5 rounded border border-transparent hover:border-red-900 ml-1">
                           <Trash2 className="w-4 h-4" />
                         </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* === INBOX TAB === */}
          {activeTab === 'INBOX' && (
            <div className="space-y-4 max-w-5xl mx-auto">
              <h3 className="text-xs uppercase font-bold text-zinc-500 mb-4">Pending Requests ({requests.filter(r => r.status === 'PENDING').length})</h3>
              
              {requests.length === 0 && <div className="text-zinc-600 text-center py-12 border border-dashed border-zinc-800 rounded">No requests found.</div>}
              
              {requests.map(req => (
                <div key={req.id} className={`bg-zinc-900 border p-4 rounded flex flex-col gap-4 relative overflow-hidden ${req.status === 'PENDING' ? 'border-gold-900/50' : 'border-zinc-800 opacity-60'}`}>
                   
                   {/* Top Row: Basic Info & Status */}
                   <div className="flex justify-between items-start">
                      <div className="flex gap-4">
                        <div className="bg-black p-3 rounded border border-zinc-800 flex items-center justify-center h-12 w-12 text-zinc-600 font-bold text-xl">
                          {req.firstName.charAt(0)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-white font-bold text-lg">{req.firstName} {req.lastName}</span>
                            <span className="text-zinc-500 text-xs font-mono">@{req.preferredUsername}</span>
                          </div>
                          <div className="text-xs text-zinc-400 flex items-center gap-3">
                            <span className="flex items-center gap-1"><Smartphone className="w-3 h-3"/> {req.phoneE164}</span>
                            <span className="bg-zinc-800 px-1.5 py-0.5 rounded text-[10px]">TikTok: {req.tiktokHandle}</span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                         <span className={`px-2 py-1 rounded uppercase font-bold text-[10px] ${
                             req.status === 'PENDING' ? 'bg-blue-900 text-blue-300' : 
                             req.status === 'APPROVED' ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'
                           }`}>
                             {req.status}
                         </span>
                         <p className="text-[10px] text-zinc-600 mt-1 font-mono">{new Date(req.createdAt).toLocaleString()}</p>
                      </div>
                   </div>

                   {/* Footer Row: Admin Notification Status */}
                   <div className="flex justify-between items-center pt-3 border-t border-zinc-800/50">
                      <div className="flex items-center gap-2 text-[10px]">
                        <span className="text-zinc-500 font-bold uppercase">Admin Notify:</span>
                        {req.adminNotifyStatus === 'SENT' ? (
                          <span className="text-green-500 flex items-center gap-1"><Check className="w-3 h-3"/> Sent</span>
                        ) : req.adminNotifyStatus === 'FAILED' ? (
                          <div className="flex items-center gap-2">
                             <span className="text-red-500 flex items-center gap-1"><AlertTriangle className="w-3 h-3"/> Failed</span>
                             <button 
                               onClick={() => handleRetryNotify(req.id)}
                               disabled={retryLoading === req.id}
                               className="text-gold-500 hover:underline flex items-center gap-1"
                             >
                               {retryLoading === req.id ? <Loader2 className="w-3 h-3 animate-spin"/> : <RefreshCw className="w-3 h-3"/>} Retry
                             </button>
                          </div>
                        ) : (
                          <span className="text-zinc-500 italic">Pending...</span>
                        )}
                      </div>
                      
                      {req.status === 'PENDING' && (
                        <div className="flex gap-2">
                          <button onClick={() => authService.rejectRequest(currentUser, req.id).then(refreshData)} className="px-3 py-1.5 bg-zinc-950 border border-zinc-800 hover:border-red-500 hover:text-red-500 rounded text-xs">Reject</button>
                          <button onClick={() => authService.approveRequest(currentUser, req.id, undefined, ['EMAIL', 'SMS']).then(refreshData)} className="px-4 py-1.5 bg-gold-600 hover:bg-gold-500 text-black font-bold rounded text-xs flex items-center gap-2">
                            <Check className="w-3 h-3" /> Approve & Send
                          </button>
                        </div>
                      )}
                   </div>
                </div>
              ))}
            </div>
          )}

          {/* === AUDIT TAB === */}
          {activeTab === 'AUDIT' && (
             <div className="bg-zinc-900 rounded border border-zinc-800 overflow-hidden max-w-7xl mx-auto">
               <table className="w-full text-left text-xs font-mono text-zinc-400">
                 <thead className="bg-black text-zinc-500 uppercase sticky top-0">
                   <tr>
                     <th className="p-3 border-b border-zinc-800">Time</th>
                     <th className="p-3 border-b border-zinc-800">Actor</th>
                     <th className="p-3 border-b border-zinc-800">Action</th>
                     <th className="p-3 border-b border-zinc-800">Details</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-zinc-800">
                   {auditLogs.map(log => (
                     <tr key={log.id} className="hover:bg-zinc-800/50">
                       <td className="p-3 whitespace-nowrap">{new Date(log.timestamp).toLocaleString()}</td>
                       <td className="p-3 text-gold-500">{log.actorId} <span className="opacity-50 text-[10px]">({log.actorRole})</span></td>
                       <td className="p-3 font-bold">{log.action}</td>
                       <td className="p-3 text-zinc-300">{log.details}</td>
                     </tr>
                   ))}
                 </tbody>
               </table>
            </div>
          )}

        </div>

        {/* ... (Existing Modals: ViewUser, Confirmation, Credential - No Changes Needed but included in scope of file) ... */}
        {/* Re-rendering existing modal logic for completeness */}
        
        {viewUser && (
          <div className="absolute inset-0 z-50 bg-black/90 flex items-center justify-center p-4">
             <div className="w-full max-w-lg bg-zinc-900 border border-zinc-700 rounded-xl p-6 shadow-2xl">
               <div className="flex justify-between items-start mb-6">
                 <div>
                   <h3 className="text-xl font-bold text-white flex items-center gap-2">{viewUser.username} <span className="text-[10px] bg-zinc-800 px-2 py-1 rounded text-zinc-400 uppercase">{viewUser.role}</span></h3>
                   <p className="text-xs text-zinc-500 font-mono mt-1">ID: {viewUser.id}</p>
                 </div>
                 <button onClick={() => setViewUser(null)} className="text-zinc-500 hover:text-white"><X className="w-5 h-5"/></button>
               </div>
               <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-black p-3 rounded border border-zinc-800"><p className="text-[10px] uppercase text-zinc-500 font-bold mb-1">Name</p><p className="text-white">{viewUser.profile.firstName} {viewUser.profile.lastName}</p></div>
                  <div className="bg-black p-3 rounded border border-zinc-800"><p className="text-[10px] uppercase text-zinc-500 font-bold mb-1">Source</p><p className="text-white">{viewUser.profile.source}</p></div>
               </div>
               <div className="flex justify-end"><button onClick={() => setViewUser(null)} className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded text-xs font-bold">Close</button></div>
             </div>
          </div>
        )}
        
        {confirmAction && (
          <div className="absolute inset-0 z-50 bg-black/90 flex items-center justify-center p-4">
            <div className="w-full max-w-sm bg-zinc-900 border border-red-900 rounded-xl p-6 shadow-2xl text-center">
               <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
               <h3 className="text-lg font-bold text-white mb-2">Confirm Action</h3>
               <p className="text-zinc-400 text-sm mb-6">Are you sure you want to <strong>{confirmAction.type}</strong> access for <strong>{confirmAction.username}</strong>?</p>
               <div className="flex gap-3 justify-center">
                 <button onClick={() => setConfirmAction(null)} className="px-4 py-2 rounded text-zinc-400 hover:text-white text-sm">Cancel</button>
                 <button onClick={executeAction} className="bg-red-600 hover:bg-red-500 text-white px-6 py-2 rounded text-sm font-bold">Confirm</button>
               </div>
            </div>
          </div>
        )}

        {credentialModal && (
          <div className="absolute inset-0 z-50 bg-black/90 flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-md bg-zinc-900 border border-gold-500 rounded-xl p-6 shadow-2xl">
              <div className="flex items-center justify-center mb-6"><div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center border border-green-500 text-green-500"><Key className="w-6 h-6" /></div></div>
              <h2 className="text-xl font-bold text-center text-white mb-2">Credentials Generated</h2>
              <div className="bg-black p-4 rounded border border-zinc-800 mb-6 space-y-3">
                <div className="text-white font-mono text-lg">{credentialModal.username}</div>
                <div className="h-px bg-zinc-800" />
                <div className="flex justify-between items-center text-xs text-zinc-500 uppercase font-bold"><span>Access Token</span><button onClick={() => { navigator.clipboard.writeText(credentialModal.token); addToast('success', 'Token copied'); }} className="text-gold-500 hover:text-white flex items-center gap-1"><Copy className="w-3 h-3" /> COPY</button></div>
                <div className="text-gold-500 font-mono text-lg break-all">{credentialModal.token}</div>
              </div>
              <button onClick={() => setCredentialModal(null)} className="w-full bg-gold-600 hover:bg-gold-500 text-black font-bold py-3 rounded text-sm">Done</button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};