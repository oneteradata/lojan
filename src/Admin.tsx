import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ShoppingBag, EyeOff, ChevronRight, RefreshCw, LogOut, TrendingUp, Package, ShoppingCart, Heart, Activity, Plus, X, Trash2, Home, Users, Lock, Unlock } from 'lucide-react';
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

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
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogoUpload = async (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    setError('');
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error("A imagem deve ter no máximo 2MB");
      const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const fileName = `${Date.now()}-${safeName}`;
      
      const resSign = await apiFetch('/api/presigned-url', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ fileName, mimeType: file.type })
      });
      const dataSign = await resSign.json();
      if (!dataSign.success) throw new Error(dataSign.error || 'Falha ao gerar link de upload');

      const uploadRes = await fetch(dataSign.url, {
         method: 'PUT',
         headers: { 'Content-Type': file.type },
         body: file
      });
      if (!uploadRes.ok) throw new Error(`Falha no upload pro MinIO: ${uploadRes.statusText}`);

      const finalUrl = `https://file.voryx.com.br/marketplace/${fileName}`;
      setCompanyLogo(finalUrl);
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
      const body = isRegistering ? { name, email, password, company_name: companyName, company_logo: companyLogo } : { email, password };
      
      const res = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.success) {
        if (data.token) localStorage.setItem('token', data.token);
        if (isRegistering) {
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
          {isRegistering && (
            <>
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
            {error && <p className="text-[#FF3B30] text-xs mt-2 px-2">{error}</p>}
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

// -- Overview Component --
function AdminOverview({ user, onLogout }: { user: any, onLogout: () => void }) {
  const [stats, setStats] = useState({ products: 0, orders: 0, stock: 0, likes: 0 });
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/stats');
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
          <p className="text-[11px] font-bold text-[#86868B] tracking-widest mt-1 uppercase">ID: {user?.id} • Visão Geral</p>
        </div>
        <div className="flex gap-3">
          <button onClick={fetchStats} className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm hover:bg-gray-50 transition-colors text-[#1D1D1F]">
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          </button>
          <button onClick={onLogout} className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm hover:bg-gray-50 transition-colors text-[#FF3B30]">
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
  const [modalItem, setModalItem] = useState<any | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchProducts = async () => {
    try {
       const res = await apiFetch('/api/admin/products');
       const data = await res.json();
       // Parse arrays back from Postgres payload if they were stringified instead of JSONB
       const parsedData = data.map((d: any) => ({
         ...d,
         media: typeof d.media === 'string' ? JSON.parse(d.media) : (d.media || []),
         variations: typeof d.variations === 'string' ? JSON.parse(d.variations) : (d.variations || [])
       }));
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
                 <div key={p.id} onClick={() => { setModalItem(p); setIsModalOpen(true); }} className="border border-gray-100 rounded-2xl overflow-hidden hover:shadow-md transition-all cursor-pointer">
                    {isVideo ? (
                       <video src={displayUrl} className="w-full aspect-square object-cover bg-gray-100" muted loop autoPlay playsInline />
                    ) : (
                       <img src={displayUrl} className="w-full aspect-square object-cover bg-gray-100" />
                    )}
                    <div className="p-4">
                       <h4 className="font-semibold text-sm truncate">{p.name}</h4>
                       <div className="flex justify-between items-center mt-1">
                         <p className="text-xs text-[#007AFF] font-medium">
                           {Number(p.price) === 0 ? 'A consultar' : `R$ ${parseFloat(p.price).toLocaleString('pt-BR')}${(p.business_model && p.business_model !== 'Venda' && p.business_model !== 'Venda por unidade') ? ` (${p.business_model})` : ''}`}
                         </p>
                         {p.user_name && <p className="text-[9px] text-[#86868B] uppercase font-bold truncate max-w-[80px]">By {p.user_name}</p>}
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
           <ProductModal item={modalItem} onClose={() => { setIsModalOpen(false); fetchProducts(); }} />
         )}
       </AnimatePresence>
    </motion.div>
  );
}

function ProductModal({ item, onClose }: { item?: any, onClose: () => void }) {
  const [formData, setFormData] = useState({
    name: item?.name || '', 
    category: item?.category || 'Geral', 
    business_model: item?.business_model || 'Venda',
    price: item?.price || '', 
    tokens: item?.tokens || '', 
    stock: item?.stock || '', 
    details: item?.details || ''
  });
  const [media, setMedia] = useState<{type: string, url: string, fileName?: string}[]>(item?.media || []);
  const [variations, setVariations] = useState<{type: string, options: string[]}[]>(item?.variations || [{ type: 'cor', options: [] }]);

  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

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
        alert(data.error || 'Erro ao salvar produto');
      } else {
        onClose();
      }
    } catch(e) {
      alert('Erro inesperado ao salvar.');
    }
    setLoading(false);
  };

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setUploading(true);
    try {
      if (file.size > 250 * 1024 * 1024) {
        alert("O arquivo não pode exceder 250MB.");
        setUploading(false);
        e.target.value = '';
        return;
      }

      const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const fileName = `${Date.now()}-${safeName}`;
      
      // 1. Gerar link de upload direto (Presigned URL)
      const resSign = await apiFetch('/api/presigned-url', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ fileName, mimeType: file.type })
      });
      const dataSign = await resSign.json();

      if (!dataSign.success) {
         throw new Error(dataSign.error || 'Falha ao gerar link de upload');
      }

      // 2. Fazer upload direto para o MinIO usando o link
      const uploadRes = await fetch(dataSign.url, {
         method: 'PUT',
         headers: {
           'Content-Type': file.type
         },
         body: file
      });

      if (!uploadRes.ok) {
         throw new Error(`Falha no upload pro MinIO: ${uploadRes.statusText}`);
      }

      const finalUrl = `https://file.voryx.com.br/marketplace/${fileName}`;
      const type = file.type.startsWith('video') ? 'video' : 'image';
      setMedia([...media, { type, url: finalUrl, fileName }]);
      
    } catch (err: any) {
      console.error(err);
      alert('Erro no upload: ' + err.message + '. Se for um erro de CORS, certifique-se que o file.voryx.com.br permite requisições PUT do seu domínio.');
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
  
  const addVariationOption = (idx: number) => {
    const opt = prompt('Nova opção:');
    if (opt) {
      const newVars = [...variations];
      newVars[idx].options.push(opt);
      setVariations(newVars);
    }
  }
  
  const removeVariationOption = (idx: number, optIdx: number) => {
    const newVars = [...variations];
    newVars[idx].options.splice(optIdx, 1);
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
                        <video src={m.url} className="w-full h-full object-cover" muted loop autoPlay playsInline preload="metadata" />
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
                      <input type="file" className="hidden" accept="image/*,video/*" onChange={handleMediaUpload} />
                    </label>
                  )}
               </div>
            </div>

            {/* Identificação */}
            <div>
              <label className="text-[11px] font-bold text-[#86868B] tracking-wide mb-2 block">IDENTIFICAÇÃO (NOME)</label>
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
                  <option>Geral</option>
                  <option>Roupas</option>
                  <option>Moda</option>
                  <option>Eletrônicos</option>
                  <option>Acessórios</option>
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
                        <div className="flex gap-2 flex-wrap">
                           {v.options.map((opt, optIdx) => (
                             <span key={optIdx} className="bg-white border border-gray-200 rounded-full pl-3 pr-1 py-1 text-xs font-semibold flex items-center gap-1 shadow-sm">
                               {opt} 
                               <button onClick={() => removeVariationOption(idx, optIdx)} className="w-5 h-5 rounded-full hover:bg-gray-100 flex justify-center items-center"><X className="w-3 h-3 text-gray-500" /></button>
                             </span>
                           ))}
                           <button onClick={() => addVariationOption(idx)} className="border border-dashed border-gray-300 text-gray-500 hover:text-gray-700 hover:border-gray-400 rounded-full px-3 py-1 text-xs font-medium transition-colors">+ Opção</button>
                        </div>
                    </div>
                  ))}
               </div>
            </div>
         </div>

         <div className="px-6 py-5 border-t border-gray-100 bg-white sm:rounded-b-[32px]">
            <button 
              onClick={handleSubmit} disabled={loading || uploading}
              className="w-full bg-[#007AFF] hover:bg-[#0066CC] active:scale-[0.99] transition-all text-white font-semibold rounded-2xl py-4 flex items-center justify-center shadow-lg shadow-blue-500/20 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {loading ? 'Salvando...' : <><RefreshCw className="w-4 h-4 mr-2" /> Salvar Produto</>}
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
    apiFetch('/api/orders').then(r => r.json()).then(d => setOrders(d)).catch(e => {});
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


// -- Users Component --
function AdminUsers() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '', password: '', role: 'user', company_name: '', company_logo: '' });

  const fetchUsers = async () => {
    try {
      const res = await apiFetch('/api/users');
      const data = await res.json();
      setUsers(data);
    } catch (e) {}
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleLogoUpload = async (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error("A imagem deve ter no máximo 2MB");
      const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const fileName = `${Date.now()}-${safeName}`;
      
      const resSign = await apiFetch('/api/presigned-url', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ fileName, mimeType: file.type })
      });
      const dataSign = await resSign.json();
      if (!dataSign.success) throw new Error(dataSign.error || 'Falha ao gerar link de upload');

      const uploadRes = await fetch(dataSign.url, {
         method: 'PUT',
         headers: { 'Content-Type': file.type },
         body: file
      });
      if (!uploadRes.ok) throw new Error(`Falha no upload pro MinIO: ${uploadRes.statusText}`);

      const finalUrl = `https://file.voryx.com.br/marketplace/${fileName}`;
      setFormData(prev => ({...prev, company_logo: finalUrl}));
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
      const url = editingUser ? `/api/users/${editingUser.id}` : '/api/users';
      const method = editingUser ? 'PUT' : 'POST';

      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (data.success) {
        setShowAddForm(false);
        setEditingUser(null);
        setFormData({ name: '', email: '', password: '', role: 'user', company_name: '', company_logo: '' });
        fetchUsers();
      } else {
        alert(data.error);
      }
    } catch (e) {}
    setLoading(false);
  };

  const handleToggleBlock = async (u: any) => {
    const newRole = u.role === 'blocked' ? 'user' : 'blocked';
    try {
      await apiFetch(`/api/users/${u.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: u.name, email: u.email, role: newRole })
      });
      fetchUsers();
    } catch (e) {}
  };

  const handleDelete = async (u: any) => {
    if (!confirm(`Remover usuário ${u.name}?`)) return;
    try {
      await apiFetch(`/api/users/${u.id}`, { method: 'DELETE' });
      fetchUsers();
    } catch (e) {}
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 md:p-8 h-full flex flex-col relative">
       <div className="mb-6 flex justify-between items-end">
          <div>
            <h2 className="text-3xl font-bold text-[#1D1D1F] tracking-tight">Equipe</h2>
            <p className="text-[11px] font-bold text-[#86868B] tracking-widest mt-1 uppercase">Acesso & Permissões</p>
          </div>
          <button 
             onClick={() => { setEditingUser(null); setFormData({ name: '', email: '', password: '', role: 'user', company_name: '', company_logo: '' }); setShowAddForm(true); }}
             className="w-10 h-10 bg-black text-white rounded-full flex items-center justify-center hover:scale-105 transition-transform shadow-lg shadow-black/20"
          >
             <Plus className="w-5 h-5" />
          </button>
       </div>

       <div className="bg-[#F5F5F7] rounded-[32px] flex-1 flex flex-col p-6 overflow-hidden relative">
          <div className="space-y-4 overflow-y-auto w-full">
            {users.map(u => (
              <div key={u.id} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex justify-between items-center">
                 <div className="flex items-center gap-4">
                   {u.company_logo ? (
                     <img src={u.company_logo} alt={u.company_name || 'Logo'} className="w-10 h-10 object-cover rounded-xl border border-gray-100 bg-gray-50" />
                   ) : (
                     <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-gray-400">
                       <User className="w-5 h-5" />
                     </div>
                   )}
                   <div>
                     <p className="font-bold text-sm text-[#1D1D1F] flex items-center gap-2">
                       {u.name} (ID: {u.id})
                       {u.role === 'admin' && <span className="bg-blue-100 text-blue-700 text-[9px] uppercase font-bold px-1.5 py-0.5 rounded">Admin</span>}
                       {u.role === 'blocked' && <span className="bg-red-100 text-red-700 text-[9px] uppercase font-bold px-1.5 py-0.5 rounded">Block</span>}
                     </p>
                     <p className="text-xs text-[#86868B] mt-0.5">
                       {u.company_name ? `${u.company_name} • ${u.email}` : u.email}
                     </p>
                   </div>
                 </div>
                 <div className="flex gap-2">
                   {u.email !== 'admin@valentina.com' && (
                     <>
                       <button onClick={() => { setEditingUser(u); setFormData({ name: u.name, email: u.email, password: '', role: u.role, company_name: u.company_name || '', company_logo: u.company_logo || '' }); setShowAddForm(true); }} className="text-[10px] uppercase font-bold text-[#007AFF] px-2 bg-blue-50 rounded-xl hover:bg-blue-100 transition-colors">Editar</button>
                       <button onClick={() => handleToggleBlock(u)} className="p-2 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                         {u.role === 'blocked' ? <Unlock className="w-4 h-4 text-green-600" /> : <Lock className="w-4 h-4 text-orange-500" />}
                       </button>
                       <button onClick={() => handleDelete(u)} className="p-2 bg-red-50 rounded-xl hover:bg-red-100 transition-colors">
                         <Trash2 className="w-4 h-4 text-red-500" />
                       </button>
                     </>
                   )}
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
                  <h3 className="text-xl font-bold tracking-tight">{editingUser ? 'Editar Usuário' : 'Novo Usuário'}</h3>
                  <button onClick={() => setShowAddForm(false)} className="w-8 h-8 flex items-center justify-center bg-gray-100 rounded-full hover:bg-gray-200">
                    <X className="w-4 h-4" />
                  </button>
               </div>
               
               <form onSubmit={handleAdd} className="p-6 space-y-4 overflow-y-auto max-h-[70vh]">
                 <div>
                   <label className="text-[11px] font-bold text-gray-500 tracking-wider uppercase mb-1 block">Nome</label>
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
                 <button type="submit" disabled={loading} className="w-full bg-[#007AFF] text-white font-semibold rounded-2xl py-4 mt-6 disabled:opacity-70">
                   {loading ? 'Salvando...' : 'Salvar Usuário'}
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
  const location = useLocation();
  const navigate = useNavigate();

  if (!user) {
    return <AdminLogin onLogin={setUser} />;
  }

  return (
    <div className="flex flex-col h-screen bg-white font-sans text-[#1D1D1F]">
      <div className="flex-1 overflow-x-hidden overflow-y-auto pb-20">
        <Routes>
          <Route path="/" element={<AdminOverview user={user} onLogout={() => { localStorage.removeItem('token'); setUser(null); }} />} />
          <Route path="/products" element={<AdminProducts />} />
          <Route path="/orders" element={<AdminOrders />} />
          <Route path="/users" element={user.role === 'admin' ? <AdminUsers /> : <div className="p-8 text-center text-gray-500">Acesso negado. Apenas administradores.</div>} />
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
        {user.role === 'admin' && (
          <button 
            onClick={() => navigate('/users')}
            className={cn("flex flex-col items-center gap-1", location.pathname === '/users' ? "text-[#007AFF]" : "text-[#86868B]")}
          >
            <Users className={cn("w-6 h-6", location.pathname === '/users' && "fill-current")} />
            <span className="text-[10px] font-semibold">Equipe</span>
          </button>
        )}
      </div>
    </div>
  );
}
