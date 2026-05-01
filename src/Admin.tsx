import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ShoppingBag, EyeOff, ChevronRight, RefreshCw, LogOut, TrendingUp, Package, ShoppingCart, Heart, Activity, Plus, X, Trash2, Home } from 'lucide-react';
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// -- Login Component --
function AdminLogin({ onLogin }: { onLogin: (user: any) => void }) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const endpoint = isRegistering ? '/api/register' : '/api/login';
      const body = isRegistering ? { name, email, password, role: 'admin' } : { email, password };
      
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.success) {
        if (isRegistering) {
          // Quando cadastra pelo painel admin, ja entra
          onLogin({ ...data.user, role: 'admin' });
        } else if (data.user.role === 'admin' || data.user.email === 'admin@valentina.com') {
          onLogin(data.user);
        } else {
          setError('Acesso negado. Apenas administradores.');
        }
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
        <div className="w-12 h-12 bg-white rounded-2xl shadow-sm flex items-center justify-center mb-4">
          <ShoppingBag className="w-6 h-6 text-[#007AFF]" />
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">Voryx Admin</h1>
        <p className="text-[#86868B] mt-1 text-sm font-medium">Painel de Gestão Comercial</p>
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white rounded-[32px] shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-8 box-border"
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {!isRegistering && (
            <div>
              <label className="block text-[11px] font-bold text-[#86868B] mb-2 px-2 tracking-wide">SESSÃO (OPCIONAL)</label>
              <input 
                type="text" 
                placeholder="ex: marketplace"
                className="w-full bg-[#F5F5F7] border border-transparent focus:border-[#007AFF]/30 focus:bg-white rounded-2xl px-4 py-3.5 text-sm outline-none transition-all"
              />
            </div>
          )}
          {isRegistering && (
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
          )}
          <div>
            <label className="block text-[11px] font-bold text-[#86868B] mb-2 px-2 tracking-wide">E-MAIL</label>
            <input 
              type="email" 
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="email@exemplo.com"
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
            {error && <p className="text-[#FF3B30] text-xs mt-2 px-2">{error}</p>}
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-[#007AFF] hover:bg-[#0066CC] active:scale-[0.98] transition-all text-white font-semibold rounded-2xl py-3.5 mt-2 flex items-center justify-center shadow-sm disabled:opacity-70"
          >
            {loading ? 'Processando...' : isRegistering ? 'Cadastrar' : 'Continuar'} <ChevronRight className="w-4 h-4 ml-1" />
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
              {isRegistering ? 'Já tem uma conta? Entrar' : 'Não tem uma conta? Cadastre-se'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// -- Overview Component --
function AdminOverview() {
  const [stats, setStats] = useState({ products: 0, orders: 0, stock: 0, likes: 0 });
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/stats');
      const data = await res.json();
      if (data.success) setStats(data.stats);
    } catch (e) {}
    setLoading(false);
  };

  useEffect(() => { fetchStats(); }, []);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 md:p-8 space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold text-[#1D1D1F] tracking-tight">Resumo</h2>
          <p className="text-[11px] font-bold text-[#86868B] tracking-widest mt-1 uppercase">Visão Geral</p>
        </div>
        <div className="flex gap-3">
          <button onClick={fetchStats} className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm hover:bg-gray-50 transition-colors text-[#1D1D1F]">
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          </button>
          <button className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm hover:bg-gray-50 transition-colors text-[#FF3B30]">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="bg-white rounded-[32px] p-6 shadow-sm border border-gray-100">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-xl font-bold text-[#1D1D1F]">Estatísticas</h3>
            <p className="text-[#86868B] text-sm">Sua Loja</p>
          </div>
          <div className="w-10 h-10 bg-[#F5F5F7] rounded-xl flex items-center justify-center text-[#007AFF]">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="border border-gray-100 rounded-3xl p-5 flex flex-col justify-center">
            <span className="text-[10px] font-bold text-[#86868B] tracking-widest uppercase mb-2">Produtos</span>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold text-[#1D1D1F]">{stats.products}</span>
              <span className="text-xs font-bold text-[#007AFF] uppercase">Itens</span>
            </div>
          </div>
          <div className="border border-gray-100 rounded-3xl p-5 flex flex-col justify-center">
            <span className="text-[10px] font-bold text-[#86868B] tracking-widest uppercase mb-2">Vendas</span>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold text-[#1D1D1F]">{stats.orders}</span>
              <span className="text-xs font-bold text-[#34C759] uppercase">Pedidos</span>
            </div>
          </div>
          <div className="border border-gray-100 rounded-3xl p-5 flex flex-col justify-center">
            <span className="text-[10px] font-bold text-[#86868B] tracking-widest uppercase mb-2">Estoque</span>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold text-[#1D1D1F]">{stats.stock}</span>
              <span className="text-xs font-bold text-[#007AFF] uppercase">Unid</span>
            </div>
          </div>
          <div className="border border-gray-100 rounded-3xl p-5 flex flex-col justify-center">
            <span className="text-[10px] font-bold text-[#86868B] tracking-widest uppercase mb-2">Social</span>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold text-[#1D1D1F]">{stats.likes}</span>
              <span className="text-xs font-bold text-[#FF3B30] uppercase">Likes</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-[32px] p-6 shadow-sm border border-gray-100 flex items-center gap-4 cursor-pointer hover:bg-gray-50 transition-colors">
        <div className="w-10 h-10 bg-[#FFF5E5] rounded-xl flex items-center justify-center text-[#FF9500]">
          <Activity className="w-5 h-5" />
        </div>
        <h3 className="text-lg font-bold text-[#1D1D1F]">Monitoramento</h3>
      </div>
    </motion.div>
  );
}

// -- Products Component --
function AdminProducts() {
  const [products, setProducts] = useState<any[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const fetchProducts = async () => {
    try {
       const res = await fetch('/api/products');
       const data = await res.json();
       setProducts(data);
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
           onClick={() => setIsAddModalOpen(true)}
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
               {products.map(p => (
                 <div key={p.id} className="border border-gray-100 rounded-2xl overflow-hidden hover:shadow-md transition-all cursor-pointer">
                    <img src={p.image || (p.media && p.media.length > 0 ? p.media[0].url : '')} className="w-full aspect-square object-cover bg-gray-100" />
                    <div className="p-4">
                       <h4 className="font-semibold text-sm truncate">{p.name}</h4>
                       <p className="text-xs text-[#007AFF] font-medium mt-1">R$ {parseFloat(p.price).toLocaleString('pt-BR')}</p>
                    </div>
                 </div>
               ))}
            </div>
          )}
       </div>

       <AnimatePresence>
         {isAddModalOpen && (
           <AddProductModal onClose={() => { setIsAddModalOpen(false); fetchProducts(); }} />
         )}
       </AnimatePresence>
    </motion.div>
  );
}

function AddProductModal({ onClose }: { onClose: () => void }) {
  const [formData, setFormData] = useState({
    name: '', category: 'Geral', price: '', tokens: '', stock: '', details: ''
  });
  const [media, setMedia] = useState<{type: string, url: string}[]>([]);
  const [variations, setVariations] = useState<{type: string, options: string[]}[]>([{ type: 'cor', options: [] }]);

  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, media, variations })
      });
      onClose();
    } catch(e) {}
    setLoading(false);
  };

  const handleMediaAdd = (type: string) => {
    const url = prompt(`URL do ${type}:`);
    if (url) setMedia([...media, { type, url }]);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 md:p-4">
       <motion.div 
         initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
         className="w-full sm:max-w-xl h-[90vh] sm:h-[85vh] bg-white rounded-t-[32px] sm:rounded-[32px] flex flex-col shadow-2xl relative"
       >
         <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center bg-white rounded-t-[32px] z-10 sticky top-0">
            <div>
              <h2 className="text-2xl font-bold text-[#1D1D1F] tracking-tight leading-none">Novo Produto</h2>
              <p className="text-[10px] font-bold text-[#86868B] tracking-widest mt-1 uppercase">Adição ao inventário</p>
            </div>
            <button onClick={onClose} className="w-8 h-8 bg-[#F5F5F7] rounded-full flex items-center justify-center text-[#1D1D1F] hover:bg-gray-200 transition-colors">
              <X className="w-4 h-4" />
            </button>
         </div>

         <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8 bg-[#FAFAFA]">
            {/* Galeria de Mídia */}
            <div>
               <div className="flex justify-between items-end mb-3">
                 <label className="text-[11px] font-bold text-[#1D1D1F] tracking-wide">GALERIA DE MÍDIA</label>
                 <span className="text-[10px] font-bold text-[#86868B] tracking-widest">{media.length}/10 ARQUIVOS</span>
               </div>
               <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
                  {media.map((m, i) => (
                    <div key={i} className="relative w-24 h-24 shrink-0 rounded-2xl overflow-hidden bg-white shadow-sm border border-gray-100 group">
                      {m.type === 'video' ? (
                        <video src={m.url} className="w-full h-full object-cover" muted loop autoPlay playsInline />
                      ) : (
                        <img src={m.url} className="w-full h-full object-cover" />
                      )}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                         <Trash2 className="w-5 h-5 text-white cursor-pointer" onClick={() => setMedia(media.filter((_, idx) => idx !== i))} />
                      </div>
                      <span className="absolute bottom-1.5 left-1.5 bg-black/60 text-white text-[8px] font-bold px-1.5 py-0.5 rounded uppercase">{m.type}</span>
                    </div>
                  ))}
                  <div className="w-24 h-24 shrink-0 rounded-2xl border-2 border-dashed border-[#007AFF]/30 flex flex-col items-center justify-center gap-1 cursor-pointer hover:bg-[#007AFF]/5 transition-colors"
                       onClick={() => handleMediaAdd(media.length === 0 ? 'video' : 'image')}>
                    <Plus className="w-6 h-6 text-[#007AFF]" />
                  </div>
               </div>
            </div>

            {/* Identificação */}
            <div>
              <label className="text-[11px] font-bold text-[#86868B] tracking-wide mb-2 block">IDENTIFICAÇÃO</label>
              <input 
                type="text" placeholder="Nome do produto" 
                value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}
                className="w-full bg-white border border-gray-200 focus:border-[#007AFF] rounded-2xl px-4 py-3.5 text-sm outline-none transition-all shadow-sm"
              />
            </div>

            {/* Categoria */}
            <div>
              <label className="text-[11px] font-bold text-[#86868B] tracking-wide mb-2 block">CATEGORIA PRINCIPAL</label>
              <select 
                value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})}
                className="w-full bg-white border border-gray-200 focus:border-[#007AFF] rounded-2xl px-4 py-3.5 text-sm outline-none transition-all shadow-sm appearance-none"
              >
                <option>Geral</option>
                <option>Roupas</option>
                <option>Acessórios</option>
              </select>
            </div>

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
                  <label className="text-[10px] font-bold text-[#86868B] tracking-wide mb-2 block">TOKENS</label>
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
              <label className="text-[11px] font-bold text-[#86868B] tracking-wide mb-2 block">DETALHES ADICIONAIS</label>
              <textarea 
                placeholder="detalhes" rows={4}
                value={formData.details} onChange={e => setFormData({...formData, details: e.target.value})}
                className="w-full bg-white border border-gray-200 focus:border-[#007AFF] rounded-2xl px-4 py-3.5 text-sm outline-none transition-all shadow-sm resize-none"
              />
            </div>

            {/* Variações */}
            <div>
               <div className="flex justify-between items-center mb-3">
                 <label className="text-[11px] font-bold text-[#1D1D1F] tracking-wide">VARIAÇÕES DE SKU</label>
                 <button className="w-6 h-6 bg-[#F5F5F7] rounded-full flex items-center justify-center text-[#007AFF]"><Plus className="w-3 h-3" /></button>
               </div>
               <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                  <label className="text-[9px] font-bold text-[#86868B] tracking-wide mb-1.5 block">TIPO DE VARIAÇÃO</label>
                  <div className="flex gap-2">
                    <input type="text" value="cor" readOnly className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm font-medium" />
                    <button className="w-10 h-10 bg-[#FFF0F0] rounded-xl flex items-center justify-center text-[#FF3B30]"><Trash2 className="w-4 h-4" /></button>
                  </div>
                  <label className="text-[9px] font-bold text-[#86868B] tracking-wide mt-4 mb-2 block">OPÇÕES</label>
                  <div className="flex gap-2 flex-wrap">
                     <span className="bg-white border border-gray-200 rounded-full px-3 py-1.5 text-xs font-semibold flex items-center gap-1 shadow-sm">preto <X className="w-3 h-3 text-gray-400" /></span>
                     <span className="bg-white border border-gray-200 rounded-full px-3 py-1.5 text-xs font-semibold flex items-center gap-1 shadow-sm">branco <X className="w-3 h-3 text-gray-400" /></span>
                     <span className="border border-dashed border-gray-300 text-gray-400 rounded-full px-3 py-1.5 text-xs font-medium">+ Opção</span>
                  </div>
               </div>
            </div>
         </div>

         <div className="px-6 py-5 border-t border-gray-100 bg-white sm:rounded-b-[32px]">
            <button 
              onClick={handleSubmit} disabled={loading}
              className="w-full bg-[#007AFF] hover:bg-[#0066CC] active:scale-[0.99] transition-all text-white font-semibold rounded-2xl py-4 flex items-center justify-center shadow-lg shadow-blue-500/20"
            >
              {loading ? 'Publicando...' : <><RefreshCw className="w-4 h-4 mr-2" /> Publicar no Catálogo</>}
            </button>
         </div>
       </motion.div>
    </div>
  );
}

// -- Orders Component --
function AdminOrders() {
  const [orders, setOrders] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/orders').then(r => r.json()).then(d => setOrders(d)).catch(e => {});
  }, []);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 md:p-8 h-full flex flex-col">
       <div className="mb-6">
          <h2 className="text-3xl font-bold text-[#1D1D1F] tracking-tight">Vendas</h2>
          <p className="text-[11px] font-bold text-[#86868B] tracking-widest mt-1 uppercase">Pedidos Recentes</p>
       </div>

       <div className="bg-[#F5F5F7] rounded-[32px] flex-1 flex flex-col p-6 overflow-hidden relative">
          {orders.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-6 shadow-sm border border-gray-100">
                <ShoppingCart className="w-8 h-8 text-[#86868B]" />
              </div>
              <h3 className="text-xl font-bold text-[#1D1D1F] mb-2">Sem pedidos</h3>
              <p className="text-sm text-[#86868B]">Os novos pedidos aparecerão aqui automaticamente.</p>
            </div>
          ) : (
            <div className="space-y-4 overflow-y-auto">
               {orders.map(o => (
                 <div key={o.id} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex justify-between items-center">
                    <div>
                      <p className="font-bold text-sm">Pedido #{o.id}</p>
                      <p className="text-xs text-gray-500">{o.customer_name || 'Desconhecido'} • {new Date(o.created_at).toLocaleDateString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-[#007AFF]">{o.total_price}</p>
                      <span className="text-[10px] bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full font-bold uppercase">{o.status}</span>
                    </div>
                 </div>
               ))}
            </div>
          )}
       </div>
    </motion.div>
  );
}


// -- Main Router Shell --
export default function AdminApp() {
  const [user, setUser] = useState<any>(null);
  const location = useLocation();
  const navigate = useNavigate();

  if (!user) {
    return <AdminLogin onLogin={setUser} />;
  }

  return (
    <div className="flex flex-col h-screen bg-white font-sans text-[#1D1D1F]">
      <div className="flex-1 overflow-x-hidden overflow-y-auto pb-20">
        <Routes>
          <Route path="/" element={<AdminOverview />} />
          <Route path="/products" element={<AdminProducts />} />
          <Route path="/orders" element={<AdminOrders />} />
        </Routes>
      </div>

      {/* Bottom Apple-style Tab Bar */}
      <div className="fixed bottom-0 left-0 right-0 h-[84px] bg-white/90 backdrop-blur-xl border-t border-gray-100 flex justify-around items-center px-6 pb-4 pt-2">
        <button 
          onClick={() => navigate('/')}
          className={cn("flex flex-col items-center gap-1", location.pathname === '/' ? "text-[#007AFF]" : "text-[#86868B]")}
        >
          <Home className={cn("w-6 h-6", location.pathname === '/' && "fill-current")} />
          <span className="text-[10px] font-semibold">Início</span>
        </button>
        <button 
          onClick={() => navigate('/products')}
          className={cn("flex flex-col items-center gap-1", location.pathname === '/products' ? "text-[#007AFF]" : "text-[#86868B]")}
        >
          <Package className={cn("w-6 h-6", location.pathname === '/products' && "fill-current")} />
          <span className="text-[10px] font-semibold">Produtos</span>
        </button>
        <button 
          onClick={() => navigate('/orders')}
          className={cn("flex flex-col items-center gap-1", location.pathname === '/orders' ? "text-[#007AFF]" : "text-[#86868B]")}
        >
          <ShoppingCart className={cn("w-6 h-6", location.pathname === '/orders' && "fill-current")} />
          <span className="text-[10px] font-semibold">Vendas</span>
        </button>
      </div>
    </div>
  );
}
