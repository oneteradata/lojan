import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { RefreshCw, Plus, CheckCircle, XCircle, Clock } from 'lucide-react';
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { apiFetch } from './utils';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function AdminCredits({ user }: { user: any }) {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  
  const [newReq, setNewReq] = useState({ user_id_recebedor: '', quantidade: '', tipo_token: '' });

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/credit-requests');
      const data = await res.json();
      setRequests(data);
    } catch(e) {}
    setLoading(false);
  };

  useEffect(() => {
    fetchRequests();
  }, []);

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

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 md:p-8 space-y-6 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-6">
         <div>
           <h2 className="text-2xl font-bold text-[#1D1D1F]">Pedidos Administrativos</h2>
           <p className="text-xs text-gray-500 mt-1">Créditos e aprovações do sistema</p>
         </div>
         <div className="flex gap-2">
           <button onClick={fetchRequests} className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center hover:bg-gray-200 text-gray-600 transition-colors">
             <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
           </button>
           {user.role === 'admin' && (
             <button onClick={() => setShowAdd(true)} className="w-10 h-10 bg-black text-white rounded-full flex items-center justify-center hover:scale-105 transition-transform shadow-lg shadow-black/20">
               <Plus className="w-5 h-5" />
             </button>
           )}
         </div>
      </div>

      <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100 mb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
         <div>
           <h3 className="font-bold text-sm text-[#1D1D1F] uppercase tracking-widest">Sua Carteira</h3>
           <p className="text-xs text-gray-500">Saldo atual de tokens disponíveis para cadastro de produtos.</p>
         </div>
         <div className="flex flex-wrap gap-2">
           {user.wallet?.tokens?.length > 0 ? (
             Object.entries(
               user.wallet.tokens.reduce((acc: any, val: string) => {
                 acc[val.length] = (acc[val.length] || 0) + 1;
                 return acc;
               }, {})
             ).map(([len, count]) => (
               <span key={len} className="bg-green-100 text-green-800 text-sm font-black px-4 py-2 rounded-xl uppercase border-b-2 border-green-200 shadow-sm flex flex-col items-center justify-center min-w-[80px]">
                 <span className="text-2xl">{String(count)}</span>
                 <span className="text-[9px] opacity-70">Tipo e{len}</span>
               </span>
             ))
           ) : (
             <span className="text-sm font-bold text-gray-400 bg-white px-4 py-2 rounded-xl border border-gray-200 shadow-sm">Nenhum token</span>
           )}
         </div>
      </div>

      {showAdd && user.role === 'admin' && (
        <div className="bg-gray-50 p-6 rounded-2xl border border-gray-200 mb-6">
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
        </div>
      )}

      <div className="space-y-4">
        {requests.map(req => (
           <div key={req.id} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
             <div>
                <p className="font-bold text-sm text-[#1D1D1F]">
                  Pedido #{req.id} <span className="mx-2 text-gray-300">|</span> {req.quantidade} tokens (tipo {req.tipo_token})
                </p>
                <div className="text-xs text-gray-500 mt-1 space-y-0.5">
                  <p>Para o usuário: ID {req.user_id_recebedor} {req.recebedor_nome && `- ${req.recebedor_nome}`}</p>
                  <p>Solicitado por: {req.solicitante_nome}</p>
                </div>
             </div>
             
             <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
                <span className={cn(
                  "px-3 py-1 rounded-full text-xs font-bold uppercase w-full sm:w-auto text-center",
                  req.status === 'pendente' ? "bg-amber-100 text-amber-700" :
                  req.status === 'gerado' ? "bg-green-100 text-green-700" :
                  "bg-red-100 text-red-700"
                )}>
                  {req.status}
                </span>

                {user.role === 'admin' && req.status === 'pendente' && (
                  <div className="flex gap-2 w-full sm:w-auto">
                    <button onClick={() => handleUpdateStatus(req.id, 'gerado')} className="flex items-center justify-center gap-1 bg-green-50 hover:bg-green-100 text-green-700 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors w-full sm:w-auto">
                       <CheckCircle className="w-3 h-3"/> Gerar
                    </button>
                    <button onClick={() => handleUpdateStatus(req.id, 'problema')} className="flex items-center justify-center gap-1 bg-red-50 hover:bg-red-100 text-red-700 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors w-full sm:w-auto">
                       <XCircle className="w-3 h-3"/> Problema
                    </button>
                  </div>
                )}
             </div>
           </div>
        ))}

        {requests.length === 0 && !loading && (
          <div className="text-center p-8 text-gray-400">Nenhum pedido encontrado.</div>
        )}
      </div>

    </motion.div>
  );
}
