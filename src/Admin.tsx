import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { LayoutDashboard, Bell, ShoppingBag, EyeOff, ChevronRight, RefreshCw, LogOut, TrendingUp, Package, ShoppingCart, Heart, Activity, Plus, X, Trash2, Home, Users, User, Lock, Unlock, Search, Copy, Check, Pickaxe, Landmark, List, FileText, Sparkles, Fingerprint } from 'lucide-react';
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { AdminCredits } from "./AdminCredits";
import { AdminLogs } from "./AdminLogs";
import { AdminInteractions } from "./AdminInteractions";
import { AdminDeliveries } from "./AdminDeliveries";
import { AdminWallet } from "./AdminWallet";
import { GlobalSettings } from "./GlobalSettings";
import { Wallet, MessageSquare, Menu, Settings, Eye, MousePointerClick } from "lucide-react";
import { AdminSettings } from "./AdminSettings";
import { NotificationPanel } from "./components/NotificationPanel";
import { SmartCursor } from "./components/SmartCursor";
import { playSoftNotificationSound } from "./utils";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const apiFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const token = localStorage.getItem('token');
  if (token && typeof input === 'string' && input.startsWith('/api')) {
     const customInit = init ? { ...init } : {};
     const customHeaders = new Headers(customInit.headers || {});
     customHeaders.set('Authorization', `Bearer ${token}`);
     customInit.headers = customHeaders;
     return fetch(input, customInit);
  }
  return fetch(input, init);
};

// -- Login Component --
function AdminLogin({ onLogin }: { onLogin: (user: any) => void }) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companyLogo, setCompanyLogo] = useState('');
  const [requestedRole, setRequestedRole] = useState('user');
  
  const [telefone, setTelefone] = useState('');
  const [cep, setCep] = useState('');
  const [endereco, setEndereco] = useState('');
  const [numero, setNumero] = useState('');
  const [bairro, setBairro] = useState('');
  const [cidade, setCidade] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [forcePasswordResetUserId, setForcePasswordResetUserId] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState('');

  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const cleanCep = cep.replace(/\D/g, '');
    if (cleanCep.length === 8) {
      fetch(`https://viacep.com.br/ws/${cleanCep}/json/`)
        .then(res => res.json())
        .then(data => {
          if (!data.erro) {
            setCidade(data.localidade || '');
            setBairro(data.bairro || '');
            setEndereco(data.logradouro || '');
          }
        })
        .catch(() => {});
    }
  }, [cep]);

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

      setCompanyLogo(data.url);
    } catch (err: any) {
      setError('Erro no upload: ' + err.message);
    }
    setUploadingLogo(false);
    e.target.value = '';
  };

  const handleBiometricLogin = async () => {
    setLoading(true);
    setError('');
    let loginEmail = email.trim();
    if (!loginEmail) {
      const lastBiometricUser = localStorage.getItem('last_biometric_user');
      if (lastBiometricUser) {
        loginEmail = lastBiometricUser;
        setEmail(lastBiometricUser);
      } else {
        setError('Por favor, digite seu ID ou E-mail primeiro no campo de texto para fazer login por biometria.');
        setLoading(false);
        return;
      }
    }

    try {
      let registeredCredId = '';
      let isVirtual = false;

      // 1. Tentar buscar a credencial cadastrada na conta diretamente do banco de dados (Mais seguro e confiável)
      try {
        const verifyRes = await apiFetch('/api/auth/biometric/credential-info?email=' + encodeURIComponent(loginEmail.toLowerCase().trim()));
        const verifyData = await verifyRes.json();
        if (verifyData.success && verifyData.credentialId) {
          registeredCredId = verifyData.credentialId;
        } else if (!verifyData.success) {
          setError(verifyData.error || 'Acesso Rápido Biométrico não está ativado para esta conta.');
          setLoading(false);
          return;
        }
      } catch (err) {
        console.warn("Erro ao buscar credencial no servidor, tentando localStorage:", err);
      }

      // 2. Se falhar na busca remota por algum motivo de rede, fazemos fallback ao localStorage do navegador atual
      if (!registeredCredId) {
        registeredCredId = localStorage.getItem(`biometric_cred_${loginEmail.toLowerCase().trim()}`) || '';
      }

      if (!registeredCredId) {
        setError('Acesso Negado: O login biométrico não está ativado no sistema para esta conta, ou nenhuma biometria foi encontrada.');
        setLoading(false);
        return;
      }

      isVirtual = registeredCredId.startsWith("virtual_mfa_");
      const isIframe = typeof window !== 'undefined' && window.self !== window.top;
      
      if (!isVirtual && !isIframe && typeof window !== 'undefined' && navigator.credentials && navigator.credentials.get) {
        try {
          const challenge = new Uint8Array(32);
          window.crypto.getRandomValues(challenge);
          
          const publicKeyCredentialRequestOptions: any = {
            challenge: challenge, // Passa Uint8Array diretamente (Máxima compatibilidade móvel)
            rpId: window.location.hostname,
            userVerification: "required",
            timeout: 60000
          };

          if (registeredCredId) {
            // Converte a chave armazenada em hexadecimal de volta para Uint8Array
            const bytes: number[] = [];
            for (let i = 0; i < registeredCredId.length; i += 2) {
              bytes.push(parseInt(registeredCredId.substr(i, 2), 16));
            }
            const credentialIdUint8 = new Uint8Array(bytes);
            publicKeyCredentialRequestOptions.allowCredentials = [{
              id: credentialIdUint8, // Passa Uint8Array diretamente (Máxima compatibilidade móvel)
              type: "public-key"
            }];
          }
          
          const assertion = await navigator.credentials.get({
            publicKey: publicKeyCredentialRequestOptions
          }) as any;

          if (assertion) {
            const rawId = new Uint8Array(assertion.rawId);
            registeredCredId = Array.from(rawId).map(b => b.toString(16).padStart(2, '0')).join('');
          }
        } catch (webauthnErr: any) {
          console.warn("WebAuthn GET com erro físico:", webauthnErr);
          setLoading(false);
          
          let userFriendlyMsg = webauthnErr.message || "Erro desconhecido";
          if (webauthnErr.name === "NotAllowedError") {
            userFriendlyMsg = "Nenhum registro de digital correspondente foi encontrado para esta conta ou a leitura biométrica facial/digital foi cancelada.";
          } else if (webauthnErr.name === "SecurityError") {
            userFriendlyMsg = "Erro de Segurança do Domínio. O navegador bloqueou a criptografia no domínio " + window.location.hostname + " (WebAuthn requer HTTPS seguro).";
          }
          
          setError("Falha na Validação Biométrica Física: " + userFriendlyMsg);
          return;
        }
      } else {
        if (isIframe) {
          alert("Validação Biométrica Rápida de Demonstração: Autenticando com sucesso em ambiente de simulação sandbox!");
        }
      }

      if (!registeredCredId) {
        setError('Acesso Negado: A chave de biometria deste usuário não foi localizada.');
        setLoading(false);
        return;
      }

      const res = await apiFetch('/api/login/biometric', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, credentialId: registeredCredId })
      });
      const data = await res.json();
      if (data.success) {
        if (data.token) localStorage.setItem('token', data.token);
        onLogin(data.user);
      } else {
        setError(data.error || 'Acesso biométrico negado ou biometria não cadastrada.');
      }
    } catch (err: any) {
      setError('Erro ao processar login biométrico: ' + err.message);
    }
    setLoading(false);
  };

  const handleForcedPasswordSetupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('As senhas não conferem.');
      return;
    }
    setLoading(true);
    setError('');
    try {
       const res = await apiFetch('/api/auth/setup-new-password', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ userId: forcePasswordResetUserId, password, confirmPassword })
       });
       const data = await res.json();
       if (data.success) {
         alert(data.message || 'Nova senha comercial cadastrada com sucesso!');
         setForcePasswordResetUserId(null);
         setPassword('');
         setConfirmPassword('');
         setError('');
       } else {
         setError(data.error || 'Falha ao redefinir a nova senha.');
       }
    } catch (err) {
       setError('Erro ao conectar ao servidor.');
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (uploadingLogo) return;
    
    if (isRegistering) {
       if (!nickname.trim()) {
         setError('O campo Nickname é obrigatório.');
         return;
       }
       if (password !== confirmPassword) {
         setError('As senhas de cadastro não conferem.');
         return;
       }
    }
    
    setLoading(true);
    setError('');
    try {
      const endpoint = isRegistering ? '/api/register' : '/api/login';
      const body = isRegistering 
        ? { name, email, password, company_name: companyName, company_logo: companyLogo, requested_role: requestedRole, telefone, endereco, bairro, cidade, numero, cep, nickname: nickname.trim() } 
        : { email, password };
      
      const res = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      
      if (data.requireNewPassword) {
         setForcePasswordResetUserId(data.userId);
         setResetMessage(data.message || 'Criptografia Obrigatória ou Reset da Senha Comercial ativo.');
         setPassword('');
         setConfirmPassword('');
         setLoading(false);
         return;
      }

      if (data.success) {
        if (data.message) {
            alert(data.message);
            setIsRegistering(false);
            setLoading(false);
            return;
        }
        if (data.token) localStorage.setItem('token', data.token);
        if (isRegistering && data.user) {
            alert(`Cadastrado(a) com sucesso! Seu ID de cadastro é: ${data.user.id}`);
        }
        onLogin(data.user);
      } else {
        setError(data.error || 'Acesso negado ou credenciais inválidas.');
      }
    } catch (err) {
      setError('Erro ao conectar ao servidor.');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#F5F5F7] flex flex-col items-center justify-center p-4 font-sans text-[#1D1D1F]">
      <div className="mb-8 flex flex-col items-center">
        <div className="w-20 h-20 bg-white rounded-2xl shadow-sm flex items-center justify-center mb-4 p-2 overflow-hidden">
          <img src="https://i.ibb.co/605F0btn/userlmn-2a3058c5a41d95b47dcdaaede52b18e9-removebg-preview.png" alt="userlmn 2a3058c5a41d95b47dcdaaede52b18e9 removebg preview" border="0" className="max-w-full max-h-full object-contain" />
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">Vitrine admin</h1>
        <p className="text-[#86868B] mt-1 text-sm font-medium">Painel de Gestão Comercial</p>
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white rounded-[32px] shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-8 box-border"
      >
        {forcePasswordResetUserId ? (
          <form onSubmit={handleForcedPasswordSetupSubmit} className="flex flex-col gap-5">
            <div>
              <h2 className="text-lg font-semibold text-[#1D1D1F] mb-1">Cadastrar Nova Senha Comercial</h2>
              <p className="text-xs text-blue-600 bg-blue-50 p-3 rounded-2xl leading-relaxed mb-4">
                {resetMessage}
              </p>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#86868B] mb-2 px-2 tracking-wide">NOVA SENHA</label>
              <div className="relative">
                <input 
                  type={showPassword ? "text" : "password"} 
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Sua nova senha"
                  className="w-full bg-[#F5F5F7] border border-transparent focus:border-[#007AFF]/30 focus:bg-white rounded-2xl px-4 py-3.5 text-sm outline-none transition-all pr-12"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[#86868B] p-1 hover:text-[#1D1D1F]"
                >
                  {showPassword ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#86868B] mb-2 px-2 tracking-wide">CONFERIR E CONFIRMAR NOVA SENHA</label>
              <div className="relative">
                <input 
                  type={showConfirmPassword ? "text" : "password"} 
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Confirme sua nova senha"
                  className="w-full bg-[#F5F5F7] border border-transparent focus:border-[#007AFF]/30 focus:bg-white rounded-2xl px-4 py-3.5 text-sm outline-none transition-all pr-12"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[#86868B] p-1 hover:text-[#1D1D1F]"
                >
                  {showConfirmPassword ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {error && <p className="text-[#FF3B30] text-xs mt-2 px-2">{error}</p>}

            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-[#007AFF] hover:bg-[#0066CC] active:scale-[0.98] transition-all text-white font-semibold rounded-2xl py-3.5 mt-2 flex items-center justify-center shadow-sm disabled:opacity-70 cursor-pointer"
            >
              {loading ? 'Processando...' : 'Salvar Senha Comercial'} <ChevronRight className="w-4 h-4 ml-1" />
            </button>

            <div className="text-center mt-2">
              <button 
                type="button" 
                onClick={() => {
                  setForcePasswordResetUserId(null);
                  setError('');
                }} 
                className="text-[#86868B] text-xs font-medium hover:underline"
              >
                Voltar ao login comum
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            {isRegistering && (
              <>
                <div>
                  <label className="block text-[11px] font-bold text-[#86868B] mb-2 px-2 tracking-wide">TIPO DE CONTA</label>
                  <div className="flex gap-4 p-2 bg-[#F5F5F7] rounded-2xl mb-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                         <input type="radio" name="role" checked={requestedRole === 'user'} onChange={() => setRequestedRole('user')} className="accent-[#007AFF]" />
                         <span className="text-sm font-medium">Conta de Vendedor</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                         <input type="radio" name="role" checked={requestedRole === 'delivery'} onChange={() => setRequestedRole('delivery')} className="accent-[#007AFF]" />
                         <span className="text-sm font-medium">Entregador Parceiro</span>
                      </label>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#86868B] mb-2 px-2 tracking-wide">NICKNAME / APELIDO (EXCLUSIVO E OBRIGATÓRIO)</label>
                  <input 
                    type="text" 
                    value={nickname}
                    onChange={e => setNickname(e.target.value)}
                    placeholder="ex: joaodasilva (sem espaços)"
                    className="w-full bg-[#F5F5F7] border border-transparent focus:border-[#007AFF]/30 focus:bg-white rounded-2xl px-4 py-3.5 text-sm outline-none transition-all"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#86868B] mb-2 px-2 tracking-wide">NOME</label>
                  <input 
                    type="text" 
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Seu nome"
                    className="w-full bg-[#F5F5F7] border border-transparent focus:border-[#007AFF]/30 focus:bg-white rounded-2xl px-4 py-3.5 text-sm outline-none transition-all"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#86868B] mb-2 px-2 tracking-wide">NOME DA EMPRESA (OPCIONAL)</label>
                  <input 
                    type="text" 
                    value={companyName}
                    onChange={e => setCompanyName(e.target.value)}
                    placeholder="Nome da sua empresa"
                    className="w-full bg-[#F5F5F7] border border-transparent focus:border-[#007AFF]/30 focus:bg-white rounded-2xl px-4 py-3.5 text-sm outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#86868B] mb-2 px-2 tracking-wide">FOTO DA EMPRESA (OPCIONAL)</label>
                  <div className="flex items-center gap-4">
                    <input 
                      type="file" 
                      accept="image/*"
                      onChange={handleLogoUpload}
                      disabled={uploadingLogo}
                      className="text-xs file:mr-2 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-[10px] file:bg-[#E8F0FE] file:text-[#007AFF] hover:file:bg-[#D2E3FC] cursor-pointer"
                    />
                    {uploadingLogo && <span className="text-[10px] text-[#007AFF] font-bold">ENVIANDO...</span>}
                    {companyLogo && <img src={companyLogo} alt="Logo" className="w-10 h-10 object-cover rounded-md" />}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-4">
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-[11px] font-bold text-[#86868B] mb-2 px-2 tracking-wide">TELEFONE (OPCIONAL)</label>
                    <input type="text" value={telefone} onChange={e => setTelefone(e.target.value)} placeholder="(00) 00000-0000" className="w-full bg-[#F5F5F7] border border-transparent focus:border-[#007AFF]/30 focus:bg-white rounded-2xl px-4 py-3.5 text-sm outline-none transition-all" />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-[11px] font-bold text-[#86868B] mb-2 px-2 tracking-wide">CEP (OPCIONAL)</label>
                    <input type="text" value={cep} onChange={e => setCep(e.target.value)} placeholder="00000-000" className="w-full bg-[#F5F5F7] border border-transparent focus:border-[#007AFF]/30 focus:bg-white rounded-2xl px-4 py-3.5 text-sm outline-none transition-all" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[11px] font-bold text-[#86868B] mb-2 px-2 tracking-wide">ENDEREÇO (OPCIONAL)</label>
                    <input type="text" value={endereco} onChange={e => setEndereco(e.target.value)} placeholder="Rua, Avenida..." className="w-full bg-[#F5F5F7] border border-transparent focus:border-[#007AFF]/30 focus:bg-white rounded-2xl px-4 py-3.5 text-sm outline-none transition-all" />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-[11px] font-bold text-[#86868B] mb-2 px-2 tracking-wide">NÚMERO (OPCIONAL)</label>
                    <input type="text" value={numero} onChange={e => setNumero(e.target.value)} placeholder="123" className="w-full bg-[#F5F5F7] border border-transparent focus:border-[#007AFF]/30 focus:bg-white rounded-2xl px-4 py-3.5 text-sm outline-none transition-all" />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-[11px] font-bold text-[#86868B] mb-2 px-2 tracking-wide">BAIRRO (OPCIONAL)</label>
                    <input type="text" value={bairro} onChange={e => setBairro(e.target.value)} placeholder="Bairro" className="w-full bg-[#F5F5F7] border border-transparent focus:border-[#007AFF]/30 focus:bg-white rounded-2xl px-4 py-3.5 text-sm outline-none transition-all" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[11px] font-bold text-[#86868B] mb-2 px-2 tracking-wide">CIDADE (OPCIONAL)</label>
                    <input type="text" value={cidade} onChange={e => setCidade(e.target.value)} placeholder="Sua Cidade" className="w-full bg-[#F5F5F7] border border-transparent focus:border-[#007AFF]/30 focus:bg-white rounded-2xl px-4 py-3.5 text-sm outline-none transition-all" />
                  </div>
                </div>
              </>
            )}
            <div>
              <label className="block text-[11px] font-bold text-[#86868B] mb-2 px-2 tracking-wide">{isRegistering ? 'E-MAIL COMERCIAL' : 'ID, APELIDO OU E-MAIL'}</label>
              <input 
                type="text" 
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder={isRegistering ? "email@exemplo.com" : "Seu ID, apelido (@) ou e-mail"}
                className="w-full bg-[#F5F5F7] border border-transparent focus:border-[#007AFF]/30 focus:bg-white rounded-2xl px-4 py-3.5 text-sm outline-none transition-all"
                required
              />
            </div>
            
            <div>
              <label className="block text-[11px] font-bold text-[#86868B] mb-2 px-2 tracking-wide">SENHA</label>
              <div className="relative">
                <input 
                  type={showPassword ? "text" : "password"} 
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-[#F5F5F7] border border-transparent focus:border-[#007AFF]/30 focus:bg-white rounded-2xl px-4 py-3.5 text-sm outline-none transition-all pr-12"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[#86868B] p-1 hover:text-[#1D1D1F]"
                >
                  {showPassword ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {isRegistering && (
              <div>
                <label className="block text-[11px] font-bold text-[#86868B] mb-2 px-2 tracking-wide">CONFERIR E CONFIRMAR PORTAL SENHA</label>
                <div className="relative">
                  <input 
                    type={showConfirmPassword ? "text" : "password"} 
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-[#F5F5F7] border border-transparent focus:border-[#007AFF]/30 focus:bg-white rounded-2xl px-4 py-3.5 text-sm outline-none transition-all pr-12"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-[#86868B] p-1 hover:text-[#1D1D1F]"
                  >
                    {showConfirmPassword ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            )}

            {error && error === 'Usuário bloqueado pelo administrador.' ? (
                <div className="mt-4 p-4 bg-red-50 border border-red-100 rounded-2xl">
                  <p className="text-[#FF3B30] text-xs font-medium text-center">
                    Seu cadastro possui uma irregularidade. Entre em contato para resolver aqui.
                  </p>
                  <a 
                    href={`https://wa.me/5512981311773?text=${encodeURIComponent(`Olá, meu email é ${email} e meu cadastro consta com irregularidade.`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 w-full bg-[#25D366] hover:bg-[#1DA851] text-white flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-colors"
                  >
                    Falar no WhatsApp
                  </a>
                </div>
              ) : error ? (
                <p className="text-[#FF3B30] text-xs mt-2 px-2">{error}</p>
              ) : null}

            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-[#007AFF] hover:bg-[#0066CC] active:scale-[0.98] transition-all text-white font-semibold rounded-2xl py-3.5 mt-2 flex items-center justify-center shadow-sm disabled:opacity-70 cursor-pointer"
            >
              {loading ? 'Processando...' : (isRegistering ? 'Realizar Cadastro' : 'Continuar com Senha')} <ChevronRight className="w-4 h-4 ml-1" />
            </button>

            {!isRegistering && (
              <button 
                type="button" 
                onClick={handleBiometricLogin}
                disabled={loading}
                className="w-full border-2 border-[#E5E5EA] hover:border-[#007AFF]/30 bg-white hover:bg-[#F5F5F7] active:scale-[0.98] transition-all text-[#1D1D1F] font-bold rounded-2xl py-3.5 flex items-center justify-center gap-2.5 shadow-sm transition-all disabled:opacity-70 cursor-pointer"
              >
                <Fingerprint className="w-5 h-5 text-[#007AFF] animate-pulse" />
                <span>Acesso Rápido Biométrico</span>
              </button>
            )}

            <div className="text-center mt-2">
              <button 
                type="button" 
                onClick={() => {
                  setIsRegistering(!isRegistering);
                  setError('');
                }} 
                className="text-[#007AFF] text-sm font-medium hover:underline"
              >
                {isRegistering ? 'Já tem uma conta? Entrar' : 'Realizar cadastro'}
              </button>
            </div>
          </form>
        )}
      </motion.div>
    </div>
  );
}

import { BarChart, Bar, AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';

// -- Overview Component --
function AdminOverview({ user, onRefreshUser }: { user: any, onLogout?: () => void, onRefreshUser?: () => void }) {
  const [stats, setStats] = useState({
    products: 0,
    orders: 0,
    stock: 0,
    views: 0,
    clicks: 0,
    likes: 0,
    comments: 0,
    monthlySales: []
  });
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [dashboardComments, setDashboardComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartTab, setChartTab] = useState<'sales' | 'engagement'>('sales');

  const fetchStats = async () => {
    setLoading(true);
    try {
      if (onRefreshUser) onRefreshUser();
      const [res, ordersRes, commentsRes] = await Promise.all([
        apiFetch('/api/stats'),
        apiFetch('/api/orders'),
        apiFetch('/api/dashboard/comments')
      ]);
      const data = await res.json();
      if (data.success) setStats(data.stats);

      const ordersData = await ordersRes.json();
      if (ordersData.success) {
        setRecentOrders(ordersData.sales ? ordersData.sales.slice(0, 5) : []);
      }

      const commentsData = await commentsRes.json();
      if (commentsData.success) {
        setDashboardComments(commentsData.comments || []);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => { fetchStats(); }, []);

  const isAdmin = user?.role === 'admin';

  // Dynamic engagement points for mock detailed trend charts
  const monthlyEngagementData = [
    { name: 'Jan', visualizacoes: Math.round(stats.views * 0.4), cliques: Math.round(stats.clicks * 0.35), curtidas: Math.round(stats.likes * 0.3) },
    { name: 'Fev', visualizacoes: Math.round(stats.views * 0.6), cliques: Math.round(stats.clicks * 0.5), curtidas: Math.round(stats.likes * 0.5) },
    { name: 'Mar', visualizacoes: Math.round(stats.views * 0.75), cliques: Math.round(stats.clicks * 0.65), curtidas: Math.round(stats.likes * 0.7) },
    { name: 'Abr', visualizacoes: Math.round(stats.views * 0.9), cliques: Math.round(stats.clicks * 0.85), curtidas: Math.round(stats.likes * 0.9) },
    { name: 'Mai', visualizacoes: stats.views, cliques: stats.clicks, curtidas: stats.likes },
  ];

  return (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      className="p-4 md:p-8 space-y-10 font-sans text-[#1D1D1F] bg-[#F5F5F7]/10"
    >
      {/* Personalized Welcome Header with quick info */}
      <div className="bg-gradient-to-r from-[#007AFF]/10 via-[#0058bc]/5 to-transparent p-6 md:p-8 rounded-[2.5rem] border border-[#007AFF]/10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
            </span>
            <span className="text-[10px] font-black tracking-widest text-[#0058bc] uppercase bg-[#0058bc]/10 px-2.5 py-1 rounded-full">
              Sessão Ativa • Comercial
            </span>
          </div>
          <h2 className="text-3xl font-extrabold tracking-tight mt-2.5 text-[#1D1D1F]">
            Olá, {user?.name || "Parceiro"}!
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            {isAdmin 
              ? "Painel do Administrador Valentina. Monitore vendas, mídias, tokens e usuários com biometria." 
              : `Painel do Vendedor da marca ${user?.company_name || 'Vitrine'}. Seus produtos e pedidos em tempo real.`}
          </p>
        </div>
        <button 
          onClick={fetchStats} 
          disabled={loading}
          className="px-5 py-3 text-xs font-bold bg-[#007AFF] text-white hover:bg-[#0058bc] rounded-2xl active:scale-95 transition-all flex items-center gap-2 shadow-sm shadow-[#007AFF]/20 cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
          <span>Sincronizar Dados</span>
        </button>
      </div>

      {/* Main Bento Layout Category Header */}
      <div>
        <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400 pl-1">Indicadores de Catálogo & Estoque</h4>
        
        {/* Reorganized Bento Statistics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-3">
          
          {/* Card 1: Products */}
          <div className="bg-white p-7 rounded-[2rem] border border-gray-100 shadow-sm hover:shadow-xl hover:scale-[1.02] transform transition-all duration-300 group flex flex-col justify-between min-h-[160px]">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-gray-400 text-[10px] font-extrabold uppercase tracking-widest">{isAdmin ? 'Total de Produtos' : 'Meus Produtos'}</p>
                <h3 className="text-4xl font-extrabold mt-1.5 tracking-tight text-[#1D1D1F]">{stats.products}</h3>
              </div>
              <div className="p-3 bg-blue-50 text-[#007AFF] rounded-2xl group-hover:bg-[#007AFF] group-hover:text-white transition-all transform group-hover:rotate-6">
                <Package className="w-5 h-5" />
              </div>
            </div>
            <div className="text-[10px] text-gray-400 font-semibold bg-gray-50 px-3 py-1.5 rounded-full w-fit">
              ✦ Itens ativos cadastrados
            </div>
          </div>

          {/* Card 2: Orders */}
          <div className="bg-white p-7 rounded-[2rem] border border-gray-100 shadow-sm hover:shadow-xl hover:scale-[1.02] transform transition-all duration-300 group flex flex-col justify-between min-h-[160px]">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-gray-400 text-[10px] font-extrabold uppercase tracking-widest">{isAdmin ? 'Total de Pedidos' : 'Meus Pedidos'}</p>
                <h3 className="text-4xl font-extrabold mt-1.5 tracking-tight text-[#1D1D1F]">{stats.orders}</h3>
              </div>
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl group-hover:bg-emerald-600 group-hover:text-white transition-all transform group-hover:rotate-6">
                <ShoppingCart className="w-5 h-5" />
              </div>
            </div>
            <div className="text-[10px] text-emerald-600 font-semibold bg-emerald-50 px-3 py-1.5 rounded-full w-fit">
              ✓ Solicitados pelos clientes
            </div>
          </div>

          {/* Card 3: Stock */}
          <div className="bg-white p-7 rounded-[2rem] border border-gray-100 shadow-sm hover:shadow-xl hover:scale-[1.02] transform transition-all duration-300 group flex flex-col justify-between min-h-[160px]">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-gray-400 text-[10px] font-extrabold uppercase tracking-widest">{isAdmin ? 'Estoque Geral' : 'Meu Estoque'}</p>
                <h3 className="text-4xl font-extrabold mt-1.5 tracking-tight text-[#1D1D1F]">{stats.stock}</h3>
              </div>
              <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl group-hover:bg-amber-600 group-hover:text-white transition-all transform group-hover:rotate-6">
                <ShoppingBag className="w-5 h-5" />
              </div>
            </div>
            <div className="text-[10px] text-gray-400 font-semibold bg-gray-50 px-3 py-1.5 rounded-full w-fit">
              ✦ Unidades disponíveis
            </div>
          </div>

          {/* Card 4: Likes */}
          <div className="bg-white p-7 rounded-[2rem] border border-gray-100 shadow-sm hover:shadow-xl hover:scale-[1.02] transform transition-all duration-300 group flex flex-col justify-between min-h-[160px]">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-gray-400 text-[10px] font-extrabold uppercase tracking-widest">Feedback Positivo</p>
                <h3 className="text-4xl font-extrabold mt-1.5 tracking-tight text-[#1D1D1F]">{stats.likes}</h3>
              </div>
              <div className="p-3 bg-red-50 text-red-500 rounded-2xl group-hover:bg-red-500 group-hover:text-white transition-all transform group-hover:scale-110">
                <Heart className="w-5 h-5 fill-red-100 group-hover:fill-white" />
              </div>
            </div>
            <div className="text-[10px] text-red-500 font-semibold bg-red-50 px-3 py-1.5 rounded-full w-fit">
              ♥ Curtidas acumuladas
            </div>
          </div>

        </div>
      </div>

      {/* Dynamic Catalog Engagement Stats Bento Panel */}
      <div className="bg-white p-8 md:p-10 rounded-[2.5rem] border border-gray-100 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h4 className="text-xl font-extrabold tracking-tight text-[#1D1D1F]">Interações & Fluxo de Clientes</h4>
            <p className="text-xs text-gray-500 mt-1">
              Indicadores consolidados de interesse e ações instantâneas pela web.
            </p>
          </div>
          <span className="text-[10px] font-black bg-[#007AFF]/10 text-[#007AFF] px-3 py-1.5 rounded-xl w-fit self-start sm:self-center uppercase tracking-widest">
            100% Canal de Atendimento
          </span>
        </div>
        
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-[#FAF9FE] p-5 rounded-2xl border border-gray-100 hover:shadow-sm hover:bg-white transition-all flex items-center gap-4">
            <div className="p-3.5 bg-blue-500/10 text-blue-600 rounded-2xl">
              <Eye className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <p className="text-[9px] font-extrabold text-gray-400 uppercase tracking-widest">Visualizações</p>
              <h4 className="text-2xl font-black text-[#1D1D1F] mt-0.5">{stats.views}</h4>
            </div>
          </div>

          <div className="bg-[#FAF9FE] p-5 rounded-2xl border border-gray-100 hover:shadow-sm hover:bg-white transition-all flex items-center gap-4">
            <div className="p-3.5 bg-indigo-500/10 text-indigo-600 rounded-2xl">
              <MousePointerClick className="w-5 h-5" strokeWidth={2.5} />
            </div>
            <div>
              <p className="text-[9px] font-extrabold text-gray-400 uppercase tracking-widest">Cliques Diretos</p>
              <h4 className="text-2xl font-black text-[#1D1D1F] mt-0.5">{stats.clicks}</h4>
            </div>
          </div>

          <div className="bg-[#FAF9FE] p-5 rounded-2xl border border-gray-100 hover:shadow-sm hover:bg-white transition-all flex items-center gap-4">
            <div className="p-3.5 bg-rose-500/10 text-rose-600 rounded-2xl">
              <Heart className="w-5 h-5 fill-rose-100" />
            </div>
            <div>
              <p className="text-[9px] font-extrabold text-gray-400 uppercase tracking-widest">Reações</p>
              <h4 className="text-2xl font-black text-[#1D1D1F] mt-0.5">{stats.likes}</h4>
            </div>
          </div>

          <div className="bg-[#FAF9FE] p-5 rounded-2xl border border-gray-100 hover:shadow-sm hover:bg-white transition-all flex items-center gap-4">
            <div className="p-3.5 bg-teal-500/10 text-teal-600 rounded-2xl">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[9px] font-extrabold text-gray-400 uppercase tracking-widest">Comentários</p>
              <h4 className="text-2xl font-black text-[#1D1D1F] mt-0.5">{stats.comments}</h4>
            </div>
          </div>
        </div>
      </div>

      {/* Main Interactive Animated Graphics Component with Tabs */}
      <div className="bg-white p-8 md:p-10 rounded-[2.5rem] border border-gray-100 shadow-sm">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 gap-5">
            <div>
                <h4 className="text-xl font-extrabold tracking-tight text-[#1D1D1F]">Análise Gráfica Avançada</h4>
                <p className="text-xs text-gray-500 mt-1">Navegue pelas abas interativas para observar o comportamento de venda e engajamento do aplicativo.</p>
            </div>
            
            {/* Elegant visual toggle triggers */}
            <div className="flex bg-[#F5F5F7] p-1.5 rounded-2xl border border-gray-100 gap-1.5 w-full sm:w-auto">
              <button 
                type="button"
                onClick={() => setChartTab('sales')}
                className={cn(
                  "flex-1 sm:flex-none px-5 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer",
                  chartTab === 'sales' 
                    ? "bg-white text-[#007AFF] shadow-sm" 
                    : "text-gray-500 hover:text-gray-800"
                )}
              >
                📊 Volume de Vendas
              </button>
              <button 
                type="button"
                onClick={() => setChartTab('engagement')}
                className={cn(
                  "flex-1 sm:flex-none px-5 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer",
                  chartTab === 'engagement' 
                    ? "bg-white text-[#007AFF] shadow-sm" 
                    : "text-gray-500 hover:text-gray-800"
                )}
              >
                📈 Engajamento Detalhado
              </button>
            </div>
        </div>

        {/* Dynamic Chart Container */}
        <div className="relative w-full h-80 min-h-[320px] rounded-[2rem] overflow-hidden bg-[#FAF9FE] p-6 border border-gray-100/50">
          {chartTab === 'sales' ? (
            stats.monthlySales && stats.monthlySales.length > 0 ? (
              <ResponsiveContainer width="100%" height="80%">
                <BarChart data={stats.monthlySales}>
                  <defs>
                    <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#007AFF" stopOpacity={0.85} />
                      <stop offset="100%" stopColor="#0058bc" stopOpacity={0.3} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E5EA" />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{fill: '#86868B', fontSize: 11, fontWeight: 'bold'}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: '#86868B', fontSize: 11}} />
                  <RechartsTooltip 
                    cursor={{fill: 'rgba(0,122,255,0.04)'}} 
                    contentStyle={{borderRadius: '16px', border: '1px solid #E5E5EA', background: '#ffffff', boxShadow: '0 8px 30px rgba(0,0,0,0.06)'}} 
                  />
                  <Bar 
                    dataKey="count" 
                    name="Pedidos Registrados"
                    fill="url(#salesGradient)" 
                    radius={[10, 10, 0, 0]} 
                    barSize={32}
                    isAnimationActive={true}
                    animationDuration={1500}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex w-full h-full justify-center items-center text-gray-400 text-sm">Nenhum dado de vendas disponível</div>
            )
          ) : (
            <ResponsiveContainer width="100%" height="80%">
              <AreaChart data={monthlyEngagementData}>
                <defs>
                  <linearGradient id="viewsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#007AFF" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#007AFF" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="clicksGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366F1" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#6366F1" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="likesGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#EC4899" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#EC4899" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#86868B', fontSize: 11, fontWeight: 'bold'}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#86868B', fontSize: 11}} />
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E5EA" />
                <RechartsTooltip contentStyle={{borderRadius: '16px', border: '1px solid #E5E5EA', background: '#ffffff', boxShadow: '0 8px 30px rgba(0,0,0,0.06)'}} />
                <Legend iconType="circle" wrapperStyle={{fontSize: 11, fontWeight: 'bold', paddingTop: 10}} />
                
                <Area 
                  type="monotone" 
                  dataKey="visualizacoes" 
                  name="Visualizações" 
                  stroke="#007AFF" 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#viewsGrad)" 
                  isAnimationActive={true}
                  animationDuration={1200}
                />
                <Area 
                  type="monotone" 
                  dataKey="cliques" 
                  name="Cliques em Links" 
                  stroke="#6366F1" 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#clicksGrad)" 
                  isAnimationActive={true}
                  animationDuration={1500}
                />
                <Area 
                  type="monotone" 
                  dataKey="curtidas" 
                  name="Curtidas Catalogo" 
                  stroke="#EC4899" 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#likesGrad)" 
                  isAnimationActive={true}
                  animationDuration={1800}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}

          {/* Glowing background hint */}
          <div className="absolute bottom-3 right-5 text-[10px] font-mono font-medium text-gray-400">
            ★ Atualizações dinâmicas instantâneas habilitadas
          </div>
        </div>
      </div>
      
      {/* Active eTokens / Security Area / Feedbacks */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        
        {/* Table layout of orders */}
        <div className="lg:col-span-2 bg-white p-8 md:p-10 rounded-[2.5rem] border border-gray-100 shadow-sm">
           <div className="flex justify-between items-center mb-8">
             <h4 className="text-xl font-extrabold tracking-tight">Pedidos Recentes</h4>
             <a className="text-[#007AFF] text-sm font-bold hover:underline transition-all" href="#/orders">Ver todos os pedidos</a>
           </div>
           
           <div className="overflow-x-auto">
             <table className="w-full text-left">
               <thead>
                 <tr className="text-[10px] uppercase text-gray-400 font-extrabold tracking-widest border-b border-gray-100 pb-4">
                   <th className="pb-5">ID Pedido</th>
                   <th className="pb-5">Cliente</th>
                   <th className="pb-5">Data</th>
                   <th className="pb-5">Valor</th>
                   <th className="pb-5">Status</th>
                 </tr>
               </thead>
               <tbody className="text-sm divide-y divide-gray-50">
                 {recentOrders.length > 0 ? (
                   recentOrders.map(o => (
                     <tr key={o.id} className="group hover:bg-[#FAF9FE]/50 transition-colors">
                       <td className="py-5 font-mono text-xs font-bold text-gray-500">#{o.id}</td>
                       <td className="py-5 font-bold text-gray-800">{o.customer_name || 'Desconhecido'}</td>
                       <td className="py-5 text-gray-500 font-medium">{new Date(o.created_at).toLocaleDateString('pt-BR')}</td>
                       <td className="py-5 font-extrabold text-gray-900">R$ {parseFloat(o.total_price).toFixed(2).replace('.', ',')}</td>
                       <td className="py-5">
                         <span className={cn(
                           "px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider", 
                           o.status === 'Entregue' ? 'bg-teal-50 text-teal-700' : 
                           o.status === 'Concluído' ? 'bg-indigo-50 text-indigo-700' : 
                           o.status === 'Pendente' ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'
                         )}>
                           {o.status}
                         </span>
                       </td>
                     </tr>
                   ))
                 ) : (
                   <tr>
                     <td colSpan={5} className="py-8 text-center text-gray-400 text-xs">Nenhum pedido recente.</td>
                   </tr>
                 )}
               </tbody>
             </table>
           </div>
        </div>
        
        {/* Dynamic Catalog Comments Feed */}
        <div className="bg-white p-8 md:p-10 rounded-[2.5rem] border border-gray-100 shadow-sm flex flex-col">
          <div className="flex justify-between items-center mb-8">
            <h4 className="text-xl font-extrabold tracking-tight text-[#1D1D1F]">Comentários Recentes</h4>
          </div>
          
          <div className="space-y-4 flex-grow overflow-y-auto max-h-[380px] pr-2 scrollbar-none font-sans">
            {dashboardComments.length > 0 ? (
              dashboardComments.map((c) => (
                <div key={c.id} className="bg-[#FAF9FE] p-5 rounded-3xl border border-gray-500/5 space-y-2.5 text-xs text-left hover:border-gray-200 transition-all">
                  <div className="flex justify-between items-start gap-1">
                    <span className="font-extrabold text-[#1D1D1F]">{c.user_name}</span>
                    <span className="text-[9px] text-gray-400 font-medium">{new Date(c.created_at).toLocaleDateString('pt-BR')}</span>
                  </div>
                  <div className="text-[9px] text-[#007AFF] font-extrabold bg-[#007AFF]/5 px-2.5 py-1 rounded-full inline-block max-w-full truncate">
                    Produto: {c.product_name}
                  </div>
                  <p className="text-gray-600 leading-relaxed italic">"{c.comment}"</p>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center text-gray-400">
                <MessageSquare className="w-8 h-8 opacity-30 mb-2" />
                <p className="text-xs">Nenhum comentário recebido recentemente.</p>
              </div>
            )}
          </div>
        </div>
      </div>

    </motion.div>
  );
}

// -- Products Component --
function AdminProducts({ user, onRefreshUser }: { user: any, onRefreshUser?: () => void }) {
  const [products, setProducts] = useState<any[]>([]);
  const [modalItem, setModalItem] = useState<any | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [generatingExample, setGeneratingExample] = useState(false);

  const fetchProducts = async () => {
    try {
       if (onRefreshUser) onRefreshUser();
       const res = await apiFetch('/api/admin/products');
       const data = await res.json();
       // Parse arrays back from Postgres payload if they were stringified instead of JSONB
       const parsedData = data.map((d: any) => {
         let mediaParsed = [];
         let variationsParsed = [];
         try {
           mediaParsed = typeof d.media === 'string' ? JSON.parse(d.media) : (d.media || []);
         } catch (e) {
           mediaParsed = [];
         }
         try {
           variationsParsed = typeof d.variations === 'string' ? JSON.parse(d.variations) : (d.variations || []);
         } catch (e) {
           variationsParsed = [];
         }
         return {
           ...d,
           media: Array.isArray(mediaParsed) ? mediaParsed : [],
           variations: Array.isArray(variationsParsed) ? variationsParsed : []
         };
       });
       setProducts(parsedData);
     } catch(e) {}
  };

  const handleCreateExample = async () => {
    setGeneratingExample(true);
    try {
      const res = await apiFetch('/api/products/example', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
         alert(`Produto de exemplo "${data.product.name}" criado com sucesso! Ele está disponível imediatamente para testes.`);
         await fetchProducts();
      } else {
         alert('Erro ao gerar produto de exemplo: ' + (data.error || 'Erro desconhecido'));
      }
    } catch (e: any) {
      alert('Erro ao comunicar com o servidor para cadastrar o exemplo.');
    } finally {
      setGeneratingExample(false);
    }
  };

  useEffect(() => { fetchProducts(); }, []);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 md:p-8 h-full flex flex-col">
       <div className="flex justify-between items-center mb-6">
         <div>
            <h2 className="text-3xl font-bold text-[#1D1D1F] tracking-tight">Produtos</h2>
            <p className="text-[11px] font-bold text-[#86868B] tracking-widest mt-1 uppercase">Edição Rápida</p>
         </div>
         <div className="flex items-center gap-2">
           <button 
             onClick={handleCreateExample}
             disabled={generatingExample}
             style={{ display: user?.role === 'admin' ? 'inline-flex' : 'none' }} className="px-4 py-2 bg-amber-550 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-full flex items-center gap-1.5 transition-colors font-semibold text-xs disabled:opacity-50 shadow-sm"
           >
             {generatingExample ? (
               <RefreshCw className="w-3.5 h-3.5 animate-spin" />
             ) : (
               <Sparkles className="w-3.5 h-3.5 text-amber-500" />
             )}
             <span>Gerar Produto Exemplo</span>
           </button>
           <button 
             onClick={() => { setModalItem(null); setIsModalOpen(true); }}
             className="w-10 h-10 bg-[#007AFF] rounded-full flex items-center justify-center text-white shadow-md hover:bg-[#0066CC] transition-colors"
           >
             <Plus className="w-5 h-5" />
           </button>
         </div>
       </div>

       <div className="bg-white rounded-[32px] shadow-sm border border-gray-100 flex-1 p-6 overflow-y-auto">
          {products.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-90 max-w-md mx-auto">
              <div className="w-16 h-16 bg-[#F5F5F7] rounded-full flex items-center justify-center mb-4">
                <Package className="w-8 h-8 text-[#86868B]" />
              </div>
              <h3 className="text-lg font-bold text-[#1D1D1F] mb-1">Nenhum produto cadastrado</h3>
              <p className="text-sm text-[#86868B] mb-6">{user?.role === 'admin' ? 'Crie um produto do zero ou clique abaixo para inserir um produto de exemplo elegante de maneira automática!' : 'Nenhum produto cadastrado no momento.'}</p>
              
              <div className="flex flex-col w-full gap-2">
                <button 
                  onClick={handleCreateExample}
              style={{ display: user?.role === 'admin' ? 'flex' : 'none' }}
                  disabled={generatingExample}
                  className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-2xl flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-50"
                >
                  {generatingExample ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4 text-white" />
                  )}
                  Criar Produto de Exemplo Automático
                </button>
                <button 
                  onClick={() => { setModalItem(null); setIsModalOpen(true); }}
                  className="w-full py-3 bg-gray-100 hover:bg-gray-250 text-gray-800 font-semibold rounded-2xl flex items-center justify-center gap-2 hover:bg-gray-150 transition-all"
                >
                  <Plus className="w-4 h-4" /> Cadastrar Manualmente
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
               {products.map(p => {
                 const imagesArray = p.image ? p.image.split(',') : [];
                 const firstImg = imagesArray.length > 0 ? imagesArray[0] : null;
                 const isVideo = firstImg ? (firstImg.endsWith('.mp4') || firstImg.endsWith('.webm') || firstImg.endsWith('.mov')) : (p.media && p.media.length > 0 && p.media[0].type === 'video');
                 const displayUrl = firstImg || (p.media && p.media.length > 0 ? p.media[0].url : '');

                 return (
                 <div key={p.id} onClick={() => { setModalItem(p); setIsModalOpen(true); }} className="border border-gray-100 rounded-2xl overflow-hidden hover:shadow-md transition-all cursor-pointer relative group flex flex-col justify-between">
                    {!p.is_available && (
                      <div className="absolute top-2 right-2 bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-1 rounded shadow-sm z-10 uppercase tracking-widest">Pendente</div>
                    )}
                    {(() => {
                      if (!p.created_at) return null;
                      const createdAt = new Date(p.created_at);
                      const expirationDate = new Date(createdAt.getTime() + (p.duration_days || 7) * 24 * 60 * 60 * 1000);
                      const daysRemaining = Math.ceil((expirationDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                      
                      if (daysRemaining <= 0) return null; // cron will delete

                      if (daysRemaining <= 1) {
                         return <div className="absolute top-2 left-2 bg-red-500 text-white text-[10px] font-bold px-2 py-1 rounded shadow-sm z-10 uppercase tracking-widest">Expira amanhã</div>
                      } else if (daysRemaining <= 2) {
                         return <div className="absolute top-2 left-2 bg-amber-500 text-white text-[10px] font-bold px-2 py-1 rounded shadow-sm z-10 uppercase tracking-widest">Faltam 2 dias</div>
                      }
                      
                      return <div className="absolute top-2 left-2 bg-black/50 text-white text-[9px] font-bold px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity z-10 uppercase">{daysRemaining} dias restantes</div>;
                    })()}
                    {isVideo ? (
                       <video src={displayUrl + '#t=0.1'} className="w-full aspect-square object-cover bg-gray-100" muted playsInline preload="metadata" />
                    ) : (
                       <img src={displayUrl} className="w-full aspect-square object-cover bg-gray-100" />
                    )}
                    <div className="p-4 bg-white flex flex-col justify-between flex-1">
                       <h4 className="font-semibold text-sm truncate">{p.name}</h4>
                       <div className="flex justify-between items-center mt-1">
                         <p className="text-xs text-[#007AFF] font-medium">
                           {Number(p.price) === 0 ? 'A consultar' : `R$ ${parseFloat(p.price).toLocaleString('pt-BR')}${(p.business_model && p.business_model !== 'Venda' && p.business_model !== 'Venda por unidade') ? ` (${p.business_model})` : ''}`}
                         </p>
                         {p.user_name && <p className="text-[9px] text-[#86868B] uppercase font-bold truncate max-w-[80px]">By {p.user_name}</p>}
                       </div>
                       {p.tokens && Number(p.tokens) > 0 ? (
                         <div className="mt-1.5 flex items-center gap-1 text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full w-fit">
                           <span>🪙</span>
                           <span>{p.tokens} E{p.req_token_type || 2048}</span>
                         </div>
                       ) : null}
                       <div className="flex gap-2 p-0 hidden shadow-none">
                       </div>
                       <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-500 font-semibold border-t border-gray-100 pt-2">
                         <div className="flex items-center gap-1" title="Visualizações">
                            <span className="text-[9px] uppercase tracking-wider">👁️</span> {p.views_count || 0}
                         </div>
                         <div className="flex items-center gap-1" title="Cliques">
                            <span className="text-[9px] uppercase tracking-wider">👆</span> {p.clicks_count || 0}
                         </div>
                         <div className="flex items-center gap-1" title="Interações/Comentários">
                            <span className="text-[9px] uppercase tracking-wider">💬</span> {p.interactions_count || 0}
                         </div>
                       </div>
                    </div>
                 </div>
                 );
               })}
            </div>
          )}
       </div>

       <AnimatePresence>
         {isModalOpen && (
           <ProductModal item={modalItem} user={user} onClose={() => { setIsModalOpen(false); fetchProducts(); }} />
         )}
       </AnimatePresence>
    </motion.div>
  );
}

function ProductModal({ item, user, onClose }: { item?: any, user?: any, onClose: () => void }) {
  const [formData, setFormData] = useState({
    name: item?.name || '', 
    category: item?.category || 'Beleza feminina', 
    business_model: item?.business_model || 'Venda',
    price: item?.price || '', 
    tokens: item?.tokens || '', 
    req_token_amount: item?.req_token_amount?.toString() || item?.tokens?.toString() || '',
    req_token_type: item?.req_token_type?.toString() || '2048',
    stock: item?.stock || '', 
    details: item?.details || '',
    tables: item?.tables || '',
    seats_per_table: item?.seats_per_table || '2',
    is_available: item?.is_available || false,
    duration_days: item?.duration_days?.toString() || '7'
  });
  const [media, setMedia] = useState<{type: string, url: string, fileName?: string}[]>(item?.media || []);
  const [variations, setVariations] = useState<{type: string, options: string[], multiple?: boolean, multipleCount?: boolean, optionPrices?: string[]}[]>(item?.variations || [{ type: 'cor', options: [] }]);
  const [newOptionTexts, setNewOptionTexts] = useState<{[key: number]: string}>({});
  const [newOptionPrices, setNewOptionPrices] = useState<{[key: number]: string}>({});

  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [settings, setSettings] = useState<any>(null);

  useEffect(() => {
    apiFetch('/api/settings')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setSettings(data.settings);
        }
      })
      .catch(err => console.error("Erro ao carregar configurações de custo:", err));
  }, []);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const url = item ? `/api/products/${item.id}` : '/api/products';
      const method = item ? 'PUT' : 'POST';
      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, media, variations })
      });
      const data = await res.json();
      if (!data.success) {
        if (data.error === '100') {
           alert('Erro no processamento do token (Erro 100) ou tempo esgotado.');
        } else {
           alert(data.error || 'Erro ao salvar produto');
        }
        if (data.product) onClose(); // se o produto foi criado, feche o modal
      } else {
        if (data.pendingWebhook) {
          alert('Produto cadastrado com sucesso! O anúncio ficará com o status Pendente até que o webhook liquide a transação do token e ative o produto automaticamente.');
        }
        onClose();
      }
    } catch(e) {
      alert('Erro inesperado ao salvar.');
    }
    setLoading(false);
  };

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    setUploading(true);
    try {
      const newItems = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.size > 500 * 1024 * 1024) {
          alert(`O arquivo ${file.name} é muito grande (máximo 500MB)`);
          continue;
        }

        try {
          // 1. Pedir URL assinada
          const presignedRes = await apiFetch('/api/presigned-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileName: file.name, mimeType: file.type })
          });
          if (!presignedRes.ok) throw new Error('Falha HTTP ao obter URL assinada de upload');
          const presignedData = await presignedRes.json();
          if (!presignedData.success) throw new Error('Falha ao obter link de upload');

          // 2. Upload direto para o MinIO (via PUT)
          const uploadRes = await fetch(presignedData.url, {
            method: 'PUT',
            body: file,
            headers: { 'Content-Type': file.type }
          });

          if (!uploadRes.ok) throw new Error(`Falha no upload direto do arquivo ${file.name}`);

          // 3. Adicionar aos itens de mídia
          let type = 'image';
          if (file.type.startsWith('video')) type = 'video';
          else if (file.type === 'application/pdf') type = 'pdf';
          
          newItems.push({ 
            type, 
            url: presignedData.publicUrl, 
            fileName: presignedData.fileName 
          });
        } catch (minioErr) {
          console.warn('Falha no upload direto via MinIO, recorrendo ao upload com fallback local do servidor.', minioErr);
          
          const formData = new FormData();
          formData.append('files', file);
          
          const serverRes = await apiFetch('/api/upload', {
            method: 'POST',
            body: formData
          });
          if (!serverRes.ok) throw new Error('Erro na comunicação do upload com o servidor');
          const serverData = await serverRes.json();
          if (serverData.success && Array.isArray(serverData.files) && serverData.files.length > 0) {
            const uploadedFile = serverData.files[0];
            let type = 'image';
            if (file.type.startsWith('video') || (uploadedFile.type && uploadedFile.type.startsWith('video'))) type = 'video';
            else if (file.type === 'application/pdf' || (uploadedFile.type && uploadedFile.type === 'application/pdf')) type = 'pdf';
            
            newItems.push({
              type,
              url: uploadedFile.url,
              fileName: uploadedFile.fileName
            });
          } else {
            throw new Error(serverData.error || 'Falha ao processar upload no servidor');
          }
        }
      }

      setMedia([...media, ...newItems]);
      
    } catch (err: any) {
      console.error(err);
      alert('Erro no upload: ' + err.message);
    }
    setUploading(false);
    e.target.value = ''; // clear input
  };
  
  const handleRemoveMedia = async (idx: number) => {
    const removed = media[idx];
    setMedia(media.filter((_, i) => i !== idx));
    if (removed.fileName) {
       try { await apiFetch(`/api/upload/${removed.fileName}`, { method: 'DELETE' }); } catch(e) {}
    }
  };

  const handleDelete = async () => {
    if (!item) return;
    if (confirm('Deseja realmente apagar este produto?')) {
      setLoading(true);
      await apiFetch(`/api/products/${item.id}`, { method: 'DELETE' });
      for (const m of media) {
        if (m.fileName) await apiFetch(`/api/upload/${m.fileName}`, { method: 'DELETE' }).catch(()=>null);
      }
      onClose();
    }
  };

  const updateVariationType = (idx: number, type: string) => {
    const newVars = [...variations];
    newVars[idx].type = type;
    setVariations(newVars);
  };
  
  const removeVariationOption = (idx: number, optIdx: number) => {
    const newVars = [...variations];
    newVars[idx].options.splice(optIdx, 1);
    if (newVars[idx].optionPrices) {
      newVars[idx].optionPrices!.splice(optIdx, 1);
    }
    setVariations(newVars);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 md:p-4">
       <motion.div 
         initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
         className="w-full sm:max-w-xl h-[90vh] sm:h-[85vh] bg-white rounded-t-[32px] sm:rounded-[32px] flex flex-col shadow-2xl relative overflow-hidden"
       >
         <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center bg-white z-10 sticky top-0">
            <div>
              <h2 className="text-2xl font-bold text-[#1D1D1F] tracking-tight leading-none">{item ? 'Editar Produto' : 'Novo Produto'}</h2>
              <p className="text-[10px] font-bold text-[#86868B] tracking-widest mt-1 uppercase">{item ? 'Atualização de inventário' : 'Adição ao inventário'}</p>
            </div>
            <div className="flex items-center gap-2">
              {item && (
                <button onClick={handleDelete} className="w-8 h-8 bg-[#FFF0F0] rounded-full flex items-center justify-center text-[#FF3B30] hover:bg-red-100 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <button onClick={onClose} className="w-8 h-8 bg-[#F5F5F7] rounded-full flex items-center justify-center text-[#1D1D1F] hover:bg-gray-200 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
         </div>

         <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8 bg-[#FAFAFA]">
            {/* Galeria de Mídia */}
            <div>
               <div className="flex justify-between items-end mb-3">
                 <div className="flex items-center gap-2">
                   <label className="text-[11px] font-bold text-[#1D1D1F] tracking-wide">GALERIA DE MÍDIA</label>
                   <button 
                     type="button" 
                     onClick={() => {
                       const urls = [
                         "https://images.unsplash.com/photo-1542496658-e33a6d0d50f6?auto=format&fit=crop&q=80&w=800",
                         "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&q=80&w=800",
                         "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&q=80&w=800",
                         "https://images.unsplash.com/photo-1572635196237-14b3f281503f?auto=format&fit=crop&q=80&w=800",
                         "https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&q=80&w=800",
                         "https://images.unsplash.com/photo-1503602642458-232111445657?auto=format&fit=crop&q=80&w=800"
                       ];
                       const randomUrl = urls[Math.floor(Math.random() * urls.length)];
                       setMedia([...media, { type: 'image', url: randomUrl, fileName: 'temp_sample_' + Date.now() + '.jpg' }]);
                     }}
                     className="px-2 py-0.5 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 text-[9px] font-bold rounded uppercase tracking-wider transition-colors"
                   >
                     Usar Foto de Teste
                   </button>
                 </div>
                 <span className="text-[10px] font-bold text-[#86868B] tracking-widest">{media.length}/10 ARQUIVOS</span>
               </div>
               <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none items-center">
                  {media.map((m, i) => (
                    <div key={i} className="relative w-24 h-24 shrink-0 rounded-2xl overflow-hidden bg-white shadow-sm border border-gray-100 group">
                      {m.type === 'video' ? (
                        <video src={m.url} className="w-full h-full object-cover" muted playsInline preload="metadata" />
                      ) : m.type === 'pdf' ? (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-red-50 text-red-600">
                          <FileText className="w-8 h-8" />
                          <span className="text-[8px] font-bold mt-1">PDF</span>
                        </div>
                      ) : (
                        <img src={m.url} className="w-full h-full object-cover" />
                      )}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                         <Trash2 className="w-5 h-5 text-white cursor-pointer" onClick={() => handleRemoveMedia(i)} />
                      </div>
                      <span className="absolute bottom-1.5 left-1.5 bg-black/60 text-white text-[8px] font-bold px-1.5 py-0.5 rounded uppercase">{m.type}</span>
                    </div>
                  ))}
                  
                  {uploading ? (
                    <div className="w-24 h-24 shrink-0 rounded-2xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-1 bg-gray-50">
                       <RefreshCw className="w-5 h-5 text-[#86868B] animate-spin" />
                       <span className="text-[9px] font-bold text-[#86868B]">ENVIANDO...</span>
                    </div>
                  ) : media.length < 10 && (
                    <label className="w-24 h-24 shrink-0 rounded-2xl border-2 border-dashed border-[#007AFF]/30 flex flex-col items-center justify-center gap-1 cursor-pointer hover:bg-[#007AFF]/5 transition-colors">
                      <Plus className="w-6 h-6 text-[#007AFF]" />
                      <input type="file" className="hidden" accept="image/*,video/*,application/pdf" multiple onChange={handleMediaUpload} />
                    </label>
                  )}
               </div>
            </div>

            {/* Identificação */}
            <div>
              <div className="flex justify-between items-end mb-2">
                 <label className="text-[11px] font-bold text-[#86868B] tracking-wide block">IDENTIFICAÇÃO (NOME)</label>
                 {user?.role === 'admin' && item && (
                    <label className="flex items-center gap-2 text-[11px] font-bold text-[#1D1D1F] cursor-pointer bg-gray-50 px-2 py-1 rounded-md border border-gray-200">
                      <input 
                        type="checkbox" 
                        checked={formData.is_available} 
                        onChange={e => setFormData({...formData, is_available: e.target.checked})} 
                        className="accent-blue-600 w-3 h-3"
                      />
                      Produto Aprovado / Disponível
                    </label>
                 )}
              </div>
              <input 
                type="text" placeholder="Nome do produto" 
                disabled={!!item && user?.role === 'user'}
                value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}
                className="w-full bg-white border border-gray-200 focus:border-[#007AFF] rounded-2xl px-4 py-3.5 text-sm outline-none transition-all shadow-sm disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
              />
            </div>

            {/* Categoria */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-[#86868B] tracking-wide mb-2 block">CATEGORIA PRINCIPAL</label>
                <select 
                  value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})}
                  className="w-full bg-white border border-gray-200 focus:border-[#007AFF] rounded-2xl px-4 py-3.5 text-sm outline-none transition-all shadow-sm appearance-none"
                >
                  <option>Beleza feminina</option>
                  <option>Saúde</option>
                  <option>Automotivo</option>
                  <option>Delivery</option>
                  <option>Restaurante</option>
                  <option>Eletrodoméstico</option>
                  <option>Eletrônico</option>
                  <option>Construção</option>
                  <option>Farmaceutico</option>
                  <option>Mercado</option>
                  <option>Veículo</option>
                  <option>Imoveis</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-[#86868B] tracking-wide mb-2 block">TIPO DE PRODUTO</label>
                <select 
                  value={formData.business_model} onChange={e => setFormData({...formData, business_model: e.target.value})}
                  className="w-full bg-white border border-gray-200 focus:border-[#007AFF] rounded-2xl px-4 py-3.5 text-sm outline-none transition-all shadow-sm appearance-none"
                >
                  <option value="Venda">Venda</option>
                  <option value="Serviço">Serviço</option>
                  <option value="Delivery">Delivery</option>
                  <option value="Reserva">Reserva</option>
                </select>
              </div>
              
              {!item && (
                <div>
                  <label className="text-[11px] font-bold text-[#86868B] tracking-wide mb-2 block">TEMPO DE PUBLICAÇÃO</label>
                  <select 
                    value={formData.duration_days} onChange={e => setFormData({...formData, duration_days: e.target.value})}
                    className="w-full bg-white border border-gray-200 focus:border-[#007AFF] rounded-2xl px-4 py-3.5 text-sm outline-none transition-all shadow-sm appearance-none"
                  >
                    <option value="7">7 Dias (Plano Básico)</option>
                    <option value="30">30 Dias (Plano Mensal)</option>
                  </select>
                </div>
              )}
            </div>

            {formData.business_model === 'Reserva' && (
               <div className="grid grid-cols-2 gap-4 mt-4 p-4 bg-[#F5F5F7] rounded-2xl border border-gray-100">
                 <div>
                   <label className="text-[11px] font-bold text-[#86868B] tracking-wide mb-2 block">MESAS (SEPARADAS POR VÍRGULA)</label>
                   <input 
                     type="text" placeholder="Ex: Mesa 1, Mesa 2, Mesa Externa"
                     value={formData.tables} onChange={e => setFormData({...formData, tables: e.target.value})}
                     className="w-full bg-white border border-gray-200 focus:border-[#007AFF] rounded-2xl px-4 py-3.5 text-sm outline-none transition-all shadow-sm"
                   />
                 </div>
                 <div>
                   <label className="text-[11px] font-bold text-[#86868B] tracking-wide mb-2 block">CADEIRAS POR MESA</label>
                   <select 
                     value={formData.seats_per_table} onChange={e => setFormData({...formData, seats_per_table: e.target.value})}
                     className="w-full bg-white border border-gray-200 focus:border-[#007AFF] rounded-2xl px-4 py-3.5 text-sm outline-none transition-all shadow-sm appearance-none"
                   >
                     <option value="2">2 cadeiras</option>
                     <option value="4">4 cadeiras</option>
                     <option value="6">6 cadeiras</option>
                   </select>
                 </div>
               </div>
            )}

            {/* Valores e Estoque */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
               <div>
                  <label className="text-[10px] font-bold text-[#86868B] tracking-wide mb-2 block">PREÇO (BRL)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[#86868B]">R$</span>
                    <input 
                      type="number" placeholder="0" 
                      value={formData.price} onChange={e => setFormData({...formData, price: e.target.value})}
                      className="w-full bg-white border border-gray-200 focus:border-[#007AFF] rounded-2xl pl-8 pr-3 py-3.5 text-sm outline-none transition-all shadow-sm"
                    />
                  </div>
               </div>
               <div>
                  <label className="text-[10px] font-bold text-[#86868B] tracking-wide mb-2 block">QTD TOKENS</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2">🪙</span>
                    <input 
                      type="number" placeholder="0" 
                      value={formData.tokens || formData.req_token_amount} 
                      onChange={e => setFormData({...formData, tokens: e.target.value, req_token_amount: e.target.value})}
                      className="w-full bg-white border border-gray-200 focus:border-[#007AFF] rounded-2xl pl-8 pr-3 py-3.5 text-sm outline-none transition-all shadow-sm"
                    />
                  </div>
                  <p className="text-[9px] text-[#86868B] mt-1 pl-1">Escolha 0 para não usar token</p>
               </div>
               <div>
                  <label className="text-[10px] font-bold text-[#86868B] tracking-wide mb-2 block">TIPO TOKEN</label>
                  <select 
                    value={formData.req_token_type} 
                    onChange={e => setFormData({...formData, req_token_type: e.target.value})}
                    className="w-full bg-white border border-gray-200 focus:border-[#007AFF] rounded-2xl px-3 py-3.5 text-sm outline-none transition-all shadow-sm"
                  >
                    <option value="64">E64</option>
                    <option value="128">E128</option>
                    <option value="256">E256</option>
                    <option value="512">E512</option>
                    <option value="1024">E1024</option>
                    <option value="2048">E2048 (Padrão)</option>
                    <option value="4096">E4096</option>
                  </select>
               </div>
               <div>
                  <label className="text-[10px] font-bold text-[#86868B] tracking-wide mb-2 block">ESTOQUE</label>
                  <div className="relative">
                    <Package className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#86868B]" />
                    <input 
                      type="number" placeholder="0" 
                      value={formData.stock} onChange={e => setFormData({...formData, stock: e.target.value})}
                      className="w-full bg-[#F0F8FF] border border-[#007AFF]/30 focus:border-[#007AFF] rounded-2xl pl-9 pr-3 py-3.5 text-sm outline-none transition-all shadow-sm"
                    />
                  </div>
               </div>
            </div>

            {/* Detalhes */}
            <div>
              <label className="text-[11px] font-bold text-[#86868B] tracking-wide mb-2 block">DETALHES ADICIONAIS / DESCRIÇÃO</label>
              <textarea 
                placeholder="detalhes do produto" rows={4}
                value={formData.details} onChange={e => setFormData({...formData, details: e.target.value})}
                className="w-full bg-white border border-gray-200 focus:border-[#007AFF] rounded-2xl px-4 py-3.5 text-sm outline-none transition-all shadow-sm resize-none"
              />
            </div>

            {/* Variações */}
            <div>
               <div className="flex justify-between items-center mb-3">
                 <label className="text-[11px] font-bold text-[#1D1D1F] tracking-wide">VARIAÇÕES DE SKU</label>
                 <button onClick={() => setVariations([...variations, {type: 'nova', options: []}])} className="w-6 h-6 bg-[#F5F5F7] rounded-full flex items-center justify-center text-[#007AFF] hover:bg-gray-200"><Plus className="w-3 h-3" /></button>
               </div>
               
               <div className="space-y-4">
                  {variations.map((v, idx) => (
                    <div key={idx} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                        <label className="text-[9px] font-bold text-[#86868B] tracking-wide mb-1.5 block">TIPO DE VARIAÇÃO</label>
                        <div className="flex gap-2">
                          <input type="text" value={v.type} onChange={(e) => updateVariationType(idx, e.target.value)} className="flex-1 bg-white border border-gray-200 focus:border-[#007AFF] rounded-xl px-3 py-2 text-sm font-medium outline-none" />
                          <button onClick={() => setVariations(variations.filter((_, i) => i !== idx))} className="w-9 h-9 shrink-0 bg-[#FFF0F0] rounded-xl flex items-center justify-center text-[#FF3B30]"><Trash2 className="w-4 h-4" /></button>
                        </div>
                        <label className="text-[9px] font-bold text-[#86868B] tracking-wide mt-4 mb-2 block">OPÇÕES</label>
                        <div className="flex gap-2 flex-wrap items-center">
                           {v.options.map((opt, optIdx) => (
                             <span key={optIdx} className="bg-white border border-gray-200 rounded-full pl-3 pr-1 py-1 text-xs font-semibold flex items-center gap-1 shadow-sm">
                               {opt} {v.optionPrices && v.optionPrices[optIdx] && (
                                   <span className="text-[10px] text-green-600 font-bold ml-1">(+ R$ {v.optionPrices[optIdx]})</span>
                               )}
                               <button onClick={(e) => { e.preventDefault(); removeVariationOption(idx, optIdx); }} className="w-5 h-5 rounded-full hover:bg-gray-100 flex justify-center items-center"><X className="w-3 h-3 text-gray-500" /></button>
                             </span>
                           ))}
                           <div className="flex gap-2 mt-2 w-full">
                             <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 flex items-center">
                               <input 
                                 type="text" 
                                 value={newOptionTexts[idx] || ''} 
                                 onChange={e => setNewOptionTexts({...newOptionTexts, [idx]: e.target.value})} 
                                 onKeyDown={e => {
                                   if (e.key === 'Enter') {
                                       e.preventDefault();
                                       if (newOptionTexts[idx]) {
                                           const newVars = [...variations];
                                           newVars[idx].options.push(newOptionTexts[idx]);
                                           if (!newVars[idx].optionPrices) newVars[idx].optionPrices = [];
                                           newVars[idx].optionPrices!.push(newOptionPrices[idx] || '');
                                           setVariations(newVars);
                                           setNewOptionTexts({...newOptionTexts, [idx]: ''});
                                           setNewOptionPrices({...newOptionPrices, [idx]: ''});
                                       }
                                   }
                                 }}
                                 placeholder="Nome da opção"
                                 className="text-xs bg-transparent border-none outline-none font-medium w-full text-gray-700 placeholder-gray-400"
                               />
                             </div>
                             <div className="w-28 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 flex items-center">
                               <span className="text-xs text-gray-400 mr-1 font-medium">R$</span>
                               <input 
                                 type="number" 
                                 value={newOptionPrices[idx] || ''} 
                                 onChange={e => setNewOptionPrices({...newOptionPrices, [idx]: e.target.value})} 
                                 onKeyDown={e => {
                                   if (e.key === 'Enter') {
                                       e.preventDefault();
                                       if (newOptionTexts[idx]) {
                                           const newVars = [...variations];
                                           newVars[idx].options.push(newOptionTexts[idx]);
                                           if (!newVars[idx].optionPrices) newVars[idx].optionPrices = [];
                                           newVars[idx].optionPrices!.push(newOptionPrices[idx] || '');
                                           setVariations(newVars);
                                           setNewOptionTexts({...newOptionTexts, [idx]: ''});
                                           setNewOptionPrices({...newOptionPrices, [idx]: ''});
                                       }
                                   }
                                 }}
                                 placeholder="0,00"
                                 className="text-xs bg-transparent border-none outline-none font-medium w-full text-gray-700 placeholder-gray-400"
                               />
                             </div>
                             <button 
                                onClick={(e) => {
                                  e.preventDefault();
                                  if (newOptionTexts[idx]) {
                                      const newVars = [...variations];
                                      newVars[idx].options.push(newOptionTexts[idx]);
                                      if (!newVars[idx].optionPrices) newVars[idx].optionPrices = [];
                                      newVars[idx].optionPrices!.push(newOptionPrices[idx] || '');
                                      setVariations(newVars);
                                      setNewOptionTexts({...newOptionTexts, [idx]: ''});
                                      setNewOptionPrices({...newOptionPrices, [idx]: ''});
                                  }
                                }}
                                className="bg-[#007AFF] hover:bg-blue-600 text-white rounded-xl px-4 text-xs font-bold transition-colors"
                             >
                                ADD
                             </button>
                           </div>
                        </div>

                        {/* Configurações Adicionais da Variação */}
                        <div className="flex flex-col gap-2 mt-4 pt-3 border-t border-gray-50">
                          <label className="flex items-center gap-2 cursor-pointer w-fit">
                            <input 
                              type="checkbox" 
                              checked={v.multiple || false}
                              onChange={(e) => {
                                const newVars = [...variations];
                                newVars[idx].multiple = e.target.checked;
                                setVariations(newVars);
                              }}
                              className="accent-[#007AFF] w-4 h-4 cursor-pointer"
                            />
                            <span className="text-[10px] font-bold text-[#86868B] tracking-wide">ACEITAR MÚLTIPLAS OPÇÕES</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer w-fit">
                            <input 
                              type="checkbox" 
                              checked={v.multipleCount || false}
                              onChange={(e) => {
                                const newVars = [...variations];
                                newVars[idx].multipleCount = e.target.checked;
                                setVariations(newVars);
                              }}
                              className="accent-[#007AFF] w-4 h-4 cursor-pointer"
                            />
                            <span className="text-[10px] font-bold text-[#86868B] tracking-wide">INCLUIR CONTAGEM (EX: +2 BATATAS)</span>
                          </label>
                        </div>
                    </div>
                  ))}
               </div>
            </div>

         {/* Seção Reservada para Confirmação e Botão Salvar (abaixo dos inputs) */}
         <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm mt-6 mb-2">
           {(() => {
             const duration = parseInt(formData.duration_days) === 30 ? 30 : 7;
             let requiredAmount = 1;
             let requiredTypeLength = 128;
             
             if (duration === 30) {
               requiredAmount = settings && settings.cost_30d_amount !== null ? settings.cost_30d_amount : 2;
               requiredTypeLength = settings && settings.cost_30d_type !== null ? settings.cost_30d_type : 256;
             } else {
               requiredAmount = settings && settings.cost_7d_amount !== null ? settings.cost_7d_amount : (settings?.product_token_cost_amount || 1);
               requiredTypeLength = settings && settings.cost_7d_type !== null ? settings.cost_7d_type : (settings?.product_token_cost_type || 128);
             }

             const isUserAdmin = user?.role === 'admin';
             const availableMatchingTokens = Array.isArray(user?.wallet?.tokens)
               ? user?.wallet?.tokens.filter((t: string) => t && typeof t === 'string' && t.length === requiredTypeLength).length
               : 0;

             const hasEnoughTokens = isUserAdmin || availableMatchingTokens >= requiredAmount;

             if (showConfirmation) {
               return (
                 <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex flex-col gap-3">
                    <div>
                      <h4 className="font-bold text-[#1D1D1F] text-sm">{item ? 'Confirmar Edição' : 'Confirmar Cadastro'}</h4>
                      {!item ? (
                        <div className="text-xs text-blue-800 mt-1.5 space-y-1">
                          <p>Ao cadastrar o produto, os tokens correspondentes ao anúncio serão liquidados do seu saldo após conclusão.</p>
                          <div className="mt-2.5 p-3 bg-white/75 rounded-xl border border-blue-100 space-y-1">
                            <p className="flex justify-between">
                              <span className="text-gray-500 font-medium">Plano Publicação:</span>
                              <span className="font-bold text-[#1D1D1F]">{duration} dias</span>
                            </p>
                            <p className="flex justify-between">
                              <span className="text-gray-500 font-medium">Custo Exigido:</span>
                              <span className="font-bold text-[#007AFF]">{requiredAmount} token(s) (Tipo E{requiredTypeLength})</span>
                            </p>
                            <p className="flex justify-between">
                              <span className="text-gray-500 font-medium">Seu Saldo Disponível:</span>
                              <span className={`font-bold ${hasEnoughTokens ? 'text-green-600' : 'text-red-500'}`}>{availableMatchingTokens} token(s) (Tipo E{requiredTypeLength})</span>
                            </p>
                          </div>
                          {hasEnoughTokens ? (
                            <p className="text-green-700 font-semibold mt-2.5">✓ Saldo disponível suficiente. O anúncio será cadastrado e ficará Pendente até a aprovação automática pelo webhook.</p>
                          ) : (
                            <p className="text-red-600 font-bold mt-2.5">✗ Você não tem saldo de eTokens do tipo E{requiredTypeLength} suficiente para este anúncio. Por favor, adquira mais moedas.</p>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-blue-800 mt-1">Deseja autorizar as alterações no produto?</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setShowConfirmation(false)} className="flex-1 bg-white text-blue-600 font-bold text-xs py-3 rounded-xl border border-blue-200 hover:bg-blue-50 transition-colors">Cancelar</button>
                      <button 
                        onClick={handleSubmit} 
                        disabled={loading || uploading || (!item && !hasEnoughTokens)} 
                        className="flex-1 bg-[#007AFF] text-white font-bold text-xs py-3 rounded-xl shadow-sm hover:bg-[#0066CC] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {loading ? 'Processando...' : 'Autorizar & Concluir'}
                      </button>
                    </div>
                 </div>
               );
             }

             return (
               <button 
                 type="button"
                 onClick={() => setShowConfirmation(true)} 
                 disabled={loading || uploading}
                 className="w-full bg-[#007AFF] hover:bg-[#0066CC] active:scale-[0.99] transition-all text-white font-semibold rounded-2xl py-4 flex items-center justify-center shadow-lg shadow-blue-500/20 disabled:opacity-70 disabled:cursor-not-allowed"
               >
                 {loading ? 'Processando...' : <><RefreshCw className="w-4 h-4 mr-2" /> Salvar Produto</>}
               </button>
             );
           })()}
         </div>

         {/* Seção de Métricas de Engajamento e Histórico de Feedback (abaixo de tudo!) */}
         {item && (
           <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm mt-6">
             <ProductInteractionsArea item={item} user={user} hideInteractions={true} />
           </div>
         )}
         </div>
       </motion.div>
    </div>
  );
}

function ProductInteractionsArea({ item, user, hideInteractions = false }: { item: any, user?: any, hideInteractions?: boolean }) {
  const [likesCount, setLikesCount] = useState(item.likes_count || 0);
  const [liked, setLiked] = useState(false);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState('');
  const [sendingComment, setSendingComment] = useState(false);

  const loadLikes = async () => {
    try {
      const likedRes = await apiFetch(`/api/products/${item.id}/liked`);
      const likedData = await likedRes.json();
      setLiked(likedData.liked);

      const countRes = await apiFetch(`/api/products/${item.id}/likes`);
      const countData = await countRes.json();
      setLikesCount(countData.count);
    } catch (e) {}
  };

  const loadComments = async () => {
    try {
      const res = await apiFetch(`/api/products/${item.id}/comments`);
      const data = await res.json();
      if (Array.isArray(data.comments)) {
        setComments(data.comments);
      }
    } catch(e) {}
  };

  useEffect(() => {
    loadLikes();
    loadComments();
  }, [item.id]);

  const handleToggleLike = async () => {
    try {
      const res = await apiFetch(`/api/products/${item.id}/like`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setLiked(data.liked);
        setLikesCount((prev: number) => data.liked ? prev + 1 : Math.max(0, prev - 1));
      }
    } catch(e) {
      alert('Erro ao processar curtida.');
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    setSendingComment(true);
    try {
      const res = await apiFetch(`/api/products/${item.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment: newComment })
      });
      const data = await res.json();
      if (data.success) {
        setComments((prev) => [data.comment, ...prev]);
        setNewComment('');
      } else {
        alert(data.error || 'Erro ao publicar comentário.');
      }
    } catch(e) {
      alert('Erro ao enviar.');
    }
    setSendingComment(false);
  };

  return (
    <div className="mt-8 pt-6 border-t border-gray-150 space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-extrabold text-[#1D1D1F] uppercase tracking-wider flex items-center gap-1.5">
          <span>📊 Estatísticas & Feedback</span>
        </h3>
        
        {!hideInteractions && (
          <button
            onClick={handleToggleLike}
            type="button"
            className={cn(
              "h-9 px-4 rounded-full border text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer active:scale-95",
              liked 
                ? "bg-red-50 border-red-100 text-red-500 shadow-sm shadow-red-500/10" 
                : "bg-white border-gray-200 hover:bg-gray-50 text-gray-600"
            )}
          >
            <Heart className={cn("w-4 h-4", liked && "fill-current")} />
            <span>{liked ? 'Curtido' : 'Curtir'}</span>
          </button>
        )}
      </div>

      {/* Grid de Métricas do Produto */}
      <div className="grid grid-cols-4 gap-2">
        <div className="bg-gray-55 p-3 rounded-2xl border border-gray-100 flex flex-col items-center">
          <span className="text-gray-400 text-[8px] font-bold uppercase tracking-widest text-center">Views</span>
          <span className="text-[#1D1D1F] font-extrabold text-xs mt-1">{item.views_count || 0}</span>
        </div>
        <div className="bg-gray-55 p-3 rounded-2xl border border-gray-100 flex flex-col items-center">
          <span className="text-gray-400 text-[8px] font-bold uppercase tracking-widest text-center">Cliques</span>
          <span className="text-[#1D1D1F] font-extrabold text-xs mt-1">{item.clicks_count || 0}</span>
        </div>
        <div className="bg-gray-55 p-3 rounded-2xl border border-gray-100 flex flex-col items-center">
          <span className="text-gray-400 text-[8px] font-bold uppercase tracking-widest text-center">Curtidas</span>
          <span className="text-[#1D1D1F] font-extrabold text-xs mt-1">{likesCount}</span>
        </div>
        <div className="bg-gray-55 p-3 rounded-2xl border border-gray-100 flex flex-col items-center">
          <span className="text-gray-400 text-[8px] font-bold uppercase tracking-widest text-center">Coments</span>
          <span className="text-[#1D1D1F] font-extrabold text-xs mt-1">{comments.length}</span>
        </div>
      </div>

      {/* Comentários */}
      <div className="space-y-4 pt-2">
        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Comentários ({comments.length})</h4>
        
        {/* Escrever comentário */}
        {!hideInteractions && (
          <form onSubmit={handleAddComment} className="flex gap-2">
            <input
              type="text"
              placeholder="Escreva um comentário sobre o anúncio..."
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              className="flex-1 bg-white border border-gray-200 focus:border-[#007AFF] rounded-xl px-4 py-2.5 text-xs outline-none transition-all shadow-sm"
              required
            />
            <button
              type="submit"
              disabled={sendingComment || !newComment.trim()}
              className="px-4 bg-[#007AFF] hover:bg-blue-600 text-white font-bold text-xs rounded-xl flex items-center justify-center transition-all cursor-pointer disabled:opacity-50"
            >
              {sendingComment ? '...' : 'Enviar'}
            </button>
          </form>
        )}

        {/* Lista de Comentários */}
        <div className="space-y-3 max-h-56 overflow-y-auto pr-1 scrollbar-none">
          {comments.map((c) => (
            <div key={c.id} className="bg-gray-50/40 p-3.5 rounded-2xl border border-gray-200/60 leading-relaxed text-xs text-left">
              <div className="flex justify-between items-start gap-2">
                <span className="font-extrabold text-gray-700">{c.user_name}</span>
                <span className="text-[9px] text-gray-400">{new Date(c.created_at).toLocaleDateString('pt-BR')}</span>
              </div>
              <p className="text-gray-600 mt-1">{c.comment}</p>
            </div>
          ))}
          {comments.length === 0 && (
            <p className="text-center text-gray-400 text-xs py-3">Este anúncio ainda não recebeu comentários.</p>
          )}
        </div>
      </div>
    </div>
  );
}

// -- Orders Component --
function AdminOrders({ user }: { user: any }) {
  const [purchases, setPurchases] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'purchases'|'sales'>('purchases');
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [reservationCode, setReservationCode] = useState('');

  useEffect(() => {
    apiFetch('/api/orders')
      .then(r => r.json())
      .then(d => {
         if (d && d.success) {
            const allSales = d.sales || [];
            const allPurchases = d.purchases || [];
            const completedSales = allSales.filter((o: any) => o.status === 'Entregue');
            const pendingSales = allSales.filter((o: any) => o.status !== 'Entregue');
            setPurchases([...allPurchases, ...pendingSales].filter((o, index, self) => index === self.findIndex((t) => t.id === o.id)));
            setSales(completedSales);
            // Se não tiver compras e tiver vendas, muda pra vendas logo
            if (d.purchases?.length === 0 && d.sales?.length > 0) {
               setActiveTab('sales');
            }
         } else if (Array.isArray(d)) {
            // Fallback for previous API
            setPurchases(d);
         }
      })
      .catch(e => {});
  }, []);

  const handlePrint = () => {
    const el = document.getElementById('receipt-print');
    if (!el) return;
    
    // Create an iframe, append it to body, write html, print, remove.
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
    
    const contentWindow = iframe.contentWindow;
    if (!contentWindow) return;
    
    contentWindow.document.open();
    contentWindow.document.write(`
      <html>
        <head>
          <title>Recibo</title>
          <script src="https://cdn.tailwindcss.com"></script>
          <style>
              @page { margin: 0; }
              body { margin: 20px; font-family: sans-serif; }
          </style>
        </head>
        <body>
          <div class="p-8 w-full max-w-[800px] mx-auto bg-white m-0 text-black font-sans border-2 border-black">
             ${el.innerHTML}
          </div>
          <script>
            window.onload = () => {
               setTimeout(() => {
                 window.print();
                 // setTimeout(() => window.parent.document.body.removeChild(window.frameElement), 1000);
               }, 500);
            };
          </script>
        </body>
      </html>
    `);
    contentWindow.document.close();
  };

  const handleStatusChange = async (orderId: number, nextStatus: string) => {
    try {
       await apiFetch(`/api/orders/${orderId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: nextStatus })
       });
       // Otimistic update
       const updateOrderInList = (list: any[]) => list.map(o => o.id === orderId ? { ...o, status: nextStatus } : o);
       setPurchases(updateOrderInList(purchases));
       setSales(updateOrderInList(sales));
       if (selectedOrder && selectedOrder.id === orderId) {
          setSelectedOrder({ ...selectedOrder, status: nextStatus });
       }
    } catch(e) {}
  };

  const handleRequestDelivery = async (orderId: string) => {
    try {
      const res = await apiFetch(`/api/orders/${orderId}/request-delivery`, { method: 'PUT' });
      const data = await res.json();
      if(data.success) {
         setSelectedOrder((prev: any) => ({ ...prev, requires_delivery: true, status: 'Em andamento' }));
         alert('Entrega solicitada com sucesso!');
         apiFetch('/api/orders').then(r => r.json()).then(d => {
            if (d && d.success) {
               const allSales = d.sales || [];
               const allPurchases = d.purchases || [];
               setPurchases([...allPurchases, ...allSales.filter((o: any) => o.status !== 'Entregue')].filter((o, index, self) => index === self.findIndex((t) => t.id === o.id)));
               setSales(allSales.filter((o: any) => o.status === 'Entregue'));
            }
         });
      } else {
         alert(data.error || 'Erro ao solicitar.');
      }
    } catch(err) {
      alert('Erro de conexão.');
    }
  };

  const currentList = activeTab === 'purchases' ? purchases : sales;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 md:p-8 h-full flex flex-col relative w-full overflow-hidden">
       <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold text-[#1D1D1F] tracking-tight">Vendas e Pedidos</h2>
            <p className="text-[11px] font-bold text-[#86868B] tracking-widest mt-1 uppercase">Sua movimentação</p>
          </div>
          <div className="flex bg-[#F5F5F7] p-1 rounded-2xl w-fit">
            <button 
              onClick={() => setActiveTab('purchases')}
              className={cn("px-4 py-2 text-sm font-bold rounded-xl transition-all", activeTab === 'purchases' ? "bg-white text-[#1D1D1F] shadow-sm" : "text-[#86868B] hover:text-[#1D1D1F]")}
            >
              Meus Pedidos ({purchases.length})
            </button>
            <button 
              onClick={() => setActiveTab('sales')}
              className={cn("px-4 py-2 text-sm font-bold rounded-xl transition-all", activeTab === 'sales' ? "bg-white text-[#1D1D1F] shadow-sm" : "text-[#86868B] hover:text-[#1D1D1F]")}
            >
              Minhas Vendas ({sales.length})
            </button>
          </div>
       </div>

       <div className="bg-[#F5F5F7] rounded-[32px] flex-1 flex flex-col p-6 overflow-hidden relative">
          {currentList.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-6 shadow-sm border border-gray-100">
                <ShoppingCart className="w-8 h-8 text-[#86868B]" />
              </div>
              <h3 className="text-xl font-bold text-[#1D1D1F] mb-2">{activeTab === 'purchases' ? 'Sem pedidos efetuados' : 'Sem vendas ainda'}</h3>
              <p className="text-sm text-[#86868B]">{activeTab === 'purchases' ? 'Tudo que você comprar aparecerá aqui.' : 'Suas vendas aparecerão aqui automaticamente.'}</p>
            </div>
          ) : (
            <div className="space-y-4 overflow-y-auto">
               {currentList.map(o => (
                 <div key={o.id} onClick={() => setSelectedOrder(o)} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex justify-between items-center cursor-pointer hover:shadow-md transition-all">
                    <div>
                      <p className="font-bold text-sm">Pedido #{o.id}</p>
                      <p className="text-xs text-gray-500">{o.customer_name || 'Desconhecido'} • {new Date(o.created_at).toLocaleDateString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-[#007AFF]">{o.total_price}</p>
                      <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-bold uppercase", o.status === 'Pendente' ? 'bg-red-100 text-red-700 animate-pulse border border-red-200' : o.status === 'Entregue' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700')}>{o.status}</span>
                    </div>
                 </div>
               ))}
            </div>
          )}
       </div>

       <AnimatePresence>
         {selectedOrder && (
           <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/40 z-50 flex justify-end">
             <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }} className="w-full max-w-md bg-white h-full flex flex-col shadow-2xl relative">
               <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 bg-white z-10 sticky top-0">
                  <h3 className="font-bold text-lg">Detalhes do Pedido #{selectedOrder.id}</h3>
                  <button onClick={() => setSelectedOrder(null)} className="w-8 h-8 flex items-center justify-center bg-gray-100 rounded-full hover:bg-gray-200 transition-colors">
                     <X className="w-4 h-4 text-gray-600" />
                  </button>
               </div>
               
               <div className="flex-1 overflow-y-auto p-6 bg-[#F5F5F7]">
                  <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 mb-4">
                     <div className="flex justify-between mb-4 pb-4 border-b border-gray-100">
                        <div>
                           <p className="text-[10px] text-gray-400 font-bold tracking-widest uppercase">Cliente</p>
                           <p className="font-bold">{selectedOrder.customer_name || 'Usuário Final'}</p>
                           <p className="text-sm text-gray-500">{selectedOrder.customer_email}</p>
                            {selectedOrder.telefone && <p className="text-sm text-gray-500 mt-1">📞 {selectedOrder.telefone}</p>}
                            {(selectedOrder.endereco || selectedOrder.bairro || selectedOrder.cidade) && (
                               <div className="mt-2 text-xs text-gray-500 border-t pt-2 border-gray-100">
                                  <p className="font-semibold text-gray-800">Endereço de Entrega:</p>
                                  <p>{selectedOrder.endereco}{selectedOrder.numero ? `, ${selectedOrder.numero}` : ''}</p>
                                  <p>{selectedOrder.bairro && `${selectedOrder.bairro} - `}{selectedOrder.cidade}{selectedOrder.cep ? ` | CEP: ${selectedOrder.cep}` : ''}</p>
                               </div>
                            )}

                        </div>
                        <div className="text-right flex flex-col items-end">
                           <p className="text-[10px] text-gray-400 font-bold tracking-widest uppercase">Data</p>
                           <p className="text-sm font-semibold">{new Date(selectedOrder.created_at).toLocaleString('pt-BR')}</p>
                           <span className="text-[10px] bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded flex w-fit ml-auto mt-2 font-bold uppercase">{selectedOrder.status}</span>
                           {(selectedOrder.seller_endereco || selectedOrder.seller_bairro || selectedOrder.seller_cidade) && (
                              <div className="mt-2 text-xs text-gray-500 border-t pt-2 border-gray-100 text-right">
                                 <p className="font-semibold text-gray-800">Endereço de Retirada (Vendedor):</p>
                                 <p>{selectedOrder.seller_endereco}{selectedOrder.seller_numero ? `, ${selectedOrder.seller_numero}` : ''}</p>
                                 <p>{selectedOrder.seller_bairro && `${selectedOrder.seller_bairro} - `}{selectedOrder.seller_cidade}</p>
                              </div>
                           )}
                        </div>
                     </div>
                     <div className="space-y-4">
                        <p className="text-[10px] text-gray-400 font-bold tracking-widest uppercase text-center">Itens do Pedido</p>
                        {selectedOrder.items && selectedOrder.items.map((item: any) => (
                           <div key={item.id} className="flex justify-between py-2 border-b border-gray-50 last:border-0">
                              <div className="max-w-[70%]">
                                 <p className="text-sm font-semibold truncate" title={item.name || item.product_name}>{item.quantity}x {item.name || item.product_name}</p>
                                 <p className="text-xs text-gray-400 truncate">{item.details}</p>
                                 {item.variation_name && <p className="text-xs font-bold text-blue-500">Var: {item.variation_name}</p>}
                                 {item.variations && typeof item.variations === 'object' && Object.keys(item.variations).length > 0 && !Array.isArray(item.variations) && Object.entries(item.variations).map(([k,v]) => (
                                    <p key={k} className="text-[10px] font-bold text-blue-500 underline text-wrap break-words">{k}: {String(v)}</p>
                                 ))}
                                 {item.variations && Array.isArray(item.variations) && item.variations.length > 0 && item.variations.map((v: any, idx: number) => (
                                    <p key={idx} className="text-[10px] font-bold text-blue-500 underline text-wrap break-words">{typeof v === 'object' ? v.name || JSON.stringify(v) : String(v)}</p>
                                 ))}
                              </div>
                              <p className="text-sm font-bold text-gray-900 self-center">R$ {parseFloat(item.price || 0).toFixed(2).replace('.', ',')}</p>
                           </div>
                        ))}
                     </div>
                  </div>
                  
                  <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                     <div className="flex justify-between text-lg font-bold">
                        <span>Total:</span>
                        <span className="text-[#007AFF]">{selectedOrder.total_price}</span>
                     </div>
                  </div>

                  <div className="mt-4">
                     <label className="block text-xs font-bold text-gray-500 mb-2 uppercase">Alterar Status</label>
                     <select
                        value={selectedOrder.status}
                        onChange={(e) => handleStatusChange(selectedOrder.id, e.target.value)}
                        className="w-full bg-white border border-gray-200 font-semibold text-sm rounded-xl focus:ring-blue-500 focus:border-blue-500 block p-3 outline-none"
                     >
                        {selectedOrder.payment_method === 'reserva' ? (
                           <>
                              <option value="Pendente">Pendente</option>
                              <option value="Aprovado">Aprovado</option>
                              <option value="Reprovado">Reprovado</option>
                              <option value="Check-in">Check-in</option>
                           </>
                        ) : (
                           <>
                              <option value="Pendente">Pendente</option>
                              <option value="Em andamento">Em andamento</option>
                              <option value="Processo de entrega">Processo de entrega</option>
                              <option value="Entregue">Entregue</option>
                              <option value="Cancelado">Cancelado</option>
                           </>
                        )}
                     </select>
                  </div>
               </div>

               <div className="p-4 border-t border-gray-100 bg-white space-y-2">
                  {selectedOrder.payment_method === 'reserva' ? (
                     <>
                        {selectedOrder.status === 'Pendente' && (
                           <div className="flex gap-2 w-full">
                              <button onClick={() => handleStatusChange(selectedOrder.id, 'Aprovado')} className="flex-1 bg-green-500 hover:bg-green-600 text-white font-bold rounded-2xl py-4 flex justify-center items-center gap-2">
                                 Aprovar Reserva
                              </button>
                              <button onClick={() => handleStatusChange(selectedOrder.id, 'Reprovado')} className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold rounded-2xl py-4 flex justify-center items-center gap-2">
                                 Rejeitar
                              </button>
                           </div>
                        )}
                        {selectedOrder.status === 'Aprovado' && (
                           <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex flex-col gap-3">
                              <h4 className="font-bold text-[#1D1D1F] text-sm">Reserva Aprovada</h4>
                              <div className="text-xs text-gray-700 bg-white p-3 rounded-xl border border-gray-100 space-y-1">
                                 {selectedOrder.customer_name && <p><span className="font-bold">Cliente:</span> {selectedOrder.customer_name}</p>}
                                 {selectedOrder.telefone && <p><span className="font-bold">Contato:</span> {selectedOrder.telefone}</p>}
                                 {selectedOrder.telegram && <p><span className="font-bold">Telegram:</span> {selectedOrder.telegram}</p>}
                                 {selectedOrder.customer_email && <p><span className="font-bold">Email:</span> {selectedOrder.customer_email}</p>}
                                 {selectedOrder.user_id && <p><span className="font-bold">ID:</span> {selectedOrder.user_id}</p>}
                                 <p className="text-[10px] text-gray-400 mt-2">Dados da tabela user_client/orders</p>
                              </div>
                              <label className="text-xs font-bold text-gray-500 mt-1 uppercase">Validar Codigo do Cliente (000-000)</label>
                              <div className="flex gap-2">
                                 <input 
                                    type="text" 
                                    placeholder="000-000" 
                                    value={reservationCode} 
                                    onChange={(e) => setReservationCode(e.target.value)} 
                                    className="flex-1 bg-white border border-blue-200 focus:border-blue-500 font-semibold text-sm rounded-xl px-3 py-2 outline-none"
                                 />
                                 <button 
                                    onClick={() => {
                                       if (reservationCode === selectedOrder.order_code) {
                                          handleStatusChange(selectedOrder.id, 'Check-in');
                                          alert('Reserva confirmada com sucesso! Cliente fez Check-in.');
                                          setReservationCode('');
                                       } else {
                                          alert('Código inválido para esta reserva!');
                                       }
                                    }}
                                    className="bg-[#007AFF] hover:bg-[#0066CC] text-white px-4 py-2 font-bold rounded-xl"
                                 >
                                    Confirmar
                                 </button>
                              </div>
                           </div>
                        )}
                        {(selectedOrder.status === 'Entregue' || selectedOrder.status === 'Check-in') && (
                           <div className="w-full bg-green-50 text-green-700 font-bold rounded-2xl py-4 flex justify-center items-center gap-2 text-sm text-center px-4">
                              Reserva concluída (Check-in realizado).
                           </div>
                        )}
                        {(selectedOrder.status === 'Cancelado' || selectedOrder.status === 'Reprovado') && (
                           <div className="w-full bg-red-50 text-red-700 font-bold rounded-2xl py-4 flex justify-center items-center gap-2 text-sm text-center px-4">
                              Reserva rejeitada / cancelada.
                           </div>
                        )}
                     </>
                  ) : (
                     <>
                        {!selectedOrder.requires_delivery && selectedOrder.status !== 'Entregue' && selectedOrder.status !== 'Cancelado' && (
                           <button onClick={() => handleRequestDelivery(selectedOrder.id)} className="w-full bg-[#007AFF] hover:bg-[#0066cc] text-white font-bold rounded-2xl py-4 flex justify-center items-center gap-2 mb-2">
                              <Package className="w-5 h-5" />
                              Solicitar Entrega
                           </button>
                        )}
                        {selectedOrder.requires_delivery && (
                           <div className="w-full bg-blue-50 text-blue-700 font-bold rounded-2xl py-4 flex justify-center items-center gap-2 text-sm text-center px-4 mb-2">
                              <Package className="w-5 h-5 shrink-0" />
                              {selectedOrder.delivery_user_id ? 'Entregador já a caminho ou assumiu o pedido.' : 'Entrega solicitada. Aguardando entregador.'}
                           </div>
                        )}
                        {selectedOrder.requires_delivery && user.role === 'delivery' && (
                           <a 
                             href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(`${selectedOrder.seller_endereco}, ${selectedOrder.seller_numero}, ${selectedOrder.seller_cidade}`)}&destination=${encodeURIComponent(`${selectedOrder.endereco}, ${selectedOrder.numero}, ${selectedOrder.cidade}`)}`}
                             target="_blank" 
                             rel="noopener noreferrer"
                             className="w-full bg-green-600 hover:bg-green-700 text-white font-bold rounded-2xl py-4 flex justify-center items-center gap-2 mb-2"
                           >
                             📍 Traçar Rota (Calcular Distância)
                           </a>
                        )}
                     </>
                  )}
                  <button onClick={handlePrint} className="w-full bg-[#1D1D1F] hover:bg-black text-white font-bold rounded-2xl py-4 flex justify-center items-center gap-2">
                     <List className="w-5 h-5" />
                     Imprimir Recibo
                  </button>
               </div>
             </motion.div>
           </motion.div>
         )}
       </AnimatePresence>

       {/* INVISIBLE RECEIPT FOR PRINTING */}
       {selectedOrder && (
          <div id="receipt-print" className="hidden p-8 w-full max-w-[800px] mx-auto bg-white m-0 text-black font-sans border-2 border-black">
             <div className="flex justify-between items-center border-b-4 border-black pb-6 mb-6">
                <div>
                   <h1 className="text-4xl font-extrabold uppercase tracking-widest">Etiqueta de Envio</h1>
                   <p className="text-lg font-bold mt-2">Pedido #{selectedOrder.id}</p>
                   <p className="text-sm text-gray-600">Data: {new Date(selectedOrder.created_at).toLocaleString('pt-BR')}</p>
                </div>
                <img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=https://ais-pre-kjzo6ypjmq5gasz4w766dq-44027131642.us-west1.run.app/loja/order/${selectedOrder.id}`} className="w-32 h-32" />
             </div>

             <div className="grid grid-cols-2 gap-8 mb-8">
                <div className="border-2 border-black p-6 rounded-xl">
                   <h3 className="text-sm font-bold uppercase tracking-widest text-gray-500 mb-4">Destinatário</h3>
                   <p className="text-xl font-bold mb-2">{selectedOrder.customer_name || 'Usuário Final'}</p>
                   {selectedOrder.customer_email && <p className="text-md">{selectedOrder.customer_email}</p>}
                   {selectedOrder.telefone && <p className="text-md">Tel: {selectedOrder.telefone}</p>}
                   <div className="mt-4 text-md">
                      <p>{selectedOrder.endereco || 'n/d'}, {selectedOrder.numero || 'n/d'}</p>
                      <p>{selectedOrder.bairro || 'n/d'}</p>
                      <p>{selectedOrder.cidade || 'n/d'} - CEP: {selectedOrder.cep || 'n/d'}</p>
                   </div>
                </div>
                <div className="border-2 border-black p-6 rounded-xl">
                   <h3 className="text-sm font-bold uppercase tracking-widest text-gray-500 mb-4">Remetente</h3>
                   <p className="text-xl font-bold mb-2">Empresa ID: {selectedOrder.seller_id || 'n/d'}</p>
                   <p className="text-md">Setor de Entregas</p>
                   <div className="mt-4 text-md">
                      <p>{selectedOrder.seller_endereco || 'n/d'}, {selectedOrder.seller_numero || 'n/d'}</p>
                      <p>Bairro: {selectedOrder.seller_bairro || 'n/d'}</p>
                      <p>{selectedOrder.seller_cidade || 'n/d'} - CEP: {selectedOrder.seller_cep || 'n/d'}</p>
                   </div>
                </div>
             </div>

             <div className="border-2 border-black rounded-xl overflow-hidden">
                <table className="w-full text-left">
                   <thead className="bg-black text-white">
                      <tr>
                         <th className="p-4 font-bold uppercase tracking-widest text-sm">Qtd</th>
                         <th className="p-4 font-bold uppercase tracking-widest text-sm">Produto / Detalhes</th>
                         <th className="p-4 font-bold uppercase tracking-widest text-sm text-right">Valor</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y border-black">
                      {selectedOrder.items && selectedOrder.items.map((item: any) => (
                         <tr key={item.id}>
                            <td className="p-4 font-bold text-lg">{item.quantity}x</td>
                            <td className="p-4">
                               <p className="font-bold text-lg">{item.name || item.product_name || 'Produto'}</p>
                               {item.variations && <p className="text-sm text-gray-600 mt-1">{JSON.stringify(item.variations)}</p>}
                            </td>
                            <td className="p-4 text-right font-bold text-lg">{parseFloat(item.price || 0).toFixed(2)}</td>
                         </tr>
                      ))}
                   </tbody>
                </table>
                <div className="bg-gray-100 p-4 flex justify-between items-center border-t-2 border-black">
                   <span className="font-bold uppercase tracking-widest">Total do Pedido:</span>
                   <span className="text-2xl font-extrabold">{selectedOrder.total_price}</span>
                </div>
             </div>

             <div className="text-center mt-12 text-sm font-bold uppercase tracking-widest text-gray-500">Obrigado por comprar conosco.</div>
          </div>
       )}
    </motion.div>
  );
}


// -- Users Component --
export function AdminUsers() {
  const [activeTab, setActiveTab] = useState<'team' | 'clients'>('team');
  const [users, setUsers] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [copiedId, setCopiedId] = useState<any>(null);
  
  const defaultTeamFormState = { name: '', email: '', password: '', role: 'user', company_name: '', company_logo: '', is_approved: false, can_transfer: true, can_request: true, can_request_delivery: true, telefone: '', cep: '', endereco: '', numero: '', bairro: '', cidade: '', nickname: '' };
  const defaultClientFormState = { 
    email: '', senha_mestre: '', nome_completo: '', primeiro_nome: '', data_nascimento: '', telegram: '', melhor_horario: '', interesses: '', convite: '', telefone: '', cep: '', endereco: '', numero: '', bairro: '', cidade: ''
  };
  const [formData, setFormData] = useState<any>(defaultTeamFormState);

  const fetchData = async () => {
    try {
      const resTeam = await apiFetch('/api/users');
      const dataTeam = await resTeam.json();
      if (Array.isArray(dataTeam)) setUsers(dataTeam);

      const resClient = await apiFetch('/api/user_client');
      const dataClient = await resClient.json();
      if (Array.isArray(dataClient)) setClients(dataClient);
    } catch (e) {}
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleLogoUpload = async (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
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

      setFormData((prev: any) => ({...prev, company_logo: data.url}));
    } catch (err: any) {
      alert('Erro no upload: ' + err.message);
    }
    setUploadingLogo(false);
    e.target.value = '';
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (uploadingLogo) return;
    setLoading(true);
    try {
      let url = '';
      let method = '';
      if (activeTab === 'team') {
          url = editingUser ? `/api/users/${editingUser.id}` : '/api/users';
          method = editingUser ? 'PUT' : 'POST';
      } else {
          url = editingUser ? `/api/user_client/${editingUser.id}` : '/api/user_client';
          method = editingUser ? 'PUT' : 'POST';
      }

      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (data.success) {
        setShowAddForm(false);
        setEditingUser(null);
        setFormData(activeTab === 'team' ? defaultTeamFormState : defaultClientFormState);
        fetchData();
      } else {
        alert(data.error);
      }
    } catch (e) {}
    setLoading(false);
  };

  const handleToggleBlock = async (u: any, type: 'team'|'client') => {
    const newRole = u.role === 'blocked' ? (type === 'team' ? 'user' : 'client') : 'blocked';
    try {
      const url = type === 'team' ? `/api/users/${u.id}` : `/api/user_client/${u.id}`;
      // Sending enough info so PUT payload is acceptable
      if (type === 'team') {
          await apiFetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...u, role: newRole })
          });
      } else {
          await apiFetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...u, role: newRole })
          });
      }
      fetchData();
    } catch (e) {}
  };

  const handleToggleApproval = async (u: any) => {
    try {
       await apiFetch(`/api/users/${u.id}`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ ...u, is_approved: !u.is_approved }) });
       fetchData();
    } catch(e) {}
  };

  const handleDelete = async (u: any, type: 'team'|'client') => {
    const displayName = type === 'team' ? u.name : (u.nome_completo || u.email);
    if (!confirm(`Remover ${type === 'team' ? 'usuário' : 'cliente'} ${displayName}?`)) return;
    try {
      const url = type === 'team' ? `/api/users/${u.id}` : `/api/user_client/${u.id}`;
      await apiFetch(url, { method: 'DELETE' });
      fetchData();
    } catch (e) {}
  };

  const handleCopyId = (id: number) => {
    navigator.clipboard.writeText(String(id));
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredUsers = users.filter(u => {
    const search = searchText.toLowerCase();
    const idStr = String(u.id);
    return idStr.includes(search) || (u.email && u.email.toLowerCase().includes(search)) || (u.name && u.name.toLowerCase().includes(search));
  });

  const filteredClients = clients.filter(c => {
    const search = searchText.toLowerCase();
    const idStr = String(c.id);
    return idStr.includes(search) || (c.email && c.email.toLowerCase().includes(search)) || (c.nome_completo && c.nome_completo.toLowerCase().includes(search)) || (c.primeiro_nome && c.primeiro_nome.toLowerCase().includes(search));
  });

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 md:p-8 h-full flex flex-col relative">
       <div className="mb-6">
         <div className="flex justify-between items-end mb-4">
           <div>
             <h2 className="text-3xl font-bold text-[#1D1D1F] tracking-tight">{activeTab === 'team' ? 'Equipe' : 'Clientes'}</h2>
             <p className="text-[11px] font-bold text-[#86868B] tracking-widest mt-1 uppercase">Acesso & Permissões</p>
           </div>
           <button 
              onClick={() => { 
                  setEditingUser(null); 
                  setFormData(activeTab === 'team' ? defaultTeamFormState : defaultClientFormState); 
                  setShowAddForm(true); 
              }}
              className="w-10 h-10 bg-black text-white rounded-full flex items-center justify-center hover:scale-105 transition-transform shadow-lg shadow-black/20 shrink-0"
           >
              <Plus className="w-5 h-5" />
           </button>
         </div>
         
         <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
             {/* Tabs */}
             <div className="flex gap-2">
                <button 
                   onClick={() => setActiveTab('team')} 
                   className={`px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-full transition-colors whitespace-nowrap ${activeTab === 'team' ? 'bg-[#1D1D1F] text-white' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}
                >
                   Gerenciar Equipe <span className="ml-1 bg-white/20 px-1.5 py-0.5 rounded-full">{users.length}</span>
                </button>
                <button 
                   onClick={() => setActiveTab('clients')} 
                   className={`px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-full transition-colors whitespace-nowrap ${activeTab === 'clients' ? 'bg-[#1D1D1F] text-white' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}
                >
                   Gerenciar Clientes <span className="ml-1 bg-black/10 px-1.5 py-0.5 rounded-full">{clients.length}</span>
                </button>
             </div>
             
             {/* Search */}
             <div className="relative w-full sm:w-auto">
               <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                 <Search className="h-4 w-4 text-gray-400" />
               </div>
               <input
                 type="text"
                 placeholder="Buscar id, nome, email..."
                 value={searchText}
                 onChange={(e) => setSearchText(e.target.value)}
                 className="block w-full sm:w-64 pl-10 pr-3 py-2 border border-gray-200 rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:border-[#007AFF] focus:ring-1 focus:ring-[#007AFF] bg-white transition-colors"
               />
             </div>
         </div>
       </div>

       <div className="bg-[#F5F5F7] rounded-[32px] flex-1 flex flex-col p-6 overflow-hidden relative">
          <div className="space-y-4 overflow-y-auto w-full">
            {activeTab === 'team' && filteredUsers.map(u => (
              <div key={u.id} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                 <div className="flex items-center gap-4 min-w-0">
                   {u.company_logo ? (
                     <img src={u.company_logo} alt={u.company_name || 'Logo'} className="w-10 h-10 object-cover rounded-xl border border-gray-100 bg-gray-50 flex-shrink-0" />
                   ) : (
                     <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-gray-400 flex-shrink-0">
                       <User className="w-5 h-5" />
                     </div>
                   )}
                   <div className="min-w-0">
                     <p className="font-bold text-sm text-[#1D1D1F] flex flex-wrap items-center gap-2">
                       <span className="truncate">{u.name}</span>
                       <button onClick={() => handleCopyId(u.id)} className="flex items-center gap-1 bg-gray-100 hover:bg-gray-200 text-gray-600 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded transition-colors" title="Copiar ID">
                         {copiedId === u.id ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                         ID: {u.id}
                       </button>
                       {u.role === 'admin' && <span className="bg-blue-100 text-blue-700 text-[9px] uppercase font-bold px-1.5 py-0.5 rounded shrink-0">Admin</span>}
                       {u.role === 'blocked' && <span className="bg-red-100 text-red-700 text-[9px] uppercase font-bold px-1.5 py-0.5 rounded shrink-0">Block</span>}
                       {!u.is_approved && u.role !== 'admin' && <span className="bg-amber-100 text-amber-700 text-[9px] uppercase font-bold px-1.5 py-0.5 rounded shrink-0">Pendente</span>}
                     </p>
                     <p className="text-xs text-[#86868B] mt-0.5 truncate">
                       {u.nickname ? `@${u.nickname} • ` : ''}{u.company_name ? `${u.company_name} • ${u.email}` : u.email}
                     </p>
                     {u.wallet && u.wallet.tokens && Array.isArray(u.wallet.tokens) && u.wallet.tokens.length > 0 && (
                       <div className="mt-1 flex flex-wrap gap-1">
                         {Object.entries(
                           u.wallet.tokens.reduce((acc: any, val: string) => {
                             acc[val.length] = (acc[val.length] || 0) + 1;
                             return acc;
                           }, {})
                         ).map(([len, count]) => (
                           <span key={len} className="bg-green-100 text-green-800 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase box-border border-b border-green-200">
                             e{len}: {String(count)}
                           </span>
                         ))}
                       </div>
                     )}
                   </div>
                 </div>
                 <div className="flex flex-wrap sm:flex-nowrap gap-2 shrink-0 border-t border-gray-100 pt-3 mt-3 w-full sm:w-auto sm:border-0 sm:pt-0 sm:mt-0">
                   {u.email !== 'admin@valentina.com' && (
                     <>
                       <button onClick={() => { 
                         setEditingUser(u); 
                         setFormData({ 
                           name: u.name, 
                           email: u.email, 
                           password: '', 
                           role: u.role, 
                           company_name: u.company_name || '', 
                           company_logo: u.company_logo || '', nickname: u.nickname || '',
                           is_approved: u.is_approved,
                           can_transfer: u.can_transfer !== false,
                           can_request: u.can_request !== false,
                           can_request_delivery: u.can_request_delivery !== false,
                           telefone: u.telefone || '',
                           cep: u.cep || '',
                           endereco: u.endereco || '',
                           numero: u.numero || '',
                           bairro: u.bairro || '',
                           cidade: u.cidade || ''
                         }); 
                         setShowAddForm(true); 
                       }} className="flex-1 sm:flex-initial text-[10px] uppercase font-bold text-[#007AFF] py-3 sm:px-3 sm:py-2 bg-blue-50 rounded-xl hover:bg-blue-100 transition-colors flex items-center justify-center">Editar</button>
                       <button onClick={() => handleToggleApproval(u)} className="flex-1 sm:flex-initial py-3 sm:px-3 sm:py-2 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors flex items-center justify-center">
                         {u.is_approved ? <><X className="w-4 h-4 text-red-500" title="Revogar Aprovação" /><span className="text-[10px] text-red-500 font-bold uppercase ml-1">Revogar</span></> : <><Check className="w-4 h-4 text-green-500" title="Aprovar Usuário" /><span className="text-[10px] text-green-500 font-bold uppercase ml-1">Aprovar</span></>}
                       </button>
                       <button onClick={() => handleToggleBlock(u, 'team')} className="flex-1 sm:flex-initial py-3 sm:px-3 sm:py-2 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors flex items-center justify-center">
                         {u.role === 'blocked' ? <Unlock className="w-4 h-4 text-green-600" /> : <Lock className="w-4 h-4 text-orange-500" />}</button>
                        
                        <button 
                          onClick={async () => { 
                            if (window.confirm("Deseja desativar o 2FA biométrico do usuário " + u.name + "?")) { 
                              try { 
                                const r = await apiFetch("/api/admin/users/" + u.id + "/reset-mfa", { method: 'POST' }); 
                                const d = await r.json(); 
                                if (d.success) { 
                                  alert(d.message); 
                                  fetchData(); 
                                } 
                              } catch(e) { 
                                alert("Erro ao realizar solicitação."); 
                              } 
                            } 
                          }} 
                          type="button" 
                          className="flex-1 sm:flex-initial py-3 sm:px-3 sm:py-2 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-xl transition-colors flex items-center justify-center cursor-pointer" 
                          title="Resetar 2FA Biométrico"
                        >
                          <Fingerprint className="w-4 h-4 text-amber-600 shadow-sm" />
                          <span className="text-[10px] text-amber-700 font-bold uppercase ml-1 block sm:hidden md:block">Reset 2FA</span>
                        </button>

                        <button 
                          onClick={async () => { 
                            if (window.confirm("Deseja realmente remover a senha atual do usuário " + u.name + "? O sistema exigirá uma nova senha segura no primeiro acesso.")) { 
                              try { 
                                const r = await apiFetch("/api/admin/users/" + u.id + "/remove-password", { method: 'POST' }); 
                                const d = await r.json(); 
                                if (d.success) { 
                                  alert(d.message); 
                                  fetchData(); 
                                } 
                              } catch(e) { 
                                alert("Erro ao remover senha."); 
                              } 
                            } 
                          }} 
                          type="button" 
                          className="flex-1 sm:flex-initial py-3 sm:px-3 sm:py-2 bg-purple-50 text-purple-700 hover:bg-purple-100 rounded-xl transition-colors flex items-center justify-center cursor-pointer" 
                          title="Exigir Nova Senha (Remover Senha Atual)"
                        >
                          <Lock className="w-4 h-4 text-purple-600 shadow-sm" />
                          <span className="text-[10px] text-purple-700 font-bold uppercase ml-1 block sm:hidden md:block">Pedir Nova Senha</span>
                        </button>
                        <button style={{ display: 'none' }}>
                       </button>
                       <button onClick={() => handleDelete(u, 'team')} className="flex-1 sm:flex-initial py-3 sm:px-3 sm:py-2 bg-red-50 rounded-xl hover:bg-red-100 transition-colors flex items-center justify-center">
                         <Trash2 className="w-4 h-4 text-red-500" />
                       </button>
                     </>
                   )}
                 </div>
              </div>
            ))}

            {activeTab === 'clients' && filteredClients.map(c => (
              <div key={c.id} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                 <div className="flex items-center gap-4 min-w-0">
                   <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-gray-400 flex-shrink-0">
                     <User className="w-5 h-5" />
                   </div>
                   <div className="min-w-0">
                     <p className="font-bold text-sm text-[#1D1D1F] flex flex-wrap items-center gap-2">
                       <span className="truncate">{c.nome_completo || c.primeiro_nome || 'Sem nome'}</span>
                       <button onClick={() => handleCopyId(c.id)} className="flex items-center gap-1 bg-gray-100 hover:bg-gray-200 text-gray-600 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded transition-colors" title="Copiar ID">
                         {copiedId === c.id ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                         ID: {c.id}
                       </button>
                       {c.role === 'blocked' && <span className="bg-red-100 text-red-700 text-[9px] uppercase font-bold px-1.5 py-0.5 rounded">Block</span>}
                     </p>
                     <p className="text-xs text-[#86868B] mt-0.5 truncate">
                       {c.email} {c.telegram ? `• Telegram: ${c.telegram}` : ''}
                     </p>
                   </div>
                 </div>
                 <div className="flex flex-wrap sm:flex-nowrap gap-2 shrink-0 border-t border-gray-100 pt-3 mt-3 w-full sm:w-auto sm:border-0 sm:pt-0 sm:mt-0">
                   <button onClick={() => { 
                     setEditingUser(c); 
                     setFormData({ 
                       email: c.email,
                       nome_completo: c.nome_completo || '',
                       primeiro_nome: c.primeiro_nome || '',
                       data_nascimento: c.data_nascimento || '',
                       telegram: c.telegram || '',
                       melhor_horario: c.melhor_horario || '',
                       interesses: c.interesses || '',
                       senha_mestre: c.senha_mestre || '',
                       convite: c.convite || '',
                       telefone: c.telefone || '',
                       cep: c.cep || '',
                       endereco: c.endereco || '',
                       numero: c.numero || '',
                       bairro: c.bairro || '',
                       cidade: c.cidade || ''
                     }); 
                     setShowAddForm(true); 
                   }} className="flex-1 sm:flex-initial text-[10px] uppercase font-bold text-[#007AFF] py-3 sm:px-3 sm:py-2 bg-blue-50 rounded-xl hover:bg-blue-100 transition-colors flex items-center justify-center">Editar</button>
                   <button onClick={() => handleToggleBlock(c, 'client')} className="flex-1 sm:flex-initial py-3 sm:px-3 sm:py-2 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors flex items-center justify-center">
                     {c.role === 'blocked' ? <Unlock className="w-4 h-4 text-green-600" /> : <Lock className="w-4 h-4 text-orange-500" />}
                   </button>
                   <button onClick={() => handleDelete(c, 'client')} className="flex-1 sm:flex-initial py-3 sm:px-3 sm:py-2 bg-red-50 rounded-xl hover:bg-red-100 transition-colors flex items-center justify-center">
                     <Trash2 className="w-4 h-4 text-red-500" />
                   </button>
                 </div>
              </div>
            ))}
          </div>
       </div>

       {showAddForm && (
         <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm sm:p-6" onClick={() => setShowAddForm(false)}>
            <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", bounce: 0, duration: 0.4 }}
              onClick={e => e.stopPropagation()}
              className="bg-white w-full max-w-md rounded-t-[32px] sm:rounded-[32px] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
            >
               <div className="flex items-center justify-between p-6 border-b border-gray-100">
                  <h3 className="text-xl font-bold tracking-tight">{editingUser ? 'Editar' : 'Novo'} {activeTab === 'team' ? 'Usuário' : 'Cliente'}</h3>
                  <button onClick={() => setShowAddForm(false)} className="w-8 h-8 flex items-center justify-center bg-gray-100 rounded-full hover:bg-gray-200">
                    <X className="w-4 h-4" />
                  </button>
               </div>
               
               <form onSubmit={handleAdd} className="p-6 space-y-4 overflow-y-auto max-h-[70vh]">
                 {editingUser && activeTab === 'team' && (
                   <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl space-y-3 mb-4">
                     <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Identidade Comercial Registrada</p>
                     
                     <div className="flex items-center gap-3">
                       {editingUser.company_logo ? (
                         <img src={editingUser.company_logo} alt="Logo" className="w-12 h-12 rounded-xl object-cover border border-slate-200 shadow-xs" />
                       ) : (
                         <div className="w-12 h-12 bg-slate-200 text-slate-500 rounded-xl flex items-center justify-center font-bold text-xs">S/L</div>
                       )}
                       <div>
                         <p className="text-xs text-gray-500 font-medium">Nickname / Apelido atual:</p>
                         <p className="text-sm font-bold text-slate-800">@{editingUser.nickname || 'Não cadastrado'}</p>
                       </div>
                     </div>

                     {(editingUser.endereco || editingUser.cidade || editingUser.cep) && (
                       <div className="border-t border-slate-200 text-slate-600 pt-2 mt-2">
                         <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Localização Comercial Registrada</p>
                         <p className="text-xs font-semibold text-slate-700 leading-relaxed">
                           {editingUser.endereco || 'Rua não informada'}, {editingUser.numero || 'S/N'}<br />
                           {editingUser.bairro || 'Bairro não informado'} • {editingUser.cidade || 'Cidade não informada'}<br />
                           CEP: {editingUser.cep || 'Sem CEP'}
                         </p>
                       </div>
                     )}
                   </div>
                 )}

                 {activeTab === 'team' ? (
                   <>
                     <div>
                       <label className="text-[11px] font-bold text-gray-500 tracking-wider uppercase mb-1 block">Nome de Usuário</label>
                       <input required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                     </div>
                     <div>
                       <label className="text-[11px] font-bold text-gray-500 tracking-wider uppercase mb-1 block">Empresa (Opcional)</label>
                       <input value={formData.company_name} onChange={e => setFormData({...formData, company_name: e.target.value})} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                     </div>
                     <div>
                       <label className="text-[11px] font-bold text-gray-500 tracking-wider uppercase mb-1 block">Foto da Empresa</label>
                       <div className="flex flex-col gap-2">
                         <input type="file" accept="image/*" onChange={handleLogoUpload} disabled={uploadingLogo} className="text-xs file:mr-2 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-[11px] file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer" />
                         {uploadingLogo && <span className="text-[10px] text-blue-600 font-bold">Enviando...</span>}
                         {formData.company_logo && <img src={formData.company_logo} alt="Logo" className="h-10 w-10 object-cover rounded-md" />}
                       </div>
                     </div>
                     <div>
                       <label className="text-[11px] font-bold text-gray-500 tracking-wider uppercase mb-1 block">Email</label>
                       <input required type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                     </div>
                     <div>
                       </div>
                      <div>
                        <label className="text-[11px] font-bold text-gray-500 tracking-wider uppercase mb-1 block">Nickname (Único)</label>
                        <input required type="text" value={formData.nickname || ''} onChange={e => setFormData({...formData, nickname: e.target.value})} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Ex: admin, vendedor1, etc" />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-gray-500 tracking-wider uppercase mb-1 block">Senha {editingUser ? '(deixe em branco para ignorar)' : ''}</label>
                       <input required={!editingUser} type="password" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                     </div>
                     <div>
                       <label className="text-[11px] font-bold text-gray-500 tracking-wider uppercase mb-1 block">Permissão</label>
                       <select value={formData.role} onChange={e => setFormData({...formData, role: e.target.value})} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                         <option value="user">Usuário Comum</option>
                         <option value="admin">Administrador</option>
                       </select>
                     </div>
                     <div className="pt-2">
                       <label className="flex items-center gap-3 cursor-pointer p-4 border border-gray-200 rounded-xl bg-gray-50">
                         <input 
                           type="checkbox" 
                           checked={formData.is_approved} 
                           onChange={e => setFormData({...formData, is_approved: e.target.checked})} 
                           className="accent-green-500 w-5 h-5"
                         />
                         <div className="flex flex-col">
                           <span className="text-sm font-bold text-[#1D1D1F]">Conta Aprovada para Login</span>
                           <span className="text-[10px] text-gray-500 uppercase tracking-widest mt-0.5">Permite que o usuário faça login na vitrine e gerencie produtos</span>
                         </div>
                       </label>
                     </div>
                     <div className="pt-2">
                       <label className="flex items-center gap-3 cursor-pointer p-4 border border-gray-200 rounded-xl bg-gray-50">
                         <input 
                           type="checkbox" 
                           checked={formData.can_transfer !== false} 
                           onChange={e => setFormData({...formData, can_transfer: e.target.checked})} 
                           className="accent-green-500 w-5 h-5"
                         />
                         <div className="flex flex-col">
                           <span className="text-sm font-bold text-[#1D1D1F]">Permitir Transferência de eTokens</span>
                           <span className="text-[10px] text-gray-500 uppercase tracking-widest mt-0.5">Libera o envio de tokens para outros parceiros</span>
                         </div>
                       </label>
                     </div>
                     <div className="pt-2">
                       <label className="flex items-center gap-3 cursor-pointer p-4 border border-gray-200 rounded-xl bg-gray-50">
                         <input 
                           type="checkbox" 
                           checked={formData.can_request !== false} 
                           onChange={e => setFormData({...formData, can_request: e.target.checked})} 
                           className="accent-green-500 w-5 h-5"
                         />
                         <div className="flex flex-col">
                           <span className="text-sm font-bold text-[#1D1D1F]">Permitir Pedido de eTokens</span>
                           <span className="text-[10px] text-gray-500 uppercase tracking-widest mt-0.5">Pode solicitar mais saldo para a moderação</span>
                         </div>
                       </label>
                     </div>
                     <div className="pt-2">
                       <label className="flex items-center gap-3 cursor-pointer p-4 border border-gray-200 rounded-xl bg-gray-50">
                         <input 
                           type="checkbox" 
                           checked={formData.can_request_delivery !== false} 
                           onChange={e => setFormData({...formData, can_request_delivery: e.target.checked})} 
                           className="accent-green-500 w-5 h-5"
                         />
                         <div className="flex flex-col">
                           <span className="text-sm font-bold text-[#1D1D1F]">Permitir Pedido de Entrega</span>
                           <span className="text-[10px] text-gray-500 uppercase tracking-widest mt-0.5">Pode pedir entregador (liberado)</span>
                         </div>
                       </label>
                     </div>
                   </>
                 ) : (
                   <>
                     <div>
                       <label className="text-[11px] font-bold text-gray-500 tracking-wider uppercase mb-1 block">Email</label>
                       <input required type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                     </div>
                     <div className="grid grid-cols-2 gap-4">
                       <div>
                         <label className="text-[11px] font-bold text-gray-500 tracking-wider uppercase mb-1 block">Nome Completo</label>
                         <input value={formData.nome_completo} onChange={e => setFormData({...formData, nome_completo: e.target.value})} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                       </div>
                       <div>
                         <label className="text-[11px] font-bold text-gray-500 tracking-wider uppercase mb-1 block">Primeiro Nome</label>
                         <input value={formData.primeiro_nome} onChange={e => setFormData({...formData, primeiro_nome: e.target.value})} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                       </div>
                       <div>
                         <label className="text-[11px] font-bold text-gray-500 tracking-wider uppercase mb-1 block">Data Nascimento</label>
                         <input type="date" value={formData.data_nascimento} onChange={e => setFormData({...formData, data_nascimento: e.target.value})} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                       </div>
                       <div>
                         <label className="text-[11px] font-bold text-gray-500 tracking-wider uppercase mb-1 block">Telegram</label>
                         <input value={formData.telegram} onChange={e => setFormData({...formData, telegram: e.target.value})} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                       </div>
                     </div>
                     <div>
                       <label className="text-[11px] font-bold text-gray-500 tracking-wider uppercase mb-1 block">Melhor Horário</label>
                       <input value={formData.melhor_horario} onChange={e => setFormData({...formData, melhor_horario: e.target.value})} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                     </div>
                     <div>
                       <label className="text-[11px] font-bold text-gray-500 tracking-wider uppercase mb-1 block">Interesses</label>
                       <textarea rows={3} value={formData.interesses} onChange={e => setFormData({...formData, interesses: e.target.value})} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                     </div>
                     <div className="grid grid-cols-2 gap-4">
                       <div>
                         <label className="text-[11px] font-bold text-gray-500 tracking-wider uppercase mb-1 block">Senha Mestre</label>
                         <input required={!editingUser} value={formData.senha_mestre} onChange={e => setFormData({...formData, senha_mestre: e.target.value})} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                       </div>
                       <div>
                         <label className="text-[11px] font-bold text-gray-500 tracking-wider uppercase mb-1 block">Convite</label>
                         <input value={formData.convite} onChange={e => setFormData({...formData, convite: e.target.value})} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                       </div>
                     </div>
                   </>
                 )}

                 <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-100">
                   <div className="col-span-2">
                      <label className="text-[11px] font-bold text-gray-500 tracking-wider uppercase mb-1 block">Telefone</label>
                      <input value={formData.telefone || ''} onChange={e => setFormData({...formData, telefone: e.target.value})} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                   </div>
                   <div>
                      <label className="text-[11px] font-bold text-gray-500 tracking-wider uppercase mb-1 block">CEP</label>
                      <input value={formData.cep || ''} onChange={e => {
                        const rawCep = e.target.value;
                        setFormData({...formData, cep: rawCep});
                        const cleanCep = rawCep.replace(/\D/g, '');
                        if (cleanCep.length === 8) {
                          fetch(`https://viacep.com.br/ws/${cleanCep}/json/`)
                            .then(res => res.json())
                            .then(data => {
                              if (!data.erro) {
                                 setFormData((prev: any) => ({...prev, cep: rawCep, cidade: data.localidade || '', bairro: data.bairro || '', endereco: data.logradouro || ''}));
                              }
                            })
                            .catch(() => {});
                        }
                      }} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                   </div>
                   <div className="col-span-2">
                      <label className="text-[11px] font-bold text-gray-500 tracking-wider uppercase mb-1 block">Endereço</label>
                      <input value={formData.endereco || ''} onChange={e => setFormData({...formData, endereco: e.target.value})} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                   </div>
                   <div>
                      <label className="text-[11px] font-bold text-gray-500 tracking-wider uppercase mb-1 block">Número</label>
                      <input value={formData.numero || ''} onChange={e => setFormData({...formData, numero: e.target.value})} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                   </div>
                   <div>
                      <label className="text-[11px] font-bold text-gray-500 tracking-wider uppercase mb-1 block">Bairro</label>
                      <input value={formData.bairro || ''} onChange={e => setFormData({...formData, bairro: e.target.value})} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                   </div>
                   <div className="col-span-2">
                      <label className="text-[11px] font-bold text-gray-500 tracking-wider uppercase mb-1 block">Cidade</label>
                      <input value={formData.cidade || ''} onChange={e => setFormData({...formData, cidade: e.target.value})} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                   </div>
                 </div>

                 <button type="submit" disabled={loading} className="w-full bg-[#007AFF] text-white font-semibold rounded-2xl py-4 mt-6 disabled:opacity-70">
                   {loading ? 'Salvando...' : `Salvar ${activeTab === 'team' ? 'Usuário' : 'Cliente'}`}
                 </button>
               </form>
            </motion.div>
         </div>
       )}
    </motion.div>
  );
}

// -- Floating Toast Notification Component --
function FloatingToast({ toast, onClose }: { toast: any; onClose: () => void; key?: any }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 6000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const getEventStyle = (eventName: string) => {
    const name = (eventName || '').toLowerCase();
    if (name === 'compra_registrada') {
      return {
        bg: 'border-l-[6px] border-l-[#34C759] bg-white/95 text-gray-900 shadow-xl shadow-green-500/5 dark:bg-[#1C1C1E]/95 dark:text-white',
        icon: <ShoppingCart className="w-5 h-5 text-[#34C759]" />,
        title: 'Nova Venda!'
      };
    }
    if (name === 'compra' || name.includes('transf') || name.includes('saque') || name.includes('credito') || name.includes('transferencia')) {
      return {
        bg: 'border-l-[6px] border-l-[#007AFF] bg-white/95 text-gray-900 shadow-xl shadow-blue-500/5 dark:bg-[#1C1C1E]/95 dark:text-white',
        icon: <Wallet className="w-5 h-5 text-[#007AFF]" />,
        title: 'Movimentação'
      };
    }
    if (name.includes('usuario') || name.includes('registro')) {
      return {
        bg: 'border-l-[6px] border-l-[#AF52DE] bg-white/95 text-gray-900 shadow-xl shadow-purple-500/5 dark:bg-[#1C1C1E]/95 dark:text-white',
        icon: <Users className="w-5 h-5 text-[#AF52DE]" />,
        title: 'Membro Novo / Equipe'
      };
    }
    if (name.includes('login') || name.includes('auth')) {
      return {
        bg: 'border-l-[6px] border-l-[#FF9500] bg-white/95 text-gray-900 shadow-xl shadow-amber-500/5 dark:bg-[#1C1C1E]/95 dark:text-white',
        icon: <Lock className="w-5 h-5 text-[#FF9500]" />,
        title: 'Sistema de Acesso'
      };
    }
    if (name.includes('erro') || name.includes('bloqueio') || name.includes('falhou')) {
      return {
        bg: 'border-l-[6px] border-l-[#FF3B30] bg-white/95 text-gray-900 shadow-xl shadow-red-500/5 dark:bg-[#1C1C1E]/95 dark:text-white',
        icon: <Activity className="w-5 h-5 text-[#FF3B30]" />,
        title: 'Alerta / Bloqueio'
      };
    }
    return {
      bg: 'border-l-[6px] border-l-[#8E8E93] bg-white/95 text-gray-900 shadow-xl shadow-gray-500/5 dark:bg-[#1C1C1E]/95 dark:text-white',
      icon: <Bell className="w-5 h-5 text-[#8E8E93]" />,
      title: 'Atividade'
    };
  };

  const style = getEventStyle(toast.eventName);

  return (
    <motion.div
      initial={{ opacity: 0, y: 50, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.9, transition: { duration: 0.2 } }}
      className={cn(
        "pointer-events-auto rounded-[1.25rem] p-4 flex gap-3.5 backdrop-blur-md border border-black/5 relative overflow-hidden transition-all duration-300 dark:border-white/5",
        style.bg
      )}
    >
      <div className="shrink-0 p-2 bg-black/5 dark:bg-white/5 opacity-90 rounded-xl flex items-center justify-center">
        {style.icon}
      </div>
      <div className="flex-1 min-w-0 pr-4 text-left">
        <h5 className="font-extrabold text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-0.5 leading-none">
          {style.title}
        </h5>
        <p className="font-sans font-bold text-gray-900 dark:text-white text-xs leading-relaxed">
          {toast.details}
        </p>
        {toast.userEmail && (
          <p className="text-[9px] text-gray-500 font-semibold truncate mt-1">
            Membro: {toast.userEmail}
          </p>
        )}
      </div>
      <button 
        onClick={onClose}
        className="absolute top-2.5 right-2 text-gray-400 hover:text-gray-900 dark:hover:text-white p-1 rounded-full transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </motion.div>
  );
}

// -- Main Router Shell --
export default function AdminApp() {
  const [user, setUser] = useState<any>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showSmartCursor, setShowSmartCursor] = useState(false);
  
  // Real-time system notifications
  const [notifications, setNotifications] = useState<any[]>([]);
  const lastNotifCountRef = React.useRef<number>(0);

  useEffect(() => {
    if (!user) return;

    let isMounted = true;

    const fetchNotifications = async () => {
      try {
        const res = await apiFetch('/api/notifications');
        const data = await res.json();
        if (!isMounted) return;
        if (data.success && Array.isArray(data.notifications)) {
          setNotifications(data.notifications);
          if (data.notifications.length > lastNotifCountRef.current) {
            // Play sound if a new notification arrived
            if (lastNotifCountRef.current > 0) {
              playSoftNotificationSound();
            }
            lastNotifCountRef.current = data.notifications.length;
          } else if (data.notifications.length < lastNotifCountRef.current) {
            lastNotifCountRef.current = data.notifications.length;
          }
        }
      } catch (err) {
        console.warn('Erro ao carregar notificações:', err);
      }
    };

    fetchNotifications();
    const interval = setInterval(fetchNotifications, 5000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [user]);

  const location = useLocation();
  const navigate = useNavigate();

  const refreshUser = async () => {
    try {
      const r = await apiFetch('/api/me');
      const data = await r.json();
      if (data.success && data.user) {
        setUser((prev: any) => ({ ...prev, ...data.user }));
      }
    } catch (e) {
      console.error("Erro ao atualizar user", e);
    }
  };

  useEffect(() => {
    if (user && user.id) {
      refreshUser();
    }
  }, [location.pathname]); // Refresh user data when navigating to different pages

  if (!user) {
    return <AdminLogin onLogin={setUser} />;
  }

  const isDark = user?.dashboard_theme === 'dark';

  return (
    <div className={cn("admin-theme min-h-screen antialiased flex font-sans transition-colors duration-500", isDark ? "bg-[#0a0a0a] text-[#f5f5f5] dark-mode" : "bg-[#faf9fe] text-[#1a1b1f] selection:bg-[#0058bc]/10")}>
      {/* SideNavBar Component */}
       {/* Mobile backdrop */}
      {isMobileMenuOpen && (<div className="md:hidden fixed inset-0 bg-black/40 z-[55]" onClick={() => setIsMobileMenuOpen(false)} />)}
      <aside className={cn(`transform ${isMobileMenuOpen ? "translate-x-0" : "-translate-x-[120%]"} transition-transform duration-300 md:translate-x-0 fixed left-4 top-4 z-[60] backdrop-blur-xl flex flex-col py-8 w-72 h-[calc(100vh-32px)] overflow-y-auto hide-scrollbar rounded-[2rem] shadow-[0_10px_40px_-10px_rgba(0,0,0,0.04),_0_2px_10px_-2px_rgba(0,0,0,0.02)]`, isDark ? "bg-[#141414]/90 border border-white/10" : "bg-white/95 md:bg-white/60 border border-white/50")}>
        <div className="px-8 mb-12">
          <h1 className="text-2xl font-extrabold text-[#0058bc] tracking-tighter">Vitrine Brasil</h1>
          <p className={cn("text-[10px] font-bold uppercase tracking-[0.2em] opacity-60", isDark ? "text-gray-400" : "text-[#414755]")}>sua vitrine para o mundo</p>
        </div>
        <nav className="flex-grow space-y-1.5 px-3">
          <button onClick={() => { setIsMobileMenuOpen(false); navigate('/'); }} className={cn("flex w-full items-center gap-4 px-5 py-3.5 rounded-2xl transition-all", location.pathname === '/' ? "bg-[#0058bc] text-white shadow-lg shadow-[#0058bc]/20" : "text-[#414755] hover:bg-white hover:shadow-sm")}>
            <LayoutDashboard className="w-5 h-5" />
            <span className={cn("text-sm", location.pathname === '/' ? "font-bold" : "font-semibold")}>Início</span>
          </button>
          
          {user.role !== 'delivery' && (
             <button onClick={() => { setIsMobileMenuOpen(false); navigate('/products'); }} className={cn("flex w-full items-center gap-4 px-5 py-3.5 rounded-2xl transition-all", location.pathname === '/products' ? "bg-[#0058bc] text-white shadow-lg shadow-[#0058bc]/20" : "text-[#414755] hover:bg-white hover:shadow-sm")}>
               <Package className="w-5 h-5" />
               <span className={cn("text-sm", location.pathname === '/products' ? "font-bold" : "font-semibold")}>Produtos</span>
             </button>
          )}
          
          <button onClick={() => { setIsMobileMenuOpen(false); navigate('/etoken'); }} className={cn("flex w-full items-center gap-4 px-5 py-3.5 rounded-2xl transition-all", location.pathname === '/etoken' ? "bg-[#0058bc] text-white shadow-lg shadow-[#0058bc]/20" : "text-[#414755] hover:bg-white hover:shadow-sm")}>
            <Wallet className="w-5 h-5" />
            <span className={cn("text-sm", location.pathname === '/etoken' ? "font-bold" : "font-semibold")}>eToken</span>
          </button>
          
          {user.role !== 'delivery' && (
             <button onClick={() => { setIsMobileMenuOpen(false); navigate('/orders'); }} className={cn("flex w-full items-center gap-4 px-5 py-3.5 rounded-2xl transition-all", location.pathname === '/orders' ? "bg-[#0058bc] text-white shadow-lg shadow-[#0058bc]/20" : "text-[#414755] hover:bg-white hover:shadow-sm")}>
               <div className="relative"><ShoppingCart className="w-5 h-5" />{pendingCount > 0 && <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5 rounded-full bg-red-600 ring-2 ring-white"></span>}</div>
               <span className={cn("text-sm", location.pathname === '/orders' ? "font-bold" : "font-semibold")}>Vendas</span>
             </button>
          )}

          <button onClick={() => { setIsMobileMenuOpen(false); navigate('/credits'); }} className={cn("flex w-full items-center gap-4 px-5 py-3.5 rounded-2xl transition-all", location.pathname === '/credits' ? "bg-[#0058bc] text-white shadow-lg shadow-[#0058bc]/20" : "text-[#414755] hover:bg-white hover:shadow-sm")}>
            <Landmark className="w-5 h-5" />
            <span className={cn("text-sm", location.pathname === '/credits' ? "font-bold" : "font-semibold")}>Logs</span>
          </button>

          {user.role !== 'delivery' && (
             <button onClick={() => { setIsMobileMenuOpen(false); navigate('/interactions'); }} className={cn("flex w-full items-center gap-4 px-5 py-3.5 rounded-2xl transition-all", location.pathname === '/interactions' ? "bg-[#0058bc] text-white shadow-lg shadow-[#0058bc]/20" : "text-[#414755] hover:bg-white hover:shadow-sm")}>
                <MessageSquare className="w-5 h-5" />
                <span className={cn("text-sm", location.pathname === '/interactions' ? "font-bold" : "font-semibold")}>Interações</span>
             </button>
          )}

          {user.role === 'admin' && (
            <>
              <button onClick={() => { setIsMobileMenuOpen(false); navigate('/settings/global'); }} className={cn("flex w-full items-center gap-4 px-5 py-3.5 rounded-2xl transition-all", location.pathname === '/settings/global' ? "bg-[#0058bc] text-white shadow-lg shadow-[#0058bc]/20" : isDark ? "text-gray-300 hover:bg-white/5" : "text-[#414755] hover:bg-white hover:shadow-sm")}>
                 <Activity className="w-5 h-5" />
                 <span className={cn("text-sm", location.pathname === '/settings/global' ? "font-bold" : "font-semibold")}>Configs Gerais</span>
              </button>
              <button onClick={() => { setIsMobileMenuOpen(false); navigate('/users'); }} className={cn("flex w-full items-center gap-4 px-5 py-3.5 rounded-2xl transition-all", location.pathname === '/users' ? "bg-[#0058bc] text-white shadow-lg shadow-[#0058bc]/20" : isDark ? "text-gray-300 hover:bg-white/5" : "text-[#414755] hover:bg-white hover:shadow-sm")}>
                 <Users className="w-5 h-5" />
                 <span className={cn("text-sm", location.pathname === '/users' ? "font-bold" : "font-semibold")}>Equipe</span>
              </button>
              <button onClick={() => { setIsMobileMenuOpen(false); navigate('/logs'); }} className={cn("flex w-full items-center gap-4 px-5 py-3.5 rounded-2xl transition-all", location.pathname === '/logs' ? "bg-[#0058bc] text-white shadow-lg shadow-[#0058bc]/20" : isDark ? "text-gray-300 hover:bg-white/5" : "text-[#414755] hover:bg-white hover:shadow-sm")}>
                 <List className="w-5 h-5" />
                 <span className={cn("text-sm", location.pathname === '/logs' ? "font-bold" : "font-semibold")}>Logs Sistema</span>
              </button>
            </>
          )}

          <button onClick={() => { setIsMobileMenuOpen(false); navigate('/settings'); }} className={cn("flex w-full items-center gap-4 px-5 py-3.5 rounded-2xl transition-all mt-4", location.pathname === '/settings' ? "bg-[#0058bc] text-white shadow-lg shadow-[#0058bc]/20" : isDark ? "text-gray-300 hover:bg-white/5" : "text-[#414755] hover:bg-white hover:shadow-sm")}>
            <Settings className="w-5 h-5" />
            <span className={cn("text-sm", location.pathname === '/settings' ? "font-bold" : "font-semibold")}>Configurações</span>
          </button>

          <button onClick={() => { setIsMobileMenuOpen(false); setShowSmartCursor(prev => !prev); }} className={cn("flex w-full items-center gap-4 px-5 py-3.5 rounded-2xl transition-all", showSmartCursor ? "bg-[#007AFF] text-white shadow-lg shadow-[#007AFF]/20" : isDark ? "text-gray-300 hover:bg-white/5" : "text-[#414755] hover:bg-white hover:shadow-sm")}>
            <Sparkles className="w-5 h-5" />
            <span className={cn("text-sm", showSmartCursor ? "font-bold" : "font-semibold")}>Cursor Inteligente</span>
          </button>

        </nav>

        <div className="px-4 mt-auto space-y-2">
          {/* User Info Mobile */}
          <div className={cn("p-4 mb-2 rounded-[1.5rem] flex items-center gap-3", isDark ? "bg-white/5 border border-white/10" : "bg-white border border-gray-100")}>
             <img src={user.company_logo || "https://i.ibb.co/605F0btn/userlmn-2a3058c5a41d95b47dcdaaede52b18e9-removebg-preview.png"} alt="User" className={cn("h-10 w-10 rounded-xl object-cover shrink-0", isDark ? "bg-black/50" : "bg-[#eeedf3]")} />
             <div className="min-w-0">
                <p className={cn("text-sm font-extrabold truncate", isDark ? "text-white" : "text-[#1a1b1f]")}>{user.name}</p>
                <p className={cn("text-[10px] font-bold uppercase tracking-widest truncate", isDark ? "text-gray-400" : "text-[#414755]")}>ID: {user.id}</p>
             </div>
          </div>
          {/* Suporte block */}
          <div className={cn("p-5 mb-4 rounded-[1.5rem] border", isDark ? "bg-[#0058bc]/10 border-[#0058bc]/20" : "bg-[#0058bc]/5 border-[#0058bc]/5")}>
            <p className="text-xs font-bold text-[#0058bc] mb-3">Precisa de ajuda?</p>
            <button className="w-full text-[11px] bg-[#0058bc] text-white py-2.5 rounded-xl font-extrabold uppercase tracking-widest shadow-md shadow-[#0058bc]/10 hover:shadow-lg transition-all">Suporte 24h</button>
          </div>
          <button className={cn("w-full flex items-center justify-start gap-4 px-5 py-3 rounded-2xl transition-all", isDark ? "text-red-400 hover:bg-red-400/10" : "text-[#ba1a1a] hover:bg-[#ba1a1a]/5")} onClick={() => { localStorage.removeItem('token'); setUser(null); navigate('/'); setIsMobileMenuOpen(false); }}>
             <LogOut className="w-5 h-5" />
             <span className="font-semibold text-sm">Sair</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-grow md:ml-[312px] min-h-screen px-4 md:px-0 md:pr-4 flex flex-col w-full overflow-x-hidden relative z-10">
        <header className={cn("sticky top-0 z-50 w-full h-20 flex justify-between items-center px-0 md:px-8 transition-colors", isDark ? "bg-[#0a0a0a]/80 backdrop-blur-md" : "bg-[#faf9fe]/80 backdrop-blur-md")}>
            <div className="flex items-center gap-4">
                <button className={cn("md:hidden p-2 rounded-xl transition-all shadow-sm", isDark ? "text-white hover:bg-white/10" : "text-[#1a1b1f] hover:bg-white")} onClick={() => setIsMobileMenuOpen(true)}>
                   <Menu className="w-6 h-6" />
                </button>
                
                <h2 className={cn("text-2xl font-extrabold tracking-tight", isDark ? "text-white" : "text-[#1a1b1f]")}>
                  {location.pathname === '/' ? 'Dashboard' 
                   : location.pathname === '/products' ? 'Produtos' 
                   : location.pathname === '/etoken' ? 'eToken' 
                   : location.pathname === '/orders' ? 'Vendas' 
                   : location.pathname === '/credits' ? 'Logs' 
                   : location.pathname === '/users' ? 'Equipe' 
                   : location.pathname === '/settings' ? 'Configurações' 
                   : location.pathname === '/settings/global' ? 'Configs Gerais'
                   : 'Minha Loja'}
                </h2>
            </div>
            <div className="flex items-center gap-4 md:gap-8 justify-end">
                <div className="relative hidden md:block">
                   <input type="text" placeholder="Pesquisar transações..." className={cn("border-none h-11 w-72 pl-12 pr-4 rounded-2xl text-sm focus:ring-2 focus:ring-[#0058bc]/20 transition-all outline-none", isDark ? "bg-[#141414] text-white shadow-none border border-white/5" : "bg-white text-[#1a1b1f] shadow-[0_10px_40px_-10px_rgba(0,0,0,0.04),_0_2px_10px_-2px_rgba(0,0,0,0.02]")} />
                   <Search className={cn("w-5 h-5 absolute left-4 top-3 opacity-40", isDark ? "text-gray-400" : "text-[#414755]")} />
                </div>
                <div className="flex items-center gap-2 md:gap-4">
                   <button 
                     onClick={() => setShowNotifications(true)} 
                     className={cn("p-2 rounded-xl transition-all shadow-sm relative", isDark ? "text-gray-300 hover:bg-white/10 hover:shadow-none" : "text-[#414755] hover:bg-white hover:shadow-sm")}
                   >
                      <Bell className="w-5 h-5 cursor-pointer" />
                      {notifications.length > 0 && (
                        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-extrabold w-4.5 h-4.5 flex items-center justify-center rounded-full shadow-sm animate-pulse border border-white dark:border-slate-900">
                          {notifications.length}
                        </span>
                      )}
                   </button>
                   <div className={cn("hidden md:block h-8 w-px mx-0 md:mx-2", isDark ? "bg-white/10" : "bg-[#c1c6d7]/30")}></div>
                   <div className={cn("hidden md:flex items-center gap-3 pl-4 pr-1 py-1 rounded-2xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.04),_0_2px_10px_-2px_rgba(0,0,0,0.02)] border", isDark ? "bg-[#141414] border-white/5" : "bg-white border-transparent")}>
                      <div className="text-right">
                         <p className={cn("text-xs font-extrabold leading-tight", isDark ? "text-white" : "text-[#1a1b1f]")}>{user.name}</p>
                         <p className={cn("text-[10px] font-medium capitalize", isDark ? "text-gray-400" : "text-[#414755]")}>{user.role}</p>
                      </div>
                      <img src={user.company_logo || "https://i.ibb.co/605F0btn/userlmn-2a3058c5a41d95b47dcdaaede52b18e9-removebg-preview.png"} alt="User" className={cn("h-9 w-9 rounded-xl object-cover", isDark ? "bg-black/50" : "bg-[#eeedf3]")} />
                   </div>
                </div>
            </div>
        </header>
        
        <div className="flex-1 pb-24 md:pb-8">
          <Routes>
            <Route path="/" element={user.role === 'delivery' ? <AdminDeliveries user={user} /> : <AdminOverview user={user} onRefreshUser={refreshUser} onLogout={() => { localStorage.removeItem('token'); setUser(null); }} />} />
            <Route path="/products" element={<AdminProducts user={user} onRefreshUser={refreshUser} />} />
            <Route path="/orders" element={<AdminOrders user={user} />} />
            <Route path="/etoken" element={<AdminWallet user={user} onRefreshUser={refreshUser} />} />
            <Route path="/credits" element={<AdminCredits user={user} onRefreshUser={refreshUser} />} />
            <Route path="/logs" element={<AdminLogs user={user} />} />
            <Route path="/interactions" element={<AdminInteractions user={user} />} />
            <Route path="/users" element={user.role === 'admin' ? <AdminUsers /> : <div className="p-8 text-center text-gray-500">Acesso negado. Apenas administradores.</div>} />
            <Route path="/settings" element={<AdminSettings user={user} onRefreshUser={refreshUser} />} />
            <Route path="/settings/global" element={user.role === 'admin' ? <GlobalSettings /> : <div className="p-8 text-center text-gray-500">Acesso negado.</div>} />
          </Routes>
        </div>
      </main>

      {showNotifications && (
         <NotificationPanel 
           onClose={() => setShowNotifications(false)} 
           onClear={() => setNotifications([])}
         />
      )}

      {showSmartCursor && (
        <SmartCursor onClose={() => setShowSmartCursor(false)} isDark={isDark} />
      )}
    </div>
  );
}
