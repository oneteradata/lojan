import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { RefreshCw, Search, Heart, MessageSquare, Share2 } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const apiFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const token = localStorage.getItem('token');
  const headers = { 
    ...init?.headers,
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
  return fetch(input, { ...init, headers });
};

export function AdminInteractions({ user }: { user: any }) {
  const [interactions, setInteractions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const fetchInteractions = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/interactions');
      const data = await res.json();
      setInteractions(data);
    } catch(e) {}
    setLoading(false);
  };

  useEffect(() => {
    fetchInteractions();
  }, []);

  const filteredInteractions = interactions.filter(i => 
    (i.user_name || i.user_email || '').toLowerCase().includes(search.toLowerCase()) || 
    (i.product_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (i.content || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in zoom-in-95 duration-300">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-[#1D1D1F]">Interações e Comentários</h2>
          <p className="text-sm text-[#86868B]">Visualize como os usuários estão interagindo com seus produtos.</p>
        </div>
        <button onClick={fetchInteractions} className="px-4 py-2 bg-white text-[#1D1D1F] border border-gray-200 rounded-xl hover:bg-gray-50 flex items-center gap-2 text-sm font-bold shadow-sm transition-all active:scale-95">
           <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
           Atualizar
        </button>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex gap-4 bg-gray-50/50">
           <div className="relative flex-1 max-w-md">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
             <input 
               type="text"
               placeholder="Buscar por usuário, produto ou comentário..."
               value={search}
               onChange={e => setSearch(e.target.value)}
               className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#007AFF]/20 focus:border-[#007AFF] transition-all"
             />
           </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
             <thead className="bg-gray-50/50 text-[#86868B] font-semibold">
                <tr>
                   <th className="px-6 py-4">Data</th>
                   <th className="px-6 py-4">Usuário</th>
                   <th className="px-6 py-4">Produto</th>
                   <th className="px-6 py-4">Tipo</th>
                   <th className="px-6 py-4">Conteúdo</th>
                </tr>
             </thead>
             <tbody className="divide-y divide-gray-100">
                {filteredInteractions.length === 0 ? (
                   <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                         Nenhuma interação encontrada.
                      </td>
                   </tr>
                ) : filteredInteractions.map(i => (
                   <tr key={i.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500">
                         {new Date(i.created_at).toLocaleString('pt-BR')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap font-medium">
                         <div>{i.user_name || 'Desconhecido'}</div>
                         <div className="text-xs text-gray-500">{i.user_email}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                         {i.product_name || `Produto #${i.product_id}`}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                         {i.interaction_type === 'like' && <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-red-50 text-red-600"> <Heart className="w-3 h-3" /> Curtida </span>}
                         {i.interaction_type === 'comment' && <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-blue-50 text-blue-600"> <MessageSquare className="w-3 h-3" /> Comentário </span>}
                         {i.interaction_type === 'share' && <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-green-50 text-green-600"> <Share2 className="w-3 h-3" /> Compartilhamento </span>}
                      </td>
                      <td className="px-6 py-4 max-w-xs truncate" title={i.content}>
                         {i.content || '-'}
                      </td>
                   </tr>
                ))}
             </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
