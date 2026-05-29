import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RefreshCw, Search, Trash2, Lock, X } from 'lucide-react';
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { apiFetch } from './utils';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function AdminLogs({ user }: { user: any }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  
  // States para limpeza de logs (Admin Only)
  const [showClearModal, setShowClearModal] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState('');

  const fetchLogs = async () => {
    setLoading(true);
    try {
      // Se não for admin, busca apenas seus próprios logs de atividades (/api/my-logs)
      const endpoint = user?.role === 'admin' ? '/api/logs' : '/api/my-logs';
      const res = await apiFetch(endpoint);
      const data = await res.json();
      setLogs(Array.isArray(data) ? data : []);
    } catch(e) {
      console.error(e);
      setLogs([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchLogs();
  }, [user]);

  const handleClearLogs = async () => {
    if (!confirmPassword) {
      setClearError('Por favor, informe sua senha.');
      return;
    }
    setClearing(true);
    setClearError('');
    try {
      const res = await apiFetch('/api/logs/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: confirmPassword })
      });
      const data = await res.json();
      if (data.success) {
        setShowClearModal(false);
        setConfirmPassword('');
        setLogs([]);
        alert('Todos os logs do sistema foram deletados com sucesso.');
      } else {
        setClearError(data.error || 'Senha incorreta. Não foi possível limpar os logs.');
      }
    } catch (e) {
      setClearError('Falha ao comunicar com o servidor.');
    }
    setClearing(false);
  };

  const filteredLogs = logs.filter(l => 
    (l.user_email || '').toLowerCase().includes(search.toLowerCase()) || 
    (l.event_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (l.details || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 md:p-8 space-y-6 max-w-4xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
         <div>
           <h2 className="text-2xl font-bold text-[#1D1D1F]">Logs do Sistema</h2>
           <p className="text-xs text-gray-500 mt-1">
             {user?.role === 'admin' ? 'Auditoria completa de ações do painel' : 'Seus registros de atividade privada'}
           </p>
         </div>
         <div className="flex gap-2 w-full md:w-auto items-center">
           <div className="relative flex-1 md:w-64">
             <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
             <input type="text" placeholder="Buscar logs..." value={search} onChange={e => setSearch(e.target.value)} className="w-full bg-gray-50 pl-9 pr-4 py-2 rounded-full text-sm border border-gray-200 focus:outline-none focus:border-blue-500" />
           </div>
           
           <button onClick={fetchLogs} className="w-10 h-10 shrink-0 bg-gray-100 rounded-full flex items-center justify-center hover:bg-gray-200 text-gray-600 transition-colors" title="Atualizar">
             <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
           </button>

           {user?.role === 'admin' && (
             <button
               onClick={() => {
                 setClearError('');
                 setConfirmPassword('');
                 setShowClearModal(true);
               }}
               className="h-10 px-4 shrink-0 bg-red-50 text-red-650 hover:bg-red-100 rounded-full flex items-center gap-2 text-xs font-semibold border border-red-200 transition-all cursor-pointer"
               title="Limpar Logs"
             >
               <Trash2 className="w-4 h-4" />
               <span className="hidden sm:inline">Limpar Logs</span>
             </button>
           )}
         </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[600px]">
          <thead>
            <tr className="bg-gray-50/50 border-b border-gray-100">
               <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Data/Hora</th>
               <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Usuário</th>
               <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Evento</th>
               <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Detalhes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 text-sm">
            {filteredLogs.map(log => (
              <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 text-gray-500 whitespace-nowrap">{new Date(log.created_at).toLocaleString('pt-BR')}</td>
                <td className="px-6 py-4 font-medium text-[#1D1D1F] whitespace-nowrap">{log.user_email || `ID: ${log.user_id}`}</td>
                <td className="px-6 py-4 text-gray-650 whitespace-nowrap">
                   <span className="bg-gray-100 px-2 py-1 rounded text-xs font-mono">{log.event_name}</span>
                </td>
                <td className="px-6 py-4 text-gray-500 max-w-[200px] truncate" title={log.details}>{log.details}</td>
              </tr>
            ))}
            {filteredLogs.length === 0 && !loading && (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-gray-400">Nenhum log de auditoria encontrado.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Decidido de Validação de Senha para Deletar Logs */}
      <AnimatePresence>
        {showClearModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl p-6 shadow-2xl border border-gray-100 w-full max-w-md relative overflow-hidden"
            >
              <button
                onClick={() => setShowClearModal(false)}
                className="absolute right-4 top-4 text-gray-400 hover:text-gray-600 grayscale hover:grayscale-0 transition-all"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex flex-col items-center text-center mt-2">
                <div className="w-12 h-12 bg-red-100/60 rounded-full flex items-center justify-center text-red-650 mb-4">
                  <Lock className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-[#1D1D1F]">Confirmação de Senha Requerida</h3>
                <p className="text-xs text-gray-500 mt-2 max-w-sm">
                  Esta ação é destrutiva e irrecorrente. Todos os logs de auditoria do sistema serão permanentemente excluídos. Digite sua senha de administração para prosseguir.
                </p>
              </div>

              <div className="mt-6 space-y-4">
                <div>
                  <label className="text-[10px] font-bold uppercase text-gray-550 block mb-1">Senha de Admin</label>
                  <input
                    type="password"
                    placeholder="Sua senha do painel para aprovar"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-red-500 transition-colors"
                  />
                </div>

                {clearError && (
                  <div className="p-3 bg-red-50 border border-red-100 text-xs font-semibold text-red-600 rounded-xl">
                    {clearError}
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => setShowClearModal(false)}
                    disabled={clearing}
                    className="flex-1 border border-gray-200 hover:bg-gray-50 text-gray-700 py-2.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer"
                  >
                    Calcular Limites (Voltar)
                  </button>
                  <button
                    onClick={handleClearLogs}
                    disabled={clearing}
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {clearing ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4" />
                        Limpar Definitivamente
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
