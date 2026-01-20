import React, { useState, useEffect } from 'react';
import { Users, Inbox, Shield, Search, Check, X, Copy, Trash2, Clock, Mail, MessageSquare, Plus, Loader2 } from 'lucide-react';
import { authService } from '../services/authService';
import { User, TokenRequest, AuditLogEntry, UserRole } from '../types';

interface Props {
  currentUser: string;
  onClose: () => void;
  addToast: (type: any, msg: string) => void;
}

export const AdminPanel: React.FC<Props> = ({ currentUser, onClose, addToast }) => {
  const [activeTab, setActiveTab] = useState<'USERS' | 'INBOX' | 'AUDIT'>('INBOX');
  const [users, setUsers] = useState<User[]>([]);
  const [requests, setRequests] = useState<TokenRequest[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  // New User Form State
  const [isCreating, setIsCreating] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', role: 'PRODUCER' as UserRole, duration: '' });

  useEffect(() => {
    refreshData();
  }, [activeTab]);

  const refreshData = () => {
    if (activeTab === 'USERS') setUsers(authService.getAllUsers());
    if (activeTab === 'INBOX') setRequests(authService.getRequests());
    if (activeTab === 'AUDIT') setAuditLogs(authService.getAuditLogs());
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const duration = newUser.duration ? parseInt(newUser.duration) : undefined;
      const token = await authService.createUser(currentUser, { username: newUser.username }, newUser.role, duration);
      addToast('success', 'User created.');
      // Show token ONCE
      prompt('COPY THIS TOKEN IMMEDIATELY. IT WILL NOT BE SHOWN AGAIN.', token);
      setIsCreating(false);
      setNewUser({ username: '', role: 'PRODUCER', duration: '' });
      refreshData();
    } catch (e: any) {
      addToast('error', e.message);
    }
  };

  const handleDeleteUser = async (username: string) => {
    if (!confirm(`Permanently delete ${username}?`)) return;
    try {
      await authService.deleteUser(currentUser, username);
      addToast('info', 'User deleted.');
      refreshData();
    } catch (e: any) {
      addToast('error', e.message);
    }
  };

  const handleApprove = async (reqId: string) => {
    // For simplicity, auto-approve for now or prompt for duration
    try {
      const token = await authService.approveRequest(currentUser, reqId, undefined, ['EMAIL', 'SMS']);
      addToast('success', 'Request approved & notified.');
      // Optional: Show token manually if notification fails
      console.log('Manual Token Fallback:', token);
      refreshData();
    } catch (e: any) {
      addToast('error', e.message);
    }
  };

  const handleReject = async (reqId: string) => {
    if (!confirm('Reject request?')) return;
    await authService.rejectRequest(currentUser, reqId);
    refreshData();
  };

  // Filter Logic
  const filteredRequests = requests.filter(r => 
    r.preferredUsername.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.tiktokHandle.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.id.includes(searchTerm)
  );

  return (
    <div className="h-full flex flex-col bg-zinc-950 text-white">
      {/* Header */}
      <div className="flex-none h-16 bg-black border-b border-zinc-800 flex items-center justify-between px-6">
        <h2 className="text-xl font-serif font-bold text-gold-500 tracking-wider flex items-center gap-2">
          <Shield className="w-6 h-6" /> ADMIN CONSOLE
        </h2>
        <div className="flex bg-zinc-900 p-1 rounded-full border border-zinc-800">
          <button onClick={() => setActiveTab('INBOX')} className={`px-4 py-1.5 rounded-full text-xs font-bold ${activeTab === 'INBOX' ? 'bg-gold-600 text-black' : 'text-zinc-500'}`}>INBOX</button>
          <button onClick={() => setActiveTab('USERS')} className={`px-4 py-1.5 rounded-full text-xs font-bold ${activeTab === 'USERS' ? 'bg-gold-600 text-black' : 'text-zinc-500'}`}>USERS</button>
          <button onClick={() => setActiveTab('AUDIT')} className={`px-4 py-1.5 rounded-full text-xs font-bold ${activeTab === 'AUDIT' ? 'bg-gold-600 text-black' : 'text-zinc-500'}`}>LOGS</button>
        </div>
        <button onClick={onClose} className="text-zinc-500 hover:text-white"><X className="w-6 h-6" /></button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6 custom-scrollbar">
        
        {/* === USERS TAB === */}
        {activeTab === 'USERS' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-zinc-400 font-bold text-sm">ACTIVE ACCOUNTS</h3>
              <button onClick={() => setIsCreating(true)} className="bg-gold-900/20 text-gold-500 border border-gold-900 hover:bg-gold-600 hover:text-black px-4 py-2 rounded text-xs font-bold flex items-center gap-2">
                <Plus className="w-4 h-4" /> ISSUE TOKEN
              </button>
            </div>

            {isCreating && (
              <form onSubmit={handleCreateUser} className="bg-zinc-900 p-4 rounded border border-gold-500/30 mb-6 flex gap-4 items-end animate-in fade-in">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase text-zinc-500 font-bold">Username</label>
                  <input required value={newUser.username} onChange={e => setNewUser({...newUser, username: e.target.value})} className="bg-black border border-zinc-700 p-2 rounded text-white text-xs w-48" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase text-zinc-500 font-bold">Role</label>
                  <select value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value as UserRole})} className="bg-black border border-zinc-700 p-2 rounded text-white text-xs">
                    <option value="PRODUCER">Producer</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase text-zinc-500 font-bold">Duration (Mins, Optional)</label>
                  <input type="number" placeholder="Permanent" value={newUser.duration} onChange={e => setNewUser({...newUser, duration: e.target.value})} className="bg-black border border-zinc-700 p-2 rounded text-white text-xs w-32" />
                </div>
                <button type="submit" className="bg-gold-600 text-black font-bold px-4 py-2 rounded text-xs">Generate</button>
                <button type="button" onClick={() => setIsCreating(false)} className="text-zinc-500 hover:text-white px-2">Cancel</button>
              </form>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {users.map(u => (
                <div key={u.id} className="bg-zinc-900 border border-zinc-800 p-4 rounded relative group hover:border-zinc-600">
                  <div className="flex justify-between items-start mb-2">
                    <span className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase ${u.role === 'MASTER_ADMIN' ? 'bg-purple-900 text-purple-200' : u.role === 'ADMIN' ? 'bg-blue-900 text-blue-200' : 'bg-zinc-800 text-zinc-400'}`}>
                      {u.role}
                    </span>
                    {u.role !== 'MASTER_ADMIN' && (
                      <button onClick={() => handleDeleteUser(u.username)} className="text-zinc-600 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                    )}
                  </div>
                  <div className="font-bold text-lg text-white mb-1">{u.username}</div>
                  <div className="text-xs text-zinc-500 flex flex-col gap-1">
                    {u.tiktokHandle && <span>TikTok: {u.tiktokHandle}</span>}
                    {u.expiresAt ? (
                      <span className="text-orange-400 flex items-center gap-1"><Clock className="w-3 h-3" /> Exp: {new Date(u.expiresAt).toLocaleString()}</span>
                    ) : (
                      <span className="text-green-500/50">Permanent Access</span>
                    )}
                    <span className="text-[10px] mt-2">Created by: {u.createdBy || 'System'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* === INBOX TAB === */}
        {activeTab === 'INBOX' && (
          <div className="space-y-4">
            <div className="flex items-center bg-zinc-900 p-2 rounded border border-zinc-800">
              <Search className="w-4 h-4 text-zinc-500 ml-2" />
              <input 
                placeholder="Search requests..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="bg-transparent border-none outline-none text-white text-sm ml-2 w-full placeholder:text-zinc-600"
              />
            </div>

            <div className="space-y-2">
              {filteredRequests.length === 0 && <div className="text-zinc-600 text-center py-8">No matching requests.</div>}
              {filteredRequests.map(req => (
                <div key={req.id} className={`bg-zinc-900 border p-4 rounded flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${req.status === 'PENDING' ? 'border-gold-900/30' : 'border-zinc-800 opacity-60'}`}>
                   <div>
                     <div className="flex items-center gap-2 mb-1">
                        <span className="text-gold-500 font-bold text-lg">{req.preferredUsername}</span>
                        <span className={`text-[10px] px-1.5 rounded uppercase font-bold ${req.status === 'PENDING' ? 'bg-blue-900 text-blue-300' : req.status === 'APPROVED' ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>{req.status}</span>
                        <span className="text-zinc-600 font-mono text-xs">#{req.id}</span>
                     </div>
                     <div className="text-xs text-zinc-400 flex flex-wrap gap-x-4 gap-y-1">
                       <span>{req.firstName} {req.lastName}</span>
                       <span>@{req.tiktokHandle}</span>
                       <span>{req.phone}</span>
                       <span className="text-zinc-600">{new Date(req.timestamp).toLocaleDateString()}</span>
                     </div>
                   </div>
                   
                   {req.status === 'PENDING' && (
                     <div className="flex gap-2">
                       <button onClick={() => handleReject(req.id)} className="p-2 bg-zinc-950 border border-zinc-800 hover:border-red-500 hover:text-red-500 rounded"><X className="w-4 h-4" /></button>
                       <button onClick={() => handleApprove(req.id)} className="px-4 py-2 bg-gold-600 hover:bg-gold-500 text-black font-bold rounded text-xs flex items-center gap-2">
                         <Check className="w-4 h-4" /> Approve & Notify
                       </button>
                     </div>
                   )}
                   {req.status === 'APPROVED' && (
                     <div className="text-[10px] text-zinc-500 flex gap-2">
                        <span className={req.emailDeliveryStatus === 'SENT' ? 'text-green-500' : 'text-red-500'}>Email: {req.emailDeliveryStatus}</span>
                        <span className={req.smsDeliveryStatus === 'SENT' ? 'text-green-500' : 'text-red-500'}>SMS: {req.smsDeliveryStatus}</span>
                     </div>
                   )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* === AUDIT TAB === */}
        {activeTab === 'AUDIT' && (
          <div className="bg-zinc-900 rounded border border-zinc-800 overflow-hidden">
             <table className="w-full text-left text-xs font-mono text-zinc-400">
               <thead className="bg-black text-zinc-500 uppercase">
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
                     <td className="p-3 text-gold-500">{log.actorId}</td>
                     <td className="p-3 font-bold">{log.action}</td>
                     <td className="p-3 text-zinc-300">{log.details}</td>
                   </tr>
                 ))}
               </tbody>
             </table>
          </div>
        )}

      </div>
    </div>
  );
};