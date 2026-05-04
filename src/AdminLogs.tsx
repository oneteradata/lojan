import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { RefreshCw, Search } from 'lucide-react';
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

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/logs');
      const data = await res.json();
      setLogs(data);
    } catch(e) {}
    setLoading(false);
  };

  useEffect(() => {
    fetchLogs();
  }, []);

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
           <p className="text-xs text-gray-500 mt-1">Auditoria de ações</p>
         </div>
         <div className="flex gap-2 w-full md:w-auto">
           <div className="relative flex-1 md:w-64">
             <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
             <input type="text" placeholder="Buscar logs..." value={search} onChange={e => setSearch(e.target.value)} className="w-full bg-gray-50 pl-9 pr-4 py-2 rounded-full text-sm border border-gray-200 focus:outline-none focus:border-blue-500" />
           </div>
           <button onClick={fetchLogs} className="w-10 h-10 shrink-0 bg-gray-100 rounded-full flex items-center justify-center hover:bg-gray-200 text-gray-600 transition-colors">
             <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
           </button>
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
                <td className="px-6 py-4 text-gray-600 whitespace-nowrap">
                   <span className="bg-gray-100 px-2 py-1 rounded text-xs font-mono">{log.event_name}</span>
                </td>
                <td className="px-6 py-4 text-gray-500 max-w-[200px] truncate" title={log.details}>{log.details}</td>
              </tr>
            ))}
            {filteredLogs.length === 0 && !loading && (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-gray-400">Nenhum log encontrado.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
