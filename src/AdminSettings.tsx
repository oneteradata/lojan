import React, { useState, useEffect } from 'react';
import { Save, User as UserIcon, RefreshCw, KeyRound, Smartphone, Fingerprint, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
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

  // States para MFA Biométrico
  const [mfaActive, setMfaActive] = useState(user?.mfa_biometric_enabled || false);
  const [showBiometricSetup, setShowBiometricSetup] = useState(false);
  const [biometricSuccess, setBiometricSuccess] = useState(false);
  const [togglingMfa, setTogglingMfa] = useState(false);

  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || '',
        company_name: user.company_name || '',
        company_logo: user.company_logo || '',
        dashboard_theme: user.dashboard_theme || 'light',
        password: ''
      });
      setMfaActive(user.mfa_biometric_enabled || false);
    }
  }, [user]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleToggleBiometricMfa = async () => {
    if (!mfaActive) {
      // Inicia fluxo de captura simulada de biometria móvel
      setShowBiometricSetup(true);
      setBiometricSuccess(false);
    } else {
      if (window.confirm("Deseja realmente desativar seu acesso rápido de 2 fatores? Seu login convencional por senha será reativado para esta conta.")) {
        setTogglingMfa(true);
        try {
          const res = await apiFetch('/api/users/me/toggle-mfa', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled: false })
          });
          const data = await res.json();
          if (data.success) {
            setMfaActive(false);
            onRefreshUser();
            setMessage('Autenticação Biométrica desativada. Login por senha convencional restaurado.');
          }
        } catch(e) {
          setError('Erro ao desativar autenticação biométrica.');
        }
        setTogglingMfa(false);
      }
    }
  };

  const confirmBiometricEnrollment = async () => {
    setTogglingMfa(true);
    try {
      const res = await apiFetch('/api/users/me/toggle-mfa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true })
      });
      const data = await res.json();
      if (data.success) {
        setBiometricSuccess(true);
        setTimeout(() => {
          setShowBiometricSetup(false);
          setMfaActive(true);
          onRefreshUser();
          setMessage('Login rápido por biometria de 2 fatores ativado com sucesso!');
        }, 1500);
      }
    } catch(e) {
      setError('Erro ao registrar biometria de segurança.');
      setShowBiometricSetup(false);
    }
    setTogglingMfa(false);
  };

  const handleLogoUpload = async (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    setError('');
    try {
      if (file.size > 30 * 1024 * 1024) throw new Error("A imagem deve ter no máximo 30MB");
      
      const formDataUpload = new FormData();
      formDataUpload.append('file', file);
      
      const res = await apiFetch('/api/upload-single', {
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
          <h2 className="text-xl md:text-2xl font-extrabold tracking-tight col-span-2">Meus Dados / Configurações</h2>
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

            {/* REQ: Ativar Login Rápido Biometrico 2FA */}
            <div className="space-y-4 pt-6 border-t border-black/5">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-green-600" />
                <span>Segurança de 2 Fatores (MFA Celular)</span>
              </h3>
              
              <div className="bg-gray-50 border border-gray-100 p-5 rounded-3xl space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                  <div className="space-y-1">
                    <h4 className="text-sm font-bold text-[#1D1D1F] flex items-center gap-2">
                      <Fingerprint className="w-4 h-4 text-blue-500" />
                      Login Rápido Biométrico de 2 Fatores
                    </h4>
                    <p className="text-xs text-gray-500 leading-relaxed max-w-md">
                      Impedirá logins tradicionais por senha e exigirá liberação instantânea por câmera de QR Code + leitura da sua digital no celular previamente cadastrado. Exclusivo para computadores.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleToggleBiometricMfa}
                    disabled={togglingMfa}
                    className={cn(
                      "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500/20",
                      mfaActive ? "bg-[#007AFF]" : "bg-gray-200"
                    )}
                  >
                    <span
                      className={cn(
                        "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out",
                        mfaActive ? "translate-x-5" : "translate-x-0"
                      )}
                    />
                  </button>
                </div>

                {mfaActive && (
                  <div className="bg-blue-50/50 border border-blue-100 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-blue-700">
                    <div className="flex items-center gap-3">
                      <Smartphone className="w-5 h-5 text-blue-500 shrink-0" />
                      <div>
                        <p className="font-bold">Dispositivo Móvel Cadastrado e Conectado</p>
                        <p className="text-[10px] text-blue-500 font-mono mt-0.5 select-all">DEVICE: {user?.mfa_device_id || '987c2b53-fef8-4ca4-9cc1-ec59a721b0dc'}</p>
                      </div>
                    </div>
                    <span className="bg-blue-500 text-white font-extrabold text-[9px] px-2 py-0.5 rounded-full uppercase tracking-wider self-start sm:self-auto shrink-0">
                      Duplo Fator Ativo
                    </span>
                  </div>
                )}
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

      {/* MODAL DE ENROLLMENT DE BIOMETRIA MÓVEL SIMULADO */}
      <AnimatePresence>
        {showBiometricSetup && (
          <div className="fixed inset-0 z-55 flex items-center justify-center p-4 bg-black/45 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[2.5rem] p-7 shadow-2xl border border-gray-100 w-full max-w-sm text-center relative pointer-events-auto"
            >
              <h3 className="text-lg font-extrabold text-[#1D1D1F]">Registro Biométrico de Segurança</h3>
              <p className="text-xs text-gray-500 mt-2">
                Cadastre a sua impressão digital para habilitar a liberação rápida de logins por QR Code.
              </p>

              <div className="my-8 flex items-center justify-center">
                <button
                  type="button"
                  onClick={confirmBiometricEnrollment}
                  className="relative w-24 h-24 flex items-center justify-center outline-none border-none bg-transparent group focus:scale-105 transition-transform"
                  title="Clique para escanear digital"
                >
                  <motion.div 
                    animate={{ scale: biometricSuccess ? [1, 1.2, 1] : [1, 1.15, 1] }}
                    transition={{ repeat: Infinity, duration: 1.5 }}
                    className={cn(
                      "absolute inset-0 rounded-full border opacity-20",
                      biometricSuccess ? "border-green-500 bg-green-500/15" : "border-[#007AFF] bg-blue-500/15"
                    )}
                  />
                  <div className={cn(
                    "w-20 h-20 rounded-full flex items-center justify-center transition-all duration-500 shadow-inner",
                    biometricSuccess ? "bg-green-100 text-green-600" : "bg-blue-50 text-[#007AFF] group-hover:bg-blue-100"
                  )}>
                    <Fingerprint className="w-10 h-10 animate-pulse" />
                  </div>
                </button>
              </div>

              <div className="space-y-4">
                <p className="text-xs font-semibold text-gray-500 px-4">
                  {biometricSuccess 
                    ? "✓ Impressão digital identificada e vinculada com sucesso!" 
                    : "Pressione a impressão digital acima para simular a leitura do smartphone."
                  }
                </p>

                {!biometricSuccess && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowBiometricSetup(false)}
                      className="flex-1 py-3 text-xs font-bold bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-2xl transition-colors cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={confirmBiometricEnrollment}
                      className="flex-1 py-3 text-xs font-extrabold bg-[#007AFF] hover:bg-[#0051C3] text-white rounded-2xl shadow-md transition-colors cursor-pointer"
                    >
                      Confirmar Captura
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
