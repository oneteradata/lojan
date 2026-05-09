import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RefreshCw, Plus, CheckCircle, XCircle, Clock, Copy } from 'lucide-react';
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { apiFetch } from './utils';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function AdminCredits({ user, onRefreshUser }: { user: any, onRefreshUser?: () => void }) {
  const [requests, setRequests] = useState<any[]>([]);
  const [userLogs, setUserLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [settings, setSettings] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'pedidos' | 'logs'>('pedidos');
  
  const [newReq, setNewReq] = useState({ user_id_recebedor: '', quantidade: '', tipo_token: '' });

  const fetchRequests = async () => {
    setLoading(true);
    try {
      if (onRefreshUser) onRefreshUser();
      
      const res = await apiFetch('/api/credit-requests');
      const data = await res.json();
      setRequests(data);
      
      const resLogs = await apiFetch('/api/my-logs');
      const dataLogs = await resLogs.json();
      setUserLogs(dataLogs);

      if (user.role === 'admin') {
        const setRes = await apiFetch('/api/settings');
        const setData = await setRes.json();
        if (setData.success) {
          setSettings(setData.settings);
        }
      }
    } catch(e) {}
    setLoading(false);
  };

  useEffect(() => {
    fetchRequests();
  }, [user.role]);

  const handleUpdateSettings = async (e: any) => {
    e.preventDefault();
    setLoading(true);
    try {
      await apiFetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      fetchRequests();
      alert('Configurações atualizadas com sucesso!');
    } catch (e) {}
    setLoading(false);
  };

  const handleCreate = async (e: any) => {
    e.preventDefault();
    setLoading(true);
    try {
      await apiFetch('/api/credit-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({...newReq, quantidade: Number(newReq.quantidade), tipo_token: Number(newReq.tipo_token)})
      });
      setShowAdd(false);
      setNewReq({ user_id_recebedor: '', quantidade: '', tipo_token: '' });
      fetchRequests();
    } catch(e) {}
    setLoading(false);
  };

  const handleUpdateStatus = async (id: number, status: string) => {
    if(!window.confirm(`Mudar status para ${status}?`)) return;
    setLoading(true);
    try {
      await apiFetch(`/api/credit-requests/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      fetchRequests();
    } catch(e) {}
    setLoading(false);
  };

  const handleCopyId = (e: React.MouseEvent, id: string | number) => {
    e.stopPropagation();
    navigator.clipboard.writeText(String(id));
    alert(`ID ${id} copiado para a área de transferência!`);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 md:p-8 space-y-6 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
         <div>
           <h2 className="text-2xl font-bold text-[#1D1D1F]">Logs</h2>
           <p className="text-xs text-gray-500 mt-1">Seus pedidos de moeda e registros do sistema</p>
         </div>
         <div className="flex gap-2">
           <button onClick={fetchRequests} className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center hover:bg-gray-200 text-gray-600 transition-colors">
             <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
           </button>
           {user.role === 'admin' && activeTab === 'pedidos' && (
             <button onClick={() => setShowAdd(!showAdd)} className="w-10 h-10 bg-black text-white rounded-full flex items-center justify-center hover:scale-105 transition-transform shadow-lg shadow-black/20">
               {showAdd ? <XCircle className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
             </button>
           )}
         </div>
      </div>

      <div className="flex bg-[#F5F5F7] p-1 rounded-2xl w-fit mb-6">
         <button 
           onClick={() => setActiveTab('pedidos')}
           className={cn("px-4 py-2 text-sm font-bold rounded-xl transition-all", activeTab === 'pedidos' ? "bg-white text-[#1D1D1F] shadow-sm" : "text-[#86868B] hover:text-[#1D1D1F]")}
         >
           Pedidos de Moeda/Crédito
         </button>
         <button 
           onClick={() => setActiveTab('logs')}
           className={cn("px-4 py-2 text-sm font-bold rounded-xl transition-all", activeTab === 'logs' ? "bg-white text-[#1D1D1F] shadow-sm" : "text-[#86868B] hover:text-[#1D1D1F]")}
         >
           Logs do Usuário
         </button>
      </div>

      {user.role === 'admin' && settings && activeTab === 'pedidos' && (
        <div className="bg-white p-6 rounded-2xl border border-gray-100 mb-6 shadow-sm">
          <h3 className="font-bold text-sm mb-4 text-[#1D1D1F] uppercase tracking-widest border-b border-gray-100 pb-2">Custos de Produto</h3>
          <form onSubmit={handleUpdateSettings} className="space-y-4">
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                   <h4 className="font-bold text-xs text-gray-500 mb-3 uppercase">Modalidade 7 Dias</h4>
                   <div className="grid grid-cols-2 gap-4">
                     <div>
                       <label className="text-[10px] font-bold text-gray-400 mb-1 block">Qtd. Tokens</label>
                       <input type="number" required value={settings.cost_7d_amount || ''} onChange={e => setSettings({...settings, cost_7d_amount: Number(e.target.value)})} className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500" />
                     </div>
                     <div>
                       <label className="text-[10px] font-bold text-gray-400 mb-1 block">Tipo do Token (eX)</label>
                       <input type="number" required value={settings.cost_7d_type || ''} onChange={e => setSettings({...settings, cost_7d_type: Number(e.target.value)})} className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500" />
                     </div>
                   </div>
                </div>
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                   <h4 className="font-bold text-xs text-gray-500 mb-3 uppercase">Modalidade 30 Dias</h4>
                   <div className="grid grid-cols-2 gap-4">
                     <div>
                       <label className="text-[10px] font-bold text-gray-400 mb-1 block">Qtd. Tokens</label>
                       <input type="number" required value={settings.cost_30d_amount || ''} onChange={e => setSettings({...settings, cost_30d_amount: Number(e.target.value)})} className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500" />
                     </div>
                     <div>
                       <label className="text-[10px] font-bold text-gray-400 mb-1 block">Tipo do Token (eX)</label>
                       <input type="number" required value={settings.cost_30d_type || ''} onChange={e => setSettings({...settings, cost_30d_type: Number(e.target.value)})} className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500" />
                     </div>
                   </div>
                </div>
             </div>
             <div className="flex justify-end">
               <button type="submit" disabled={loading} className="px-5 py-2.5 bg-black text-white rounded-xl text-sm font-bold hover:bg-gray-800 disabled:opacity-50">
                 Salvar Configurações
               </button>
             </div>
          </form>
        </div>
      )}

      <AnimatePresence mode="wait">
        {showAdd && user.role === 'admin' && activeTab === 'pedidos' && (
          <motion.div initial={{opacity:0, height:0}} animate={{opacity:1, height:'auto'}} exit={{opacity:0, height:0}} className="bg-gray-50 p-6 rounded-2xl border border-gray-200 mb-6 overflow-hidden">
            <h3 className="font-bold text-sm mb-4">Novo Pedido de Crédito</h3>
            <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
               <div>
                 <label className="text-[10px] uppercase font-bold text-gray-500 mb-1 block">ID do Usuário (Recebedor)</label>
                 <input required type="number" value={newReq.user_id_recebedor} onChange={e => setNewReq({...newReq, user_id_recebedor: e.target.value})} className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-500" />
               </div>
               <div>
                 <label className="text-[10px] uppercase font-bold text-gray-500 mb-1 block">Quantidade de Tokens</label>
                 <input required type="number" value={newReq.quantidade} onChange={e => setNewReq({...newReq, quantidade: e.target.value})} className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-500" />
               </div>
               <div>
                 <label className="text-[10px] uppercase font-bold text-gray-500 mb-1 block">Tipo do Token (Caracteres)</label>
                 <input required type="number" placeholder="Ex: 64, 128, 256" value={newReq.tipo_token} onChange={e => setNewReq({...newReq, tipo_token: e.target.value})} className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-500" />
               </div>
               <div className="flex gap-2">
                 <button type="submit" disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold flex-1 hover:bg-blue-700 disabled:opacity-50">Criar</button>
                 <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-xl text-sm font-bold hover:bg-gray-300">Cancelar</button>
               </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden min-h-[300px]">
        {activeTab === 'pedidos' ? (
          <table className="w-full text-left">
            <thead>
              <tr className="bg-[#F5F5F7] border-b border-gray-100">
                 <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">ID</th>
                 <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Usuário</th>
                 <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Quantidade / Tipo</th>
                 <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Data</th>
                 <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {requests.map(req => (
                <tr key={req.id} onClick={(e) => handleCopyId(e, req.id)} className="hover:bg-gray-50 transition-colors cursor-pointer group">
                  <td className="px-6 py-5">
                     <span className="font-mono text-sm text-[#1D1D1F] flex items-center gap-2">#{req.id} <Copy className="w-3 h-3 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" /></span>
                  </td>
                  <td className="px-6 py-5">
                    <p className="font-bold text-sm text-[#1D1D1F]">{req.recebedor_nome || `ID: ${req.user_id_recebedor}`}</p>
                    <p className="text-[10px] text-gray-500">{req.recebedor_email}</p>
                  </td>
                  <td className="px-6 py-5">
                    <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-black">{req.quantidade}x Tipo e{req.tipo_token}</span>
                  </td>
                  <td className="px-6 py-5 text-sm text-gray-500">
                     {new Date(req.created_at).toLocaleString('pt-BR')}
                  </td>
                  <td className="px-6 py-5 text-right flex justify-end items-center gap-2">
                    <span className={cn(
                      "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider",
                      req.status === 'pendente' ? "bg-amber-100 text-amber-800" :
                      req.status === 'aprovado' || req.status === 'gerado' ? "bg-green-100 text-green-800" :
                      "bg-red-100 text-red-800"
                    )}>
                      {req.status}
                    </span>
                    {user.role === 'admin' && req.status === 'pendente' && (
                      <div className="flex gap-1 ml-2">
                        <button onClick={(e) => { e.stopPropagation(); handleUpdateStatus(req.id, 'gerado'); }} className="flex items-center justify-center gap-1 bg-green-50 hover:bg-green-100 text-green-700 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
                           <CheckCircle className="w-4 h-4"/>
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); handleUpdateStatus(req.id, 'problema'); }} className="flex items-center justify-center gap-1 bg-red-50 hover:bg-red-100 text-red-700 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
                           <XCircle className="w-4 h-4"/>
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {requests.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center">
                    <Clock className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 text-sm">Nenhum pedido encontrado.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="bg-[#F5F5F7] border-b border-gray-100">
                 <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">ID</th>
                 <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Evento</th>
                 <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Data</th>
                 <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Detalhes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {userLogs.map(log => (
                <tr key={log.id} onClick={(e) => handleCopyId(e, log.id)} className="hover:bg-gray-50 transition-colors cursor-pointer group">
                  <td className="px-6 py-4">
                     <span className="font-mono text-sm text-[#1D1D1F] flex items-center gap-2">#{log.id} <Copy className="w-3 h-3 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" /></span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="bg-gray-100 px-2 py-1 rounded text-xs font-mono">{log.event_name}</span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString('pt-BR')}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 truncate max-w-xs" title={log.details}>
                    {log.details}
                  </td>
                </tr>
              ))}
              {userLogs.length === 0 && !loading && (
                <tr>
                  <td colSpan={4} className="px-6 py-10 text-center">
                    <p className="text-gray-500 text-sm">Nenhum log encontrado.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

    </motion.div>
  );
}
