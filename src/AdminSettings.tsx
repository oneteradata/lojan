import React, { useState, useEffect } from 'react';
import { Save, User as UserIcon, RefreshCw } from 'lucide-react';
import { apiFetch } from './utils';
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function AdminSettings({ user, onRefreshUser }: { user: any, onRefreshUser: () => void }) {
  const [formData, setFormData] = useState({
    name: user?.name || '',
    company_name: user?.company_name || '',
    company_logo: user?.company_logo || '',
    dashboard_theme: user?.dashboard_theme || 'light',
    password: ''
  });
  
  const [loading, setLoading] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || '',
        company_name: user.company_name || '',
        company_logo: user.company_logo || '',
        dashboard_theme: user.dashboard_theme || 'light',
        password: ''
      });
    }
  }, [user]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleLogoUpload = async (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    setError('');
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error("A imagem deve ter no máximo 2MB");
      
      const formDataUpload = new FormData();
      formDataUpload.append('file', file);
      
      const res = await apiFetch('/api/upload', {
         method: 'POST',
         body: formDataUpload
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Falha ao fazer upload da logo');

      setFormData((prev) => ({...prev, company_logo: data.url}));
    } catch (err: any) {
      setError('Erro no upload: ' + err.message);
    }
    setUploadingLogo(false);
    e.target.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (uploadingLogo) return;
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const res = await apiFetch('/api/me', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      const data = await res.json();
      if (data.success) {
        setMessage('Configurações atualizadas com sucesso!');
        setFormData(prev => ({ ...prev, password: '' })); // clear password
        onRefreshUser(); // update context user
      } else {
        throw new Error(data.error || 'Erro ao atualizar configurações.');
      }
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-extrabold tracking-tight">Meus Dados / Configurações</h2>
          <p className="text-sm font-semibold opacity-60 uppercase tracking-wider mt-1">Gerencie seu perfil e preferência de visual</p>
        </div>
      </div>

      <div className="bg-white/40 border border-white/60 p-6 md:p-8 rounded-[2rem] shadow-[0_10px_40px_-10px_rgba(0,0,0,0.04),_0_2px_10px_-2px_rgba(0,0,0,0.02)] relative overflow-hidden backdrop-blur-xl">
         {error && <div className="mb-4 p-4 text-xs font-bold bg-red-50 text-red-600 rounded-2xl">{error}</div>}
         {message && <div className="mb-4 p-4 text-xs font-bold bg-green-50 text-green-600 rounded-2xl">{message}</div>}

         <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
           <div className="space-y-4">
             <h3 className="text-lg font-bold">Perfil Pessoal</h3>
             <div>
                <label className="block text-xs font-bold uppercase tracking-widest opacity-60 mb-2 pl-1">Nome Completo</label>
                <input 
                  type="text" 
                  name="name" 
                  value={formData.name} 
                  onChange={handleChange} 
                  className="w-full bg-white/50 border border-black/5 rounded-2xl px-5 py-3 text-sm focus:ring-2 focus:ring-[#0058bc]/20 outline-none transition-all"
                  required
                />
             </div>
             <div>
                <label className="block text-xs font-bold uppercase tracking-widest opacity-60 mb-2 pl-1">Nova Senha (deixe em branco para não alterar)</label>
                <input 
                  type="password" 
                  name="password" 
                  value={formData.password} 
                  onChange={handleChange} 
                  className="w-full bg-white/50 border border-black/5 rounded-2xl px-5 py-3 text-sm focus:ring-2 focus:ring-[#0058bc]/20 outline-none transition-all"
                />
             </div>
           </div>

           <div className="space-y-4 pt-4 border-t border-black/5">
             <h3 className="text-lg font-bold">Dados da Loja</h3>
             <div>
                <label className="block text-xs font-bold uppercase tracking-widest opacity-60 mb-2 pl-1">Nome da Empresa</label>
                <input 
                  type="text" 
                  name="company_name" 
                  value={formData.company_name} 
                  onChange={handleChange} 
                  className="w-full bg-white/50 border border-black/5 rounded-2xl px-5 py-3 text-sm focus:ring-2 focus:ring-[#0058bc]/20 outline-none transition-all"
                />
             </div>
             
             <div>
                <label className="block text-xs font-bold uppercase tracking-widest opacity-60 mb-2 pl-1">Logo da Empresa</label>
                <div className="flex items-center gap-4 bg-white/50 border border-black/5 p-4 rounded-3xl">
                   {formData.company_logo ? (
                     <img src={formData.company_logo} alt="Logo" className="w-16 h-16 rounded-2xl object-cover bg-black/5" />
                   ) : (
                     <div className="w-16 h-16 rounded-2xl bg-black/5 flex items-center justify-center text-black/20">
                       <UserIcon className="w-8 h-8" />
                     </div>
                   )}
                   <div className="flex-1">
                     <input 
                       type="file" 
                       accept="image/*" 
                       onChange={handleLogoUpload} 
                       disabled={uploadingLogo} 
                       className="text-xs file:mr-2 file:py-1.5 file:px-4 file:rounded-xl file:border-0 file:text-[11px] file:bg-[#0058bc]/5 file:text-[#0058bc] hover:file:bg-[#0058bc]/10 cursor-pointer w-full"
                     />
                     {uploadingLogo && <p className="text-[10px] text-[#0058bc] font-bold mt-2 animate-pulse">Enviando logo...</p>}
                   </div>
                </div>
             </div>
           </div>

           <div className="space-y-4 pt-4 border-t border-black/5">
             <h3 className="text-lg font-bold">Preferências Visuais</h3>
             <div>
                <label className="block text-xs font-bold uppercase tracking-widest opacity-60 mb-2 pl-1">Tema do Painel</label>
                <select 
                  name="dashboard_theme" 
                  value={formData.dashboard_theme} 
                  onChange={handleChange}
                  className="w-full bg-white/50 border border-black/5 rounded-2xl px-5 py-3 text-sm focus:ring-2 focus:ring-[#0058bc]/20 outline-none transition-all"
                >
                  <option value="light">Claro (Light)</option>
                  <option value="dark">Escuro (Dark)</option>
                </select>
             </div>
           </div>

           <button 
              type="submit" 
              disabled={loading || uploadingLogo} 
              className={cn(
                "w-full bg-[#0058bc] hover:bg-[#004e9c] text-white font-extrabold text-sm py-4 rounded-2xl shadow-lg shadow-[#0058bc]/20 transition-all flex justify-center items-center gap-2",
                (loading || uploadingLogo) && "opacity-70 cursor-not-allowed"
              )}
           >
              {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              SALVAR ALTERAÇÕES
           </button>
         </form>
      </div>
    </div>
  );
}
