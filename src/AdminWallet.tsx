import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RefreshCw, List, Eye, EyeOff, Send, Download, CreditCard, ArrowUpRight, ArrowDownLeft, X, Check } from 'lucide-react';
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { apiFetch } from './utils';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function AdminWallet({ user, onRefreshUser }: { user: any, onRefreshUser?: () => void }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showBalance, setShowBalance] = useState(true);
  const [activeTab, setActiveTab] = useState<'extrato' | 'transferir' | 'receber'>('extrato');

  // Transfer state
  const [transferUserId, setTransferUserId] = useState('');
  const [transferAmount, setTransferAmount] = useState('1');
  const [transferType, setTransferType] = useState('14'); // token type like 14, 15
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferSuccess, setTransferSuccess] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (onRefreshUser) onRefreshUser();
      const res = await apiFetch('/api/my-logs');
      const data = await res.json();
      if (Array.isArray(data)) {
        setLogs(data);
      }
    } catch(e) {}
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setTransferLoading(true);
    try {
      const res = await apiFetch('/api/transfer_tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiver_id: transferUserId,
          amount: parseInt(transferAmount),
          token_length: parseInt(transferType)
        })
      });
      const data = await res.json();
      if (data.success) {
        setTransferSuccess(true);
        fetchData();
        setTimeout(() => setTransferSuccess(false), 3000);
        setTransferUserId('');
      } else {
        alert(data.error || 'Erro ao transferir.');
      }
    } catch(err) {
      alert('Erro de conexão ao tentar transferir.');
    }
    setTransferLoading(false);
  };

  const totalTokens = user.wallet?.tokens?.length || 0;
  const groupedTokens = user.wallet?.tokens?.reduce((acc: any, val: string) => {
    acc[val.length] = (acc[val.length] || 0) + 1;
    return acc;
  }, {}) || {};

  return (
    <div className="bg-[#F5F5F7] min-h-full font-sans pb-20 relative">
       {/* Header Digital Bank Style */}
       <div className="bg-[#007AFF] text-white pt-8 pb-32 px-6 rounded-b-[40px] shadow-lg relative z-0">
          <div className="flex justify-between items-center mb-8">
             <div className="flex items-center gap-3">
                {user.company_logo ? (
                  <img src={user.company_logo} alt="Perfil" className="w-12 h-12 rounded-full border-2 border-white/20 object-cover" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center font-bold text-lg border-2 border-white/20">
                    {user.name?.[0]?.toUpperCase() || 'U'}
                  </div>
                )}
                <div>
                   <p className="text-sm text-blue-100 font-medium">Olá,</p>
                   <p className="text-lg font-bold leading-tight truncate max-w-[200px]">{user.name}</p>
                </div>
             </div>
             <div className="flex gap-4">
                <button onClick={() => setShowBalance(!showBalance)} className="text-white hover:text-blue-200 transition-colors">
                  {showBalance ? <EyeOff className="w-6 h-6" /> : <Eye className="w-6 h-6" />}
                </button>
             </div>
          </div>

          <div className="mb-2">
            <p className="text-sm font-medium text-blue-100 mb-1">Saldo eTokens</p>
            <div className="flex items-baseline gap-2">
               {showBalance ? (
                 <>
                   <h2 className="text-4xl font-bold">{totalTokens}</h2>
                   <span className="text-lg font-medium text-blue-200 uppercase tracking-widest">Unidades</span>
                 </>
               ) : (
                 <div className="w-32 h-10 bg-white/20 rounded-lg animate-pulse" />
               )}
            </div>
            {showBalance && totalTokens > 0 && (
              <div className="mt-4 flex gap-2 flex-wrap">
                 {Object.entries(groupedTokens).map(([tipo, qtd]: any) => (
                    <span key={tipo} className="bg-white/10 px-3 py-1 rounded-full text-xs font-bold uppercase border border-white/20">
                      TIPO E{tipo}: {qtd}
                    </span>
                 ))}
              </div>
            )}
          </div>
       </div>

       {/* Floating Action Buttons */}
       <div className="px-6 -mt-10 relative z-10">
          <div className="bg-white rounded-3xl p-4 shadow-xl border border-gray-100 flex justify-between gap-2 overflow-x-auto scrollbar-none">
             <button onClick={() => setActiveTab('transferir')} className="flex flex-col items-center gap-2 min-w-[72px] shrink-0 hover:opacity-80 transition-opacity">
                <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm", activeTab === 'transferir' ? "bg-[#007AFF] text-white" : "bg-gray-50 text-[#007AFF]")}>
                   <Send className="w-6 h-6" />
                </div>
                <span className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Transferir</span>
             </button>
             <button onClick={() => setActiveTab('receber')} className="flex flex-col items-center gap-2 min-w-[72px] shrink-0 hover:opacity-80 transition-opacity">
                <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm", activeTab === 'receber' ? "bg-[#007AFF] text-white" : "bg-gray-50 text-[#007AFF]")}>
                   <Download className="w-6 h-6" />
                </div>
                <span className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Receber</span>
             </button>
             <button onClick={() => setActiveTab('extrato')} className="flex flex-col items-center gap-2 min-w-[72px] shrink-0 hover:opacity-80 transition-opacity">
                <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm", activeTab === 'extrato' ? "bg-[#007AFF] text-white" : "bg-gray-50 text-[#007AFF]")}>
                   <List className="w-6 h-6" />
                </div>
                <span className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Extrato</span>
             </button>
             <button onClick={() => {}} className="flex flex-col items-center gap-2 min-w-[72px] shrink-0 hover:opacity-80 transition-opacity">
                <div className="w-14 h-14 bg-gray-50 rounded-2xl flex items-center justify-center text-[#007AFF] shadow-sm">
                   <CreditCard className="w-6 h-6" />
                </div>
                <span className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Comprar</span>
             </button>
          </div>
       </div>

       {/* Content Area */}
       <div className="px-6 mt-6">
         <AnimatePresence mode="wait">
           {activeTab === 'extrato' && (
             <motion.div key="extrato" initial={{opacity:0, y:10}} animate={{opacity:1, y:0}} exit={{opacity:0, y:-10}}>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold text-[#1D1D1F] uppercase tracking-wider text-sm">Últimas Transações</h3>
                  <button onClick={fetchData} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-[#007AFF] transition-colors">
                     <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
                  </button>
                </div>
                <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 flex flex-col gap-4">
                   {logs.length > 0 ? logs.map(log => {
                     const isDebit = log.event_name?.includes('recusado') || log.event_name?.includes('timeout') || log.event_name?.includes('erro');
                     const isCredit = log.event_name?.includes('aprovado') || log.event_name === 'produto_adicionado';
                     const isTransfer = log.event_name === 'transferencia';
                     
                     return (
                       <div key={log.id} className="flex justify-between items-center border-b border-gray-50 pb-4 last:border-0 last:pb-0">
                         <div className="flex items-center gap-3">
                           <div className={cn(
                             "w-10 h-10 rounded-full flex items-center justify-center shrink-0", 
                             isTransfer ? "bg-purple-100 text-purple-600" :
                             isCredit ? "bg-green-100 text-green-600" : 
                             isDebit ? "bg-red-100 text-red-600" : 
                             "bg-gray-100 text-gray-600"
                           )}>
                             {isTransfer ? <ArrowUpRight className="w-5 h-5"/> : (isCredit ? <ArrowDownLeft className="w-5 h-5" /> : <List className="w-5 h-5" />)}
                           </div>
                           <div>
                             <p className="text-sm font-bold text-[#1D1D1F]">{(log.event_name || 'Registro').replace(/_/g, ' ').toUpperCase()}</p>
                             <p className="text-[10px] text-gray-500 line-clamp-1">{log.details}</p>
                           </div>
                         </div>
                         <div className="text-right shrink-0 ml-4">
                           <p className="text-xs text-gray-400 font-medium">{new Date(log.created_at).toLocaleDateString('pt-BR', {day: '2-digit', month: 'short'})}</p>
                         </div>
                       </div>
                     )
                   }) : (
                     <p className="text-center text-gray-400 text-sm py-8">Nenhuma transação encontrada.</p>
                   )}
                </div>
             </motion.div>
           )}

           {activeTab === 'transferir' && (
             <motion.div key="transferir" initial={{opacity:0, y:10}} animate={{opacity:1, y:0}} exit={{opacity:0, y:-10}}>
                <h3 className="font-bold text-[#1D1D1F] uppercase tracking-wider text-sm mb-4">Transferência de eToken</h3>
                <form onSubmit={handleTransfer} className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 flex flex-col gap-5">
                   {transferSuccess ? (
                     <div className="bg-green-50 rounded-2xl p-6 flex flex-col items-center justify-center text-center">
                       <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center text-white mb-4">
                         <Check className="w-8 h-8" />
                       </div>
                       <h4 className="font-bold text-green-900 text-lg mb-1">Transferência Concluída!</h4>
                       <p className="text-green-700 text-sm mb-4">O destinatário já recebeu os eTokens.</p>
                       <button onClick={() => setTransferSuccess(false)} type="button" className="text-green-600 font-bold uppercase text-[10px] tracking-widest border border-green-200 px-6 py-2 rounded-full hover:bg-green-100 transition-colors">Nova Transferência</button>
                     </div>
                   ) : (
                     <>
                       <div>
                         <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2 block">ID DO DESTINATÁRIO</label>
                         <input required type="number" value={transferUserId} onChange={e=>setTransferUserId(e.target.value)} placeholder="Informe o ID do usuário" className="w-full bg-gray-50 border border-gray-200 focus:border-[#007AFF] rounded-2xl px-4 py-3 text-sm font-semibold outline-none" />
                       </div>
                       <div className="flex gap-4">
                         <div className="flex-1">
                           <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2 block">QUANTIDADE</label>
                           <input required type="number" min="1" value={transferAmount} onChange={e=>setTransferAmount(e.target.value)} className="w-full bg-gray-50 border border-gray-200 focus:border-[#007AFF] rounded-2xl px-4 py-3 text-lg font-bold text-[#007AFF] outline-none" />
                         </div>
                         <div className="flex-1">
                           <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2 block">TIPO ETOKEN</label>
                           <select value={transferType} onChange={e=>setTransferType(e.target.value)} className="w-full bg-gray-50 border border-gray-200 focus:border-[#007AFF] rounded-2xl px-4 py-3 sm:py-[13.5px] text-sm font-semibold outline-none appearance-none">
                             {Object.keys(groupedTokens).length > 0 ? (
                               Object.keys(groupedTokens).map(t => (
                                 <option key={t} value={t}>E{t}</option>
                               ))
                             ) : (
                               <option value="14">E14 (Padrão)</option>
                             )}
                           </select>
                         </div>
                       </div>
                       <div className="pt-2 border-t border-gray-50 mt-2">
                         <button type="submit" disabled={transferLoading} className="w-full bg-[#007AFF] text-white rounded-2xl py-4 font-bold uppercase tracking-widest text-xs hover:bg-[#0066CC] transition-colors disabled:opacity-50">
                           {transferLoading ? 'Processando...' : 'Confirmar Transferência'}
                         </button>
                       </div>
                     </>
                   )}
                </form>
             </motion.div>
           )}

           {activeTab === 'receber' && (
             <motion.div key="receber" initial={{opacity:0, y:10}} animate={{opacity:1, y:0}} exit={{opacity:0, y:-10}}>
                <h3 className="font-bold text-[#1D1D1F] uppercase tracking-wider text-sm mb-4">Recebimento</h3>
                <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center gap-4">
                  <div className="w-24 h-24 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200 flex items-center justify-center">
                    <Download className="w-10 h-10 text-gray-300" />
                  </div>
                  <div>
                    <p className="text-gray-500 text-sm mb-1">Para receber eTokens, informa seu ID:</p>
                    <p className="text-3xl font-black text-[#007AFF] tracking-tight">{user.id}</p>
                  </div>
                </div>
             </motion.div>
           )}
         </AnimatePresence>
       </div>
    </div>
  );
}

