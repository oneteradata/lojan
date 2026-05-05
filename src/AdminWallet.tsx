import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { RefreshCw, List } from 'lucide-react';
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { apiFetch } from './utils';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function AdminWallet({ user, onRefreshUser }: { user: any, onRefreshUser?: () => void }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

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

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 md:p-8 space-y-8 max-w-4xl mx-auto">
      <div className="flex justify-between items-center bg-white p-6 rounded-[32px] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100">
         <div>
           <h2 className="text-2xl font-bold text-[#1D1D1F]">Sua Carteira</h2>
           <p className="text-sm text-gray-500 mt-1">Saldo atual de tokens disponíveis para cadastro.</p>
         </div>
         <button onClick={fetchData} className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center hover:bg-gray-200 text-gray-600 transition-colors">
            <RefreshCw className={cn("w-5 h-5", loading && "animate-spin")} />
         </button>
      </div>

      <div className="flex flex-wrap gap-3">
         {user.wallet?.tokens?.length > 0 ? (
           Object.entries(
             user.wallet.tokens.reduce((acc: any, val: string) => {
               acc[val.length] = (acc[val.length] || 0) + 1;
               return acc;
             }, {})
           ).map(([len, count]) => (
             <span key={len} className="bg-green-100 text-green-800 text-sm font-black px-5 py-3 rounded-2xl uppercase border-b-4 border-green-200 shadow-sm flex flex-col items-center justify-center min-w-[90px]">
               <span className="text-3xl">{String(count)}</span>
               <span className="text-[10px] opacity-70 tracking-widest mt-1">TIPO E{len}</span>
             </span>
           ))
         ) : (
           <span className="text-sm font-bold text-gray-400 bg-white px-5 py-3 rounded-2xl border border-gray-200 shadow-sm">Nenhum token disponível</span>
         )}
      </div>

      <div className="bg-white rounded-[32px] border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center gap-2">
          <List className="w-5 h-5 text-[#86868B]" />
          <h3 className="font-bold text-[#1D1D1F]">Extrato / Logs de Atividades</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[600px]">
            <thead>
              <tr className="bg-gray-50/50">
                <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Data/Hora</th>
                <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Evento</th>
                <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Detalhes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 text-sm">
              {logs.map(log => (
                <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-gray-500 whitespace-nowrap">{new Date(log.created_at).toLocaleString('pt-BR')}</td>
                  <td className="px-6 py-4 text-gray-600 whitespace-nowrap">
                    <span className={cn(
                      "px-2 py-1 rounded text-xs font-bold uppercase",
                      log.event_name?.includes('aprovado') ? "bg-green-100 text-green-700" :
                      (log.event_name?.includes('recusado') || log.event_name?.includes('timeout') || log.event_name?.includes('erro')) ? "bg-red-100 text-red-700" :
                      log.event_name === 'produto_adicionado' ? "bg-yellow-100 text-yellow-700" :
                      "bg-gray-100 text-gray-600"
                    )}>
                      {(log.event_name || 'Desconhecido').replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-700">{log.details}</td>
                </tr>
              ))}
              {logs.length === 0 && !loading && (
                <tr>
                  <td colSpan={3} className="px-6 py-8 text-center text-gray-400 text-sm">Nenhum registro encontrado no seu extrato.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </motion.div>
  );
}
