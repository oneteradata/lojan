import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { LayoutDashboard, Bell, ShoppingBag, EyeOff, ChevronRight, RefreshCw, LogOut, TrendingUp, Package, ShoppingCart, Heart, Activity, Plus, X, Trash2, Home, Users, User, Lock, Unlock, Search, Copy, Check, Pickaxe, Landmark, List, FileText } from 'lucide-react';
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { AdminCredits } from "./AdminCredits";
import { AdminLogs } from "./AdminLogs";
import { AdminInteractions } from "./AdminInteractions";
import { AdminDeliveries } from "./AdminDeliveries";
import { AdminWallet } from "./AdminWallet";
import { GlobalSettings } from "./GlobalSettings";
import { Wallet, MessageSquare, Menu, Settings } from "lucide-react";
import { AdminSettings } from "./AdminSettings";

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
  const [companyName, setCompanyName] = useState('');
  const [companyLogo, setCompanyLogo] = useState('');
  const [requestedRole, setRequestedRole] = useState('user');
  
  const [telefone, setTelefone] = useState('');
  const [cep, setCep] = useState('');
  const [endereco, setEndereco] = useState('');
  const [numero, setNumero] = useState('');
  const [bairro, setBairro] = useState('');
  const [cidade, setCidade] = useState('');

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
      if (file.size > 2 * 1024 * 1024) throw new Error("A imagem deve ter no máximo 2MB");
      
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (uploadingLogo) return;
    setLoading(true);
    try {
      const endpoint = isRegistering ? '/api/register' : '/api/login';
      const body = isRegistering 
        ? { name, email, password, company_name: companyName, company_logo: companyLogo, requested_role: requestedRole, telefone, endereco, bairro, cidade, numero, cep } 
        : { email, password };
      
      const res = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
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
            <label className="block text-[11px] font-bold text-[#86868B] mb-2 px-2 tracking-wide">{isRegistering ? 'E-MAIL' : 'ID OU E-MAIL'}</label>
            <input 
              type="text" 
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder={isRegistering ? "email@exemplo.com" : "Seu ID ou E-mail"}
              className="w-full bg-[#F5F5F7] border border-transparent focus:border-[#007AFF]/30 focus:bg-white rounded-2xl px-4 py-3.5 text-sm outline-none transition-all"
              required
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-[#86868B] mb-2 px-2 tracking-wide">SENHA</label>
            <div className="relative">
              <input 
                type="password" 
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[#F5F5F7] border border-transparent focus:border-[#007AFF]/30 focus:bg-white rounded-2xl px-4 py-3.5 text-sm outline-none transition-all"
                required
              />
              <EyeOff className="w-5 h-5 text-[#86868B] absolute right-4 top-1/2 -translate-y-1/2 cursor-pointer" />
            </div>
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
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-[#007AFF] hover:bg-[#0066CC] active:scale-[0.98] transition-all text-white font-semibold rounded-2xl py-3.5 mt-2 flex items-center justify-center shadow-sm disabled:opacity-70"
          >
            {loading ? 'Processando...' : (isRegistering ? 'Realizar Cadastro' : 'Continuar')} <ChevronRight className="w-4 h-4 ml-1" />
          </button>

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
      </motion.div>
    </div>
  );
}

import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

// -- Overview Component --
function AdminOverview({ user, onRefreshUser }: { user: any, onLogout?: () => void, onRefreshUser?: () => void }) {
  const [stats, setStats] = useState({ products: 0, orders: 0, stock: 0, likes: 0, monthlySales: [] });
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    setLoading(true);
    try {
      if (onRefreshUser) onRefreshUser();
      const [res, ordersRes] = await Promise.all([apiFetch('/api/stats'), apiFetch('/api/orders')]);
      const data = await res.json();
      if (data.success) setStats(data.stats);
      const ordersData = await ordersRes.json();
      if (ordersData.success) setRecentOrders(ordersData.sales.slice(0, 5));
    } catch (e) {}
    setLoading(false);
  };

  useEffect(() => { fetchStats(); }, []);

  const isAdmin = user?.role === 'admin';

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 md:p-8 space-y-10">
      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-7 rounded-[2rem] shadow-[0_10px_40px_-10px_rgba(0,0,0,0.04),_0_2px_10px_-2px_rgba(0,0,0,0.02)] hover:shadow-2xl hover:scale-[1.02] transition-all duration-300 group">
            <div className="flex justify-between items-start mb-6">
                <div className="p-3 bg-[#0058bc]/10 text-[#0058bc] rounded-2xl group-hover:bg-[#0058bc] group-hover:text-white transition-colors">
                    <Package className="w-6 h-6" />
                </div>
            </div>
            <p className="text-[#414755] text-[10px] font-extrabold uppercase tracking-widest opacity-60">Produtos Ativos</p>
            <h3 className="text-3xl font-extrabold mt-2 tracking-tight">{stats.products}</h3>
        </div>
        <div className="bg-white p-7 rounded-[2rem] shadow-[0_10px_40px_-10px_rgba(0,0,0,0.04),_0_2px_10px_-2px_rgba(0,0,0,0.02)] hover:shadow-2xl hover:scale-[1.02] transition-all duration-300 group">
            <div className="flex justify-between items-start mb-6">
                <div className="p-3 bg-[#0058bc]/10 text-[#0058bc] rounded-2xl group-hover:bg-[#0058bc] group-hover:text-white transition-colors">
                    <ShoppingCart className="w-6 h-6" />
                </div>
            </div>
            <p className="text-[#414755] text-[10px] font-extrabold uppercase tracking-widest opacity-60">Total de Pedidos</p>
            <h3 className="text-3xl font-extrabold mt-2 tracking-tight">{stats.orders}</h3>
        </div>
        <div className="bg-white p-7 rounded-[2rem] shadow-[0_10px_40px_-10px_rgba(0,0,0,0.04),_0_2px_10px_-2px_rgba(0,0,0,0.02)] hover:shadow-2xl hover:scale-[1.02] transition-all duration-300 group">
            <div className="flex justify-between items-start mb-6">
                <div className="p-3 bg-[#0058bc]/10 text-[#0058bc] rounded-2xl group-hover:bg-[#0058bc] group-hover:text-white transition-colors">
                    <ShoppingBag className="w-6 h-6" />
                </div>
            </div>
            <p className="text-[#414755] text-[10px] font-extrabold uppercase tracking-widest opacity-60">Inventário</p>
            <h3 className="text-3xl font-extrabold mt-2 tracking-tight">{stats.stock}</h3>
        </div>
        <div className="bg-white p-7 rounded-[2rem] shadow-[0_10px_40px_-10px_rgba(0,0,0,0.04),_0_2px_10px_-2px_rgba(0,0,0,0.02)] hover:shadow-2xl hover:scale-[1.02] transition-all duration-300 group">
            <div className="flex justify-between items-start mb-6">
                <div className="p-3 bg-[#0058bc]/10 text-[#0058bc] rounded-2xl group-hover:bg-[#0058bc] group-hover:text-white transition-colors">
                    <Heart className="w-6 h-6" />
                </div>
            </div>
            <p className="text-[#414755] text-[10px] font-extrabold uppercase tracking-widest opacity-60">Interações</p>
            <h3 className="text-3xl font-extrabold mt-2 tracking-tight">{stats.likes}</h3>
        </div>
      </div>

      {/* Main Chart Area */}
      <div className="bg-white p-8 md:p-10 rounded-[2.5rem] shadow-[0_10px_40px_-10px_rgba(0,0,0,0.04),_0_2px_10px_-2px_rgba(0,0,0,0.02)]">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
            <div>
                <h4 className="text-2xl font-extrabold tracking-tight">Vendas Mensais</h4>
                <p className="text-sm text-[#414755] font-medium mt-1">Performance financeira consolidada dos últimos meses.</p>
            </div>
            <div className="flex gap-3">
                <button onClick={fetchStats} className="px-6 py-3 text-xs font-extrabold bg-[#e9e7ed] text-[#1a1b1f] rounded-2xl hover:bg-[#e3e2e7] transition-all flex items-center gap-2">
                  ATUALIZAR <RefreshCw className={cn("w-3 h-3 text-[#414755]", loading && "animate-spin")} />
                </button>
            </div>
        </div>
        <div className="relative w-full h-64 md:aspect-[21/9] md:h-auto rounded-[2rem] overflow-hidden bg-[#faf9fe]">
           {stats.monthlySales && stats.monthlySales.length > 0 ? (
             <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.monthlySales}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{fill: '#86868B', fontSize: 12}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: '#86868B', fontSize: 12}} />
                  <RechartsTooltip cursor={{fill: '#f5f5f7'}} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)'}} />
                  <Bar dataKey="count" fill="#0058bc" radius={[4, 4, 0, 0]} barSize={40} />
                </BarChart>
             </ResponsiveContainer>
           ) : (
             <div className="flex w-full h-full justify-center items-center text-gray-400 text-sm">Nenhum dado de vendas disponível</div>
           )}
        </div>
      </div>
      
      {/* Active eTokens / Security Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        <div className="lg:col-span-2 bg-white p-8 md:p-10 rounded-[2.5rem] shadow-[0_10px_40px_-10px_rgba(0,0,0,0.04),_0_2px_10px_-2px_rgba(0,0,0,0.02)]">
           <div className="flex justify-between items-center mb-8">
             <h4 className="text-xl font-extrabold tracking-tight">Pedidos Recentes</h4>
             <a className="text-[#0058bc] text-sm font-bold hover:opacity-70 transition-opacity" href="#/orders">Ver todos</a>
           </div>
           <div className="overflow-x-auto">
             <table className="w-full text-left">
               <thead>
                 <tr className="text-[10px] uppercase text-[#414755] font-extrabold tracking-widest opacity-60 border-b border-[#c1c6d7]/10">
                   <th className="pb-5">ID Pedido</th>
                   <th className="pb-5">Cliente</th>
                   <th className="pb-5">Data</th>
                   <th className="pb-5">Valor</th>
                   <th className="pb-5">Status</th>
                 </tr>
               </thead>
               <tbody className="text-sm">{recentOrders.length > 0 ? recentOrders.map(o => (<tr key={o.id} className="group hover:bg-[#faf9fe]/50 transition-colors"><td className="py-5 font-mono text-xs font-bold text-[#414755]">#{o.id}</td><td className="py-5 font-bold">{o.customer_name || 'Desconhecido'}</td><td className="py-5 font-medium text-[#414755]">{new Date(o.created_at).toLocaleDateString('pt-BR')}</td><td className="py-5 font-extrabold">R$ {parseFloat(o.total_price).toFixed(2).replace('.', ',')}</td><td className="py-5"><span className={cn("px-3 py-1.5 rounded-xl text-[10px] font-extrabold uppercase", o.status === 'Entregue' ? 'bg-[#e2ffff] text-[#006b6b]' : o.status === 'Concluído' ? 'bg-[#ffdbcc] text-[#7c2e00]' : o.status === 'Pendente' ? 'bg-[#ffdad6] text-[#93000a]' : 'bg-[#e2dfff] text-[#3631b4]')}>{o.status}</span></td></tr>)) : (<tr><td colSpan={5} className="py-5 text-center text-gray-500">Nenhum pedido recente.</td></tr>)}</tbody>
             </table>
           </div>
        </div>
        
        {/* Active eTokens / Security */}
        <div className="bg-white p-8 md:p-10 rounded-[2.5rem] shadow-[0_10px_40px_-10px_rgba(0,0,0,0.04),_0_2px_10px_-2px_rgba(0,0,0,0.02)] flex flex-col">
          <h4 className="text-xl font-extrabold mb-10 tracking-tight">Segurança eTokens</h4>
          <div className="space-y-6 flex-grow">
             <div className="p-6 bg-[#faf9fe] rounded-3xl border border-white/50">
                <div className="flex items-center gap-3 mb-4">
                   <div className="p-2 bg-[#0058bc]/10 text-[#0058bc] rounded-xl">
                      <Lock className="w-4 h-4" />
                   </div>
                   <span className="text-[11px] font-extrabold uppercase tracking-widest opacity-60">Acesso Atual</span>
                </div>
                <div className="flex justify-between items-end">
                   <div>
                      <p className="text-2xl font-mono font-extrabold tracking-[0.2em] text-[#0058bc]">ATIVA</p>
                      <p className="text-[10px] text-[#414755] font-medium mt-1">Status da conta</p>
                   </div>
                   <Wallet className="w-5 h-5 text-[#0058bc] opacity-50" />
                </div>
             </div>
          </div>
          <button className="w-full mt-10 py-4 bg-[#1a1b1f] text-white rounded-2xl font-extrabold text-[11px] uppercase tracking-widest hover:opacity-90 shadow-xl transition-all">Token Validação</button>
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

  useEffect(() => { fetchProducts(); }, []);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 md:p-8 h-full flex flex-col">
       <div className="flex justify-between items-center mb-6">
         <div>
            <h2 className="text-3xl font-bold text-[#1D1D1F] tracking-tight">Produtos</h2>
            <p className="text-[11px] font-bold text-[#86868B] tracking-widest mt-1 uppercase">Edição Rápida</p>
         </div>
         <button 
           onClick={() => { setModalItem(null); setIsModalOpen(true); }}
           className="w-10 h-10 bg-[#007AFF] rounded-full flex items-center justify-center text-white shadow-md hover:bg-[#0066CC] transition-colors"
         >
            <Plus className="w-5 h-5" />
         </button>
       </div>

       <div className="bg-white rounded-[32px] shadow-sm border border-gray-100 flex-1 p-6 overflow-y-auto">
          {products.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-60">
              <div className="w-16 h-16 bg-[#F5F5F7] rounded-full flex items-center justify-center mb-4">
                <Package className="w-8 h-8 text-[#86868B]" />
              </div>
              <h3 className="text-lg font-bold text-[#1D1D1F] mb-1">Sem produtos</h3>
              <p className="text-sm text-[#86868B]">Adicione um novo produto ao catálogo.</p>
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

        // 1. Pedir URL assinada
        const presignedRes = await apiFetch('/api/presigned-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: file.name, mimeType: file.type })
        });
        const presignedData = await presignedRes.json();
        if (!presignedData.success) throw new Error('Falha ao obter link de upload');

        // 2. Upload direto para o MinIO (via PUT)
        // Usamos fetch nativo para NÃO enviar o token do nosso app para o MinIO
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
                 <label className="text-[11px] font-bold text-[#1D1D1F] tracking-wide">GALERIA DE MÍDIA</label>
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
                value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}
                className="w-full bg-white border border-gray-200 focus:border-[#007AFF] rounded-2xl px-4 py-3.5 text-sm outline-none transition-all shadow-sm"
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
            <div className="grid grid-cols-3 gap-3">
               <div>
                  <label className="text-[10px] font-bold text-[#86868B] tracking-wide mb-2 block">PREÇO</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[#86868B]">BRL</span>
                    <input 
                      type="number" placeholder="0" 
                      value={formData.price} onChange={e => setFormData({...formData, price: e.target.value})}
                      className="w-full bg-white border border-gray-200 focus:border-[#007AFF] rounded-2xl pl-10 pr-3 py-3.5 text-sm outline-none transition-all shadow-sm"
                    />
                  </div>
               </div>
               <div>
                  <label className="text-[10px] font-bold text-[#86868B] tracking-wide mb-2 block">TOKENS (MOEDA)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2">🪙</span>
                    <input 
                      type="number" placeholder="0" 
                      value={formData.tokens} onChange={e => setFormData({...formData, tokens: e.target.value})}
                      className="w-full bg-white border border-gray-200 focus:border-[#007AFF] rounded-2xl pl-8 pr-3 py-3.5 text-sm outline-none transition-all shadow-sm"
                    />
                  </div>
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
         </div>

         <div className="px-6 py-5 border-t border-gray-100 bg-white sm:rounded-b-[32px]">
            {showConfirmation ? (
              <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex flex-col gap-3">
                 <div>
                   <h4 className="font-bold text-[#1D1D1F] text-sm">Confirmar Cadastro</h4>
                   <p className="text-xs text-blue-800 mt-1">Ao {item ? 'editar' : 'cadastrar'} este produto, os tokens correspondentes ao plano de {formData.duration_days} dias serão verificados no seu saldo (você tem {user?.wallet?.tokens?.length || 0} disponíveis). Deseja autorizar a transação?</p>
                 </div>
                 <div className="flex gap-2">
                   <button onClick={() => setShowConfirmation(false)} className="flex-1 bg-white text-blue-600 font-bold text-xs py-3 rounded-xl border border-blue-200 hover:bg-blue-100 transition-colors">Cancelar</button>
                   <button onClick={handleSubmit} disabled={loading || uploading} className="flex-1 bg-[#007AFF] text-white font-bold text-xs py-3 rounded-xl shadow-sm hover:bg-[#0066CC] transition-colors disabled:opacity-70">
                     {loading ? 'Processando...' : 'Autorizar & Concluir'}
                   </button>
                 </div>
              </div>
            ) : (
              <button 
                onClick={() => setShowConfirmation(true)} disabled={loading || uploading}
                className="w-full bg-[#007AFF] hover:bg-[#0066CC] active:scale-[0.99] transition-all text-white font-semibold rounded-2xl py-4 flex items-center justify-center shadow-lg shadow-blue-500/20 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {loading ? 'Processando...' : <><RefreshCw className="w-4 h-4 mr-2" /> Salvar Produto</>}
              </button>
            )}
         </div>
       </motion.div>
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
  const [copiedId, setCopiedId] = useState<number | null>(null);
  
  const defaultTeamFormState = { name: '', email: '', password: '', role: 'user', company_name: '', company_logo: '', is_approved: false, can_transfer: true, can_request: true, can_request_delivery: true, telefone: '', cep: '', endereco: '', numero: '', bairro: '', cidade: '' };
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
      if (file.size > 2 * 1024 * 1024) throw new Error("A imagem deve ter no máximo 2MB");
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
                       {u.company_name ? `${u.company_name} • ${u.email}` : u.email}
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
                           company_logo: u.company_logo || '',
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
                         {u.role === 'blocked' ? <Unlock className="w-4 h-4 text-green-600" /> : <Lock className="w-4 h-4 text-orange-500" />}
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

// -- Main Router Shell --
export default function AdminApp() {
  const [user, setUser] = useState<any>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
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
                   <button className={cn("p-2 rounded-xl transition-all shadow-sm", isDark ? "text-gray-300 hover:bg-white/10 hover:shadow-none" : "text-[#414755] hover:bg-white hover:shadow-sm")}>
                      <Bell className="w-5 h-5" />
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

      
    </div>
  );
}
