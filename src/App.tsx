import { motion, AnimatePresence } from 'motion/react';
import { Search, ShoppingBag, Heart, Share2, User, Menu, ArrowRight, Eye, EyeOff, LogOut, RefreshCw, FileText } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import AdminApp from './Admin';

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

function Storefront() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [interactionText, setInteractionText] = useState('');

  const handleInteraction = async (type: string, contentStr?: string) => {
    if (!user) { alert('Faça login para interagir.'); return; }
    try {
      const res = await apiFetch('/api/interactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: selectedProduct.id,
          interaction_type: type,
          content: contentStr || ''
        })
      });
      if (res.ok && type === 'comment') {
         setInteractionText('');
         alert('Comentário enviado!');
      } else if (res.ok && type === 'like') {
         alert('Você curtiu este produto!');
      } else if (res.ok && type === 'share') {
         alert('Compartilhado com sucesso!');
      }
    } catch (e) { 
       console.error(e);
    }
  };

  
  const [showLogin, setShowLogin] = useState(false);
  const [showWallet, setShowWallet] = useState(true);
  const [isRegistering, setIsRegistering] = useState(false);
  const [user, setUser] = useState<any>(null);
  
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      apiFetch('/api/me').then(r => r.json()).then(data => {
        if (data.success && data.user) setUser(data.user);
        else localStorage.removeItem('token');
      }).catch(e => console.error(e));
    }
  }, []);

  // Auth state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [requestedRole, setRequestedRole] = useState('user');
  const [companyLogo, setCompanyLogo] = useState('');
  const [telefone, setTelefone] = useState('');
  const [cep, setCep] = useState('');
  const [endereco, setEndereco] = useState('');
  const [numero, setNumero] = useState('');
  const [bairro, setBairro] = useState('');
  const [cidade, setCidade] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [authError, setAuthError] = useState('');

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

  // Cart state
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [cartItems, setCartItems] = useState<any[]>([]);
  const [orderStatus, setOrderStatus] = useState<string | null>(null);
  const [selectedVariations, setSelectedVariations] = useState<{[varIdx: number]: {[optIdx: number]: number}}>({});
  const [activeMediaIdx, setActiveMediaIdx] = useState(0);

  // Busca produtos do DB
  useEffect(() => {
    apiFetch('/api/products')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
           const parsedData = data.map((d: any) => ({
             ...d,
             media: typeof d.media === 'string' ? JSON.parse(d.media) : (d.media || []),
             variations: typeof d.variations === 'string' ? JSON.parse(d.variations) : (d.variations || [])
           }));
           setProducts(parsedData);
        }
      })
      .catch(err => console.error("Erro ao buscar produtos", err));
  }, []);

  const handleAuth = async (e: any) => {
    e.preventDefault();
    if (uploadingLogo) return;
    setAuthError('');
    
    const endpoint = isRegistering ? '/api/register' : '/api/login';
    const bodyPayload = isRegistering ? { name, email, password, company_name: companyName, company_logo: companyLogo, requested_role: requestedRole, telefone, endereco, bairro, cidade, numero, cep } : { email, password };

    try {
      const res = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload)
      });
      const data = await res.json();
      if (data.success) {
        if (data.token) {
           localStorage.setItem('token', data.token);
           setUser(data.user);
           setShowLogin(false);
        } else if (data.message) {
           // Registration success, waiting for approval
           alert(data.message);
           setIsRegistering(false);
           setEmail('');
           setPassword('');
           setName('');
           setCompanyName('');
           setCompanyLogo('');
           return;
        }

        if (isRegistering && data.user) {
            alert(`Cadastrado(a) com sucesso! Seu ID de cadastro é: ${data.user.id}`);
        }
        setEmail('');
        setPassword('');
        setName('');
        setCompanyName('');
        setCompanyLogo('');
        setIsRegistering(false);
      } else {
        setAuthError(data.error);
      }
    } catch(err) {
      setAuthError("Erro ao conectar no servidor. Tentando simular...");
      setUser({ id: 1, name: name || 'Admin Silva', email });
      setShowLogin(false);
    }
  };

  const handleLogoUpload = async (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    setAuthError('');
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
      setAuthError('Erro no upload: ' + err.message);
    }
    setUploadingLogo(false);
    e.target.value = '';
  };

  const handleAddToCart = (product: any) => {
    fetch(`/api/products/${product.id}/click`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }).catch(() => null);
    let addedPrice = 0;
    const chosenOptions: string[] = [];
    if (product.variations && typeof product.variations !== 'string') {
        product.variations.forEach((v: any, vIdx: number) => {
           if (!selectedVariations[vIdx]) return;
           v.options.forEach((opt: string, optIdx: number) => {
              const count = selectedVariations[vIdx][optIdx] || 0;
              if (count > 0) {
                 const extraP = parseFloat(v.optionPrices?.[optIdx]) || 0;
                 if (v.multipleCount) {
                    chosenOptions.push(`${count}x ${opt}`);
                    addedPrice += extraP * count;
                 } else {
                    chosenOptions.push(opt);
                    addedPrice += extraP;
                 }
              }
           });
        });
    }

    const cartItemId = product.id + '-' + chosenOptions.join('-');
    let basePriceStr = product.price;
    if (typeof basePriceStr === 'string') {
       const m = basePriceStr.match(/R\$\s*([\d\.,]+)/);
       if (m) basePriceStr = m[1];
    }
    
    let numericPrice = parseFloat(String(basePriceStr).replace(/\./g, '').replace(',', '.'));
    if (isNaN(numericPrice)) numericPrice = 0;
    
    const finalPrice = numericPrice + addedPrice;

    const existing = cartItems.find(item => item.cartItemId === cartItemId);
    if (existing) {
       setCartItems(cartItems.map(item => item.cartItemId === cartItemId ? { ...item, quantity: item.quantity + 1 } : item));
    } else {
       setCartItems([...cartItems, { ...product, cartItemId, finalPrice, chosenOptions, quantity: 1 }]);
    }
    setSelectedProduct(null);
    setIsCartOpen(true);
    setOrderStatus(null);
  };

  const calculateTotal = () => {
    const rawTotal = cartItems.reduce((acc, item) => {
      return acc + (item.finalPrice * item.quantity);
    }, 0);
    return `R$ ${rawTotal.toLocaleString('pt-BR')}`;
  };

  const handleCheckout = async () => {
    if (!user) {
       setIsCartOpen(false);
       setShowLogin(true);
       return;
    }
    
    setOrderStatus('Processando e comunicando com Postgres...');
    try {
      const payload = {
         userId: user.id,
         total: calculateTotal(),
         items: cartItems.map(item => ({ 
             id: item.id, 
             quantity: item.quantity, 
             chosenOptions: item.chosenOptions, 
             finalPrice: item.finalPrice 
         }))
      };
      
      const res = await apiFetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      
      if (data.success) {
         setOrderStatus(`✅ Pedido 00${data.orderId} gerado no Banco de Dados com Sucesso!`);
         setCartItems([]);
         setTimeout(() => {
            setIsCartOpen(false);
            setOrderStatus(null);
         }, 3500);
      } else {
         setOrderStatus(`❌ Erro no SQL: ${data.error}`);
         setTimeout(() => setOrderStatus(null), 4000);
      }
    } catch(err) {
       setOrderStatus('⚠️ Erro de API/VPS - Simulado pedido completo!'); 
       setCartItems([]);
       setTimeout(() => { setIsCartOpen(false); setOrderStatus(null); }, 3500);
    }
  };

  const scrollToProducts = (e: any) => {
     e.preventDefault();
     setTimeout(() => {
       const section = document.getElementById('products-section');
       if (section) section.scrollIntoView({ behavior: 'smooth' });
     }, 100);
  };
  
  const scrollToCategories = (e: any) => {
     e.preventDefault();
     const section = document.getElementById('categories-section');
     if (section) section.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-[var(--color-brand-bg)] overflow-x-hidden">
      {/* Logged in Top Bar */}
      {user && (
        <div className="fixed top-0 left-0 right-0 z-[60] bg-[#007AFF] text-white border-b border-blue-400 px-4 py-2 flex items-center justify-between text-[10px] md:text-xs">
          <div className="flex items-center gap-3">
            <button onClick={() => { localStorage.removeItem('token'); setUser(null); }} className="flex items-center gap-1 hover:text-blue-200 transition-colors" title="Sair">
              <LogOut className="w-3 h-3" />
              <span className=" uppercase">Sair</span>
            </button>
            <div className="w-px h-4 bg-blue-300"></div>
            {user.company_logo && (
              <img src={user.company_logo} alt="Logo" className="w-5 h-5 md:w-6 md:h-6 object-cover rounded-full border border-blue-300/50" />
            )}
            <span className="font-bold uppercase tracking-wider ">{user.company_name || 'Usuário'}</span>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1 cursor-help" title="Produtos Ativos">
               <ShoppingBag className="w-3 h-3 text-blue-200" />
               <span className="font-bold">{user.active_products_count || 0}</span>
               <span className="uppercase text-blue-100 ">Produtos</span>
            </div>
            <div className="w-px h-4 bg-blue-300"></div>
            
            <div className="flex items-center gap-2">
               <button onClick={() => setShowWallet(!showWallet)} className="hover:text-blue-200 transition-colors" title="Ocultar/Mostrar Saldo">
                  {showWallet ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
               </button>
               {showWallet && user.wallet?.tokens && Array.isArray(user.wallet.tokens) ? (
                 <div className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => window.location.href = '/etoken'}>
                   {Object.entries(user.wallet.tokens.reduce((acc: any, t: string) => { acc[t] = (acc[t]||0)+1; return acc; }, {})).map(([tipo, qty]: any) => (
                      <div key={tipo} className="flex gap-1 items-center bg-white/20 rounded px-1.5 py-0.5">
                         <span className="font-bold text-white">{qty}</span>
                         <span className="uppercase text-blue-50">E{tipo}</span>
                      </div>
                   ))}
                   {user.wallet.tokens.length === 0 && <span className="text-blue-200 uppercase cursor-pointer" onClick={() => window.location.href = '/etoken'}>Sem Tokens</span>}
                 </div>
               ) : showWallet ? (
                 <span className="text-blue-200 uppercase cursor-pointer" onClick={() => window.location.href = '/etoken'}>Sem Tokens</span>
               ) : (
                 <span className="text-blue-200 uppercase tracking-widest  cursor-pointer" onClick={() => window.location.href = '/etoken'}>Oculto</span>
               )}
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <header className={`fixed w-full z-50 p-4 sm:p-6 flex flex-col sm:flex-row gap-4 sm:gap-0 justify-between items-center transition-all duration-300 ${isScrolled ? 'bg-white text-gray-900 border-b border-gray-200 shadow-sm' : 'text-gray-900 border-b border-transparent bg-white/80 backdrop-blur-md'} ${user ? 'top-[40px] md:top-[44px]' : 'top-0'}`}>
        <div className="flex gap-4 sm:gap-6 items-center flex-wrap justify-center order-2 sm:order-1">
          <a href="#categories-section" onClick={scrollToCategories} className="nav-link text-[10px] sm:text-xs tracking-widest uppercase">Coleções</a>
          <a href="#products-section" onClick={scrollToProducts} className="nav-link text-[10px] sm:text-xs tracking-widest uppercase">Maison</a>
          <a href="/" className="nav-link text-[10px] sm:text-xs tracking-widest uppercase text-[#007AFF] font-bold">Vitrine admin</a>
        </div>
        
        <div className="hidden md:hidden">
          <Menu className="w-5 h-5" strokeWidth={1.5} />
        </div>

        <div className="order-1 sm:order-2 sm:absolute sm:left-1/2 sm:-translate-x-1/2">
          <h1 className="font-serif text-2xl sm:text-3xl tracking-wide cursor-pointer text-[#007AFF]" onClick={() => window.scrollTo({top: 0, behavior: 'smooth'})}>VALENTINA</h1>
        </div>

        <div className="flex gap-4 sm:gap-6 items-center order-3 mt-2 sm:mt-0">
          <Search className="w-4 h-4 cursor-pointer hover:text-[#007AFF] transition-colors" strokeWidth={1.5} />
          {user ? (
            <span className="text-xs uppercase tracking-widest text-[#007AFF]  font-bold" title={`ID: ${user.id}`}>Olá, {user.name.split(' ')[0]} (ID: {user.id})</span>
          ) : (
            <User onClick={() => setShowLogin(true)} className="w-4 h-4 cursor-pointer hover:text-[#007AFF] transition-colors " strokeWidth={1.5} />
          )}
          <div className="relative">
             <ShoppingBag onClick={() => setIsCartOpen(true)} className="w-4 h-4 cursor-pointer hover:text-[#007AFF] transition-colors" strokeWidth={1.5} />
             {cartItems.length > 0 && (
                <span className="absolute -top-2 -right-2 bg-[#007AFF] text-white text-[8px] font-bold w-4 h-4 flex items-center justify-center rounded-full">
                  {cartItems.reduce((acc, item) => acc + item.quantity, 0)}
                </span>
             )}
          </div>
        </div>
      </header>

      {/* Modal de Autenticação */}
      {showLogin && (
        <AnimatePresence>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-0">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowLogin(false)} />
            <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} className="bg-white border border-gray-100 p-8 sm:p-12 w-full max-w-[420px] relative rounded-3xl shadow-2xl overflow-hidden z-10">
              {/* Decorative elements */}
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#007AFF] to-transparent opacity-50" />
              <div className="absolute top-[-50px] left-1/2 -translate-x-1/2 w-[100px] h-[100px] bg-[#007AFF] rounded-full blur-[80px] opacity-10 pointer-events-none" />

              <button onClick={() => setShowLogin(false)} className="absolute top-5 right-5 w-8 h-8 flex items-center justify-center bg-gray-100 rounded-full text-gray-500 hover:text-gray-900 hover:bg-gray-200 transition-colors z-20">
                 ✕
              </button>
              
              <div className="text-center mb-8 relative z-10">
                <h2 className="font-serif text-3xl mb-2 text-gray-900">{isRegistering ? 'Criar Conta' : 'Acesso Exclusivo'}</h2>
                <p className="text-[10px] text-[#007AFF] uppercase tracking-[0.2em] font-bold">
                  {isRegistering ? 'Junte-se à Maison Valentina' : 'Faça login para continuar'}
                </p>
              </div>
              
              <form onSubmit={handleAuth} className="flex flex-col gap-5 relative z-10">
                {isRegistering && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="flex flex-col gap-5">
                    <div className="relative group">
                      <input 
                        type="text" 
                        placeholder="Nome Completo" 
                        value={name}
                        onChange={e => setName(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 pt-5 pb-2 text-sm text-gray-900 peer focus:border-[#007AFF]/50 focus:bg-white transition-all outline-none"
                        required
                      />
                      <label className="absolute text-[10px] uppercase tracking-wider text-gray-500 top-2 left-4 peer-focus:text-[#007AFF] transition-colors">Nome</label>
                    </div>
                    <div className="flex gap-4 p-2 bg-gray-50 rounded-xl mb-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                           <input type="radio" name="role" checked={requestedRole === 'user'} onChange={() => setRequestedRole('user')} className="accent-[#007AFF]" />
                           <span className="text-sm font-medium">Conta de Vendedor</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                           <input type="radio" name="role" checked={requestedRole === 'delivery'} onChange={() => setRequestedRole('delivery')} className="accent-[#007AFF]" />
                           <span className="text-sm font-medium">Entregador Parceiro</span>
                        </label>
                    </div><div className="relative group">
                      <input 
                        type="text" 
                        placeholder="Nome da Empresa (opcional)" 
                        value={companyName}
                        onChange={e => setCompanyName(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 pt-5 pb-2 text-sm text-gray-900 peer focus:border-[#007AFF]/50 focus:bg-white transition-all outline-none"
                      />
                      <label className="absolute text-[10px] uppercase tracking-wider text-gray-500 top-2 left-4 peer-focus:text-[#007AFF] transition-colors">Empresa</label>
                    </div>
                    <div className="flex border border-gray-200 rounded-xl px-4 py-3 bg-gray-50 items-center justify-between">
                      <span className="text-xs text-gray-500 uppercase tracking-wider font-medium">Logo da Empresa</span>
                      <input 
                        type="file" 
                        accept="image/*"
                        onChange={handleLogoUpload}
                        disabled={uploadingLogo}
                        className="text-[10px] max-w-[140px] file:mr-2 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-[10px] file:bg-gray-200 file:text-gray-900 file:font-semibold hover:file:bg-[#007AFF] hover:file:text-white file:transition-colors cursor-pointer text-gray-400"
                      />
                    </div>
                    {uploadingLogo && <span className="text-[10px] text-[#007AFF] flex items-center gap-2"><RefreshCw className="w-3 h-3 animate-spin"/> Enviando logo...</span>}
                    {companyLogo && <img src={companyLogo} alt="Logo" className="h-12 w-12 object-cover rounded-full border border-gray-200 self-center" />}

                    <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-100">
                      <div className="col-span-2 relative group">
                        <input value={telefone} onChange={e => setTelefone(e.target.value)} type="text" placeholder="(00) 00000-0000" className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 pt-5 pb-2 text-sm text-gray-900 peer focus:border-[#007AFF]/50 focus:bg-white transition-all outline-none" required />
                        <label className="absolute text-[10px] uppercase tracking-wider text-gray-500 top-2 left-4 peer-focus:text-[#007AFF] transition-colors">Telefone</label>
                      </div>
                      <div className="relative group">
                        <input value={cep} onChange={e => setCep(e.target.value)} type="text" placeholder="00000-000" className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 pt-5 pb-2 text-sm text-gray-900 peer focus:border-[#007AFF]/50 focus:bg-white transition-all outline-none" />
                        <label className="absolute text-[10px] uppercase tracking-wider text-gray-500 top-2 left-4 peer-focus:text-[#007AFF] transition-colors">CEP</label>
                      </div>
                      <div className="col-span-2 relative group">
                        <input value={endereco} onChange={e => setEndereco(e.target.value)} type="text" placeholder="Rua..." className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 pt-5 pb-2 text-sm text-gray-900 peer focus:border-[#007AFF]/50 focus:bg-white transition-all outline-none" required />
                        <label className="absolute text-[10px] uppercase tracking-wider text-gray-500 top-2 left-4 peer-focus:text-[#007AFF] transition-colors">Endereço</label>
                      </div>
                      <div className="relative group">
                        <input value={numero} onChange={e => setNumero(e.target.value)} type="text" placeholder="Nº" className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 pt-5 pb-2 text-sm text-gray-900 peer focus:border-[#007AFF]/50 focus:bg-white transition-all outline-none" required />
                        <label className="absolute text-[10px] uppercase tracking-wider text-gray-500 top-2 left-4 peer-focus:text-[#007AFF] transition-colors">Número</label>
                      </div>
                      <div className="relative group">
                        <input value={bairro} onChange={e => setBairro(e.target.value)} type="text" placeholder="Bairro..." className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 pt-5 pb-2 text-sm text-gray-900 peer focus:border-[#007AFF]/50 focus:bg-white transition-all outline-none" required />
                        <label className="absolute text-[10px] uppercase tracking-wider text-gray-500 top-2 left-4 peer-focus:text-[#007AFF] transition-colors">Bairro</label>
                      </div>
                      <div className="col-span-2 relative group">
                        <input value={cidade} onChange={e => setCidade(e.target.value)} type="text" placeholder="Sua Cidade..." className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 pt-5 pb-2 text-sm text-gray-900 peer focus:border-[#007AFF]/50 focus:bg-white transition-all outline-none" required />
                        <label className="absolute text-[10px] uppercase tracking-wider text-gray-500 top-2 left-4 peer-focus:text-[#007AFF] transition-colors">Cidade</label>
                      </div>
                    </div>

                  </motion.div>
                )}
                
                <div className="relative group">
                  <input 
                    type="text" 
                    placeholder={isRegistering ? "seu@email.com" : "admin@valentina.com"}  
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 pt-5 pb-2 text-sm text-gray-900 peer focus:border-[#007AFF]/50 focus:bg-white transition-all outline-none"
                    required
                  />
                  <label className="absolute text-[10px] uppercase tracking-wider text-gray-500 top-2 left-4 peer-focus:text-[#007AFF] transition-colors">Email ou ID</label>
                </div>

                <div className="relative group">
                  <input 
                    type="password" 
                    placeholder="••••••••" 
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 pt-5 pb-2 text-sm text-gray-900 peer focus:border-[#007AFF]/50 focus:bg-white transition-all outline-none"
                    required
                  />
                  <label className="absolute text-[10px] uppercase tracking-wider text-gray-500 top-2 left-4 peer-focus:text-[#007AFF] transition-colors">Senha</label>
                </div>

                <AnimatePresence>
                  {authError && authError === 'Usuário bloqueado pelo administrador.' ? (
                    <motion.div initial={{opacity:0, height:0}} animate={{opacity:1, height:'auto'}} exit={{opacity:0, height:0}} className="p-4 bg-red-50 border border-red-200 rounded-xl">
                      <p className="text-red-600 text-[11px] text-center font-medium leading-relaxed">
                        Seu cadastro possui uma irregularidade. Entre em contato para resolver aqui.
                      </p>
                      <a 
                        href={`https://wa.me/5512981311773?text=${encodeURIComponent(`Olá, meu email é ${email} e meu cadastro consta com irregularidade.`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 w-full bg-[#25D366] hover:bg-[#1DA851] text-white flex items-center justify-center gap-2 py-2.5 rounded-lg text-[11px] uppercase tracking-widest font-bold transition-colors"
                      >
                        Falar no WhatsApp
                      </a>
                    </motion.div>
                  ) : authError ? (
                    <motion.p initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="text-red-500 text-xs text-center p-3 bg-red-100 rounded-xl border border-red-200">{authError}</motion.p>
                  ) : null}
                </AnimatePresence>
                
                <button type="submit" className="w-full bg-[#007AFF] text-white mt-4 py-4 rounded-xl text-xs uppercase tracking-[0.2em] font-bold hover:bg-blue-600 transition-all duration-300 shadow-[0_4px_14px_rgba(0,122,255,0.39)]">
                  {isRegistering ? 'Criar Minha Conta' : 'Entrar na Plataforma'}
                </button>
              </form>

              <div className="mt-8 text-center relative z-10">
                <button 
                  type="button"
                  onClick={() => {
                     setIsRegistering(!isRegistering);
                     setAuthError('');
                  }} 
                  className="text-[11px] font-bold text-gray-500 hover:text-[#007AFF] transition-colors uppercase tracking-wider"
                >
                  {isRegistering ? 'Já tem uma conta? Faça login' : 'Ainda não tem conta? Criar agora'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        </AnimatePresence>
      )}

      {/* Hero Section */}
      <section className="relative h-screen w-full flex items-center justify-center pt-20">
        <div className="absolute inset-0 z-0">
          <img 
            src="https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&q=80&w=2000" 
            alt="Hero Image" 
            className="w-full h-full object-cover opacity-90"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-black/20"></div>
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.2, ease: "easeOut" }}
          className="relative z-10 text-center text-white px-4"
        >
          <span className="block text-xs uppercase tracking-[0.3em] font-sans mb-6">Inverno 2026</span>
          <h2 className="font-serif text-6xl md:text-8xl lg:text-9xl font-light tracking-tighter leading-none mb-10">
            A Nova <br /> Elegância
          </h2>
          <button onClick={scrollToProducts} className="border border-white/30 hover:border-[#007AFF] text-white hover:text-white hover:bg-[#007AFF] transition-all duration-300 rounded-full px-8 py-3 text-xs uppercase tracking-widest">
            Descobrir Coleção
          </button>
        </motion.div>
      </section>

      {/* Introduction */}
      <section id="categories-section" className="py-32 px-6 md:px-12 grid md:grid-cols-2 gap-16 items-center max-w-7xl mx-auto w-full">
        <motion.div 
          initial={{ opacity: 0, x: -30 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 1 }}
          className="order-2 md:order-1"
        >
          <img 
            src="https://images.unsplash.com/photo-1539109136881-3be0616acf4b?auto=format&fit=crop&q=80&w=1000" 
            alt="Editorial" 
            className="w-full aspect-[3/4] object-cover oval-mask"
            referrerPolicy="no-referrer"
          />
        </motion.div>
        
        <motion.div 
          initial={{ opacity: 0, x: 30 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 1 }}
          className="order-1 md:order-2 flex gap-8"
        >
          <div className="">
            <span className="vertical-text text-gray-500">Desde 1998</span>
          </div>
          <div>
            <h3 className="font-serif text-4xl md:text-5xl font-light leading-snug mb-8 text-[#1D1D1F]">
              Redefinindo o luxo contemporâneo através de <span className="italic text-[#007AFF]">silhuetas impecáveis</span> e tecidos nobres.
            </h3>
            <p className="font-sans text-sm text-gray-600 leading-relaxed max-w-md mb-8">
              Cada peça Valentina é uma celebração da feminilidade moderna. Desenhada em nosso ateliê, costurada à mão com maestria e pensada para transcender as estações.
            </p>
            <a href="#" className="font-sans text-xs uppercase tracking-widest flex items-center gap-2 hover:text-[#007AFF] transition-colors text-gray-900 font-bold">
              Conheça a Maison <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </motion.div>
      </section>

      {/* Categories Grid */}
      <section className="border-y border-gray-200">
        <div className="grid md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-gray-200">
          {[
            { title: "Vestidos", img: "https://images.unsplash.com/photo-1543163521-1bf539c55dd2?auto=format&fit=crop&q=80&w=800" },
            { title: "Alfaiataria", img: "https://images.unsplash.com/photo-1584273143981-41c073dfe8f8?auto=format&fit=crop&q=80&w=800" },
            { title: "Acessórios", img: "https://images.unsplash.com/photo-1588636734120-7fdbd9ab44cd?auto=format&fit=crop&q=80&w=800" }
          ].map((cat, i) => (
            <motion.div 
              key={i} 
              className="relative group cursor-pointer aspect-[3/4] md:h-[600px] overflow-hidden bg-gray-100"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: i * 0.2 }}
            >
              <img 
                src={cat.img} 
                className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105 opacity-80 group-hover:opacity-100 mixes-multiply" 
                alt={cat.title} 
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-white/10 group-hover:bg-transparent transition-colors duration-500"></div>
              <div className="absolute bottom-8 left-8">
                <h4 className="font-serif text-3xl text-white mb-2 drop-shadow-md">{cat.title}</h4>
                <div className="w-0 h-[3px] bg-[#007AFF] group-hover:w-full transition-all duration-500"></div>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Featured Products */}
      <section id="products-section" className="py-32 px-6 md:px-12 max-w-7xl mx-auto w-full text-[#1D1D1F]">
        <div className="flex justify-between items-end mb-16">
          <h3 className="font-serif text-4xl md:text-5xl font-light">Novidades</h3>
          <a href="#" className=" nav-link text-xs tracking-widest uppercase truncate">
            Ver Todas
          </a>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {products.map((product, i) => {
            const hasMedia = product.media && product.media.length > 0;
            const imagesArray = product.image ? product.image.split(',') : [];
            const firstImg = imagesArray.length > 0 ? imagesArray[0] : null;
            const imgSrc = firstImg ? firstImg : (hasMedia ? product.media[0].url : 'https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&q=80&w=800');
            const isVideo = firstImg ? (firstImg.endsWith('.mp4') || firstImg.endsWith('.webm') || firstImg.endsWith('.mov')) : (!product.image && hasMedia && product.media[0].type === 'video');
            const parsedPrice = parseFloat(product.price);
            let priceLabel = parsedPrice === 0 ? 'A consultar' : (isNaN(parsedPrice) ? product.price : `R$ ${parsedPrice.toLocaleString('pt-BR')}`);
            if (parsedPrice > 0 && product.business_model) {
              if (product.business_model !== 'Venda' && product.business_model !== 'Venda por unidade') {
                priceLabel += ` (${product.business_model})`;
              }
            }
            return (
              <motion.div 
                key={product.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: i * 0.1 }}
                className="group cursor-pointer"
                onClick={() => {
                   fetch(`/api/products/${product.id}/view`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }).catch(() => null);
                   setSelectedProduct({ ...product, image: imgSrc, isVideo, price: priceLabel });
                   setSelectedVariations({});
                   setActiveMediaIdx(0);
                }}
              >
                <div className="overflow-hidden mb-4 relative aspect-[3/4] bg-gray-100">
                  {isVideo ? (
                    <video src={imgSrc + '#t=0.1'} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 mixes-multiply" muted playsInline preload="metadata" />
                  ) : (
                    <img 
                      src={imgSrc} 
                      alt={product.name} 
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 mixes-multiply"
                      referrerPolicy="no-referrer"
                    />
                  )}
                  <div className="absolute inset-0 bg-white/5 group-hover:bg-transparent transition-colors duration-500"></div>
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <span className="bg-[#007AFF] text-white text-[10px] uppercase font-bold tracking-widest py-2 px-6 hover:bg-blue-600 transition-colors">Ver Detalhes</span>
                  </div>
                </div>
                <h5 className="font-serif text-lg text-gray-900 mb-1 group-hover:text-[#007AFF] transition-colors line-clamp-1">{product.name}</h5>
                <div className="flex justify-between items-start mt-1">
                  <p className="font-sans text-sm text-gray-600 font-medium">{priceLabel}</p>
                  {product.user_name && <p className="font-sans text-[9px] uppercase tracking-widest text-[#007AFF] font-bold opacity-80">Por {product.user_name}</p>}
                </div>
              </motion.div>
            );
          })}
        </div>
        
        <div className="mt-12 text-center">
            <a href="#" className="inline-block border border-gray-300 hover:border-[#007AFF] hover:bg-[#007AFF]/10 text-gray-900 font-bold hover:text-[#007AFF] transition-all duration-300 rounded-full px-8 py-3 text-xs tracking-widest uppercase">
              Ver Todas
            </a>
        </div>
      </section>

      {/* Product Details Modal */}
      <AnimatePresence>
      {selectedProduct && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 md:p-12">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm cursor-pointer" onClick={() => setSelectedProduct(null)}></div>
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full max-w-5xl bg-white border border-gray-100 flex flex-col md:flex-row relative max-h-full overflow-y-auto rounded-3xl md:rounded-none"
          >
            <button 
              onClick={() => setSelectedProduct(null)} 
              className="absolute top-4 right-4 z-10 text-gray-500 hover:text-[#1D1D1F] bg-gray-100 md:bg-transparent rounded-full p-2 md:p-0 transition-colors"
            >
              ✕
            </button>
            <div className="md:w-1/2 flex flex-col bg-gray-50 border-r border-gray-100 min-h-[400px]">
              <div className="flex-1 relative overflow-hidden flex items-center justify-center">
                 {(() => {
                   const media = selectedProduct.media || [];
                   const currentMedia = media[activeMediaIdx] || { type: selectedProduct.isVideo ? 'video' : 'image', url: selectedProduct.image };
                   
                   if (currentMedia.type === 'video') {
                     return (
                       <video 
                         key={currentMedia.url}
                         src={currentMedia.url} 
                         className="w-full h-full object-cover" 
                         autoPlay muted loop playsInline
                       />
                     );
                   } else if (currentMedia.type === 'pdf') {
                     return (
                       <div className="w-full h-full flex flex-col items-center justify-center p-12 text-center">
                         <FileText className="w-20 h-20 text-red-500 mb-4" />
                         <p className="text-sm font-bold text-gray-900 mb-4 uppercase tracking-widest">Documento PDF</p>
                         <a 
                           href={currentMedia.url} 
                           target="_blank" 
                           rel="noopener noreferrer"
                           className="bg-red-500 text-white px-6 py-2.5 rounded-full text-[10px] font-bold uppercase tracking-widest hover:bg-red-600 transition-colors shadow-lg shadow-red-500/20"
                         >
                           Visualizar PDF
                         </a>
                       </div>
                     );
                   } else {
                     return (
                       <img 
                         src={currentMedia.url || currentMedia.image} 
                         alt={selectedProduct.name} 
                         className="w-full h-full object-cover" 
                         referrerPolicy="no-referrer"
                       />
                     );
                   }
                 })()}
              </div>
              
              {selectedProduct.media && selectedProduct.media.length > 1 && (
                <div className="flex gap-2 p-4 overflow-x-auto bg-white/50 backdrop-blur-sm border-t border-black/5 scrollbar-none">
                  {selectedProduct.media.map((m: any, idx: number) => (
                    <button 
                      key={idx}
                      onClick={() => setActiveMediaIdx(idx)}
                      className={`w-16 h-16 shrink-0 rounded-xl overflow-hidden border-2 transition-all ${activeMediaIdx === idx ? 'border-[#007AFF] scale-105 shadow-md' : 'border-transparent opacity-60 hover:opacity-100'}`}
                    >
                      {m.type === 'video' ? (
                        <video src={m.url} className="w-full h-full object-cover" muted />
                      ) : m.type === 'pdf' ? (
                        <div className="w-full h-full flex items-center justify-center bg-red-50 text-red-500">
                          <FileText className="w-6 h-6" />
                        </div>
                      ) : (
                        <img src={m.url} className="w-full h-full object-cover" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="md:w-1/2 p-8 md:p-16 flex flex-col justify-center">
              <span className="text-[10px] text-[#007AFF] font-bold uppercase tracking-[0.2em] mb-4">Coleção Exclusiva {selectedProduct.category && `• ${selectedProduct.category}`}</span>
              <h2 className="font-serif text-3xl md:text-5xl text-gray-900 mb-4 leading-tight">{selectedProduct.name}</h2>
              <p className="text-gray-900 font-medium text-xl md:text-2xl mb-8">{selectedProduct.price}</p>
              
              <div className="w-8 h-[2px] bg-[#007AFF] mb-8"></div>
              
              <p className="text-gray-600 text-sm leading-relaxed mb-10">
                {selectedProduct.details || selectedProduct.description || 'Uma peça exclusiva da coleção Valentina. Confeccionada com os mais altos padrões de luxo em nosso ateliê, pensada para trazer elegância e sofisticação instantânea ao seu guarda-roupa.'}
              </p>

              {selectedProduct.variations && selectedProduct.variations.length > 0 && typeof selectedProduct.variations !== 'string' && (
                <div className="flex flex-col gap-6 mb-10">
                  {selectedProduct.variations.map((v: any, vIdx: number) => (
                    <div key={vIdx}>
                      <span className="text-xs uppercase tracking-widest text-gray-500 font-bold mb-3 block">{v.type}</span>
                      <div className="flex flex-wrap gap-2">
                        {v.options.map((opt: string, optIdx: number) => {
                           const priceAdd = v.optionPrices && v.optionPrices[optIdx] ? `(+R$ ${v.optionPrices[optIdx]})` : '';
                           if (v.multiple) {
                              const count = selectedVariations[vIdx]?.[optIdx] || 0;
                              if (v.multipleCount) {
                                  return (
                                     <div key={optIdx} className="flex items-center gap-3 border border-gray-300 rounded-lg p-2 text-sm text-gray-900">
                                       <span className="text-xs font-semibold">{opt} <span className="text-xs text-blue-600">{priceAdd}</span></span>
                                       <div className="flex items-center ml-auto bg-gray-100 rounded-md">
                                          <button onClick={() => {
                                             const curr = {...selectedVariations};
                                             if(!curr[vIdx]) curr[vIdx] = {};
                                             curr[vIdx][optIdx] = Math.max(0, (curr[vIdx][optIdx] || 0) - 1);
                                             setSelectedVariations(curr);
                                          }} className="text-gray-500 hover:text-gray-900 px-2 font-bold">-</button>
                                          <span className="text-xs w-4 text-center font-bold text-[#007AFF]">{count}</span>
                                          <button onClick={() => {
                                             const curr = {...selectedVariations};
                                             if(!curr[vIdx]) curr[vIdx] = {};
                                             curr[vIdx][optIdx] = (curr[vIdx][optIdx] || 0) + 1;
                                             setSelectedVariations(curr);
                                          }} className="text-gray-500 hover:text-gray-900 px-2 font-bold">+</button>
                                       </div>
                                     </div>
                                  );
                              } else {
                                  return (
                                     <button key={optIdx} onClick={() => {
                                        const curr = {...selectedVariations};
                                        if(!curr[vIdx]) curr[vIdx] = {};
                                        curr[vIdx][optIdx] = curr[vIdx][optIdx] ? 0 : 1;
                                        setSelectedVariations(curr);
                                     }} className={`border px-4 py-2 rounded-lg font-bold text-xs transition-colors ${count ? 'border-[#007AFF] bg-blue-50 text-[#007AFF]' : 'border-gray-300 text-gray-600 hover:border-gray-400 hover:bg-gray-50'}`}>
                                       {opt} {priceAdd}
                                     </button>
                                  );
                              }
                           } else {
                              const isSelected = selectedVariations[vIdx]?.[optIdx] === 1;
                              return (
                                <button key={optIdx} onClick={() => {
                                   const curr = {...selectedVariations};
                                   curr[vIdx] = { [optIdx]: 1 };
                                   setSelectedVariations(curr);
                                }} className={`border px-4 py-2 rounded-lg font-bold text-xs transition-colors ${isSelected ? 'border-[#007AFF] bg-blue-50 text-[#007AFF]' : 'border-gray-300 text-gray-600 hover:border-gray-400 hover:bg-gray-50'}`}>
                                  {opt} {priceAdd}
                                </button>
                              );
                           }
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              <div className="flex flex-col gap-4 mt-auto">
                <div className="flex gap-2">
                  <button onClick={() => handleInteraction('like')} className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-red-50 hover:text-red-600 transition-colors" title="Curtir">
                     <Heart className="w-4 h-4" /> <span>Curtir</span>
                  </button>
                  <button onClick={() => handleInteraction('share')} className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-green-50 hover:text-green-600 transition-colors" title="Compartilhar">
                     <Share2 className="w-4 h-4" /> <span>Compartilhar</span>
                  </button>
                </div>
                <div className="flex gap-2">
                  <input 
                     type="text"
                     placeholder="Adicione um comentário..."
                     value={interactionText}
                     onChange={(e) => setInteractionText(e.target.value)}
                     className="flex-1 bg-white border border-gray-300 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-[#007AFF]/20 focus:border-[#007AFF] outline-none"
                  />
                  <button onClick={() => handleInteraction('comment', interactionText)} className="bg-[#1D1D1F] text-white px-4 rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-black transition-colors">
                     Enviar
                  </button>
                </div>
                <button onClick={() => handleAddToCart(selectedProduct)} className="w-full bg-[#007AFF] text-white py-4 rounded-xl uppercase text-xs tracking-[0.15em] font-bold hover:bg-blue-600 transition-all duration-300 shadow-md shadow-blue-500/20">
                  Adicionar à Sacola
                </button>
                <button 
                  onClick={() => setSelectedProduct(null)}
                  className="w-full bg-transparent border border-gray-300 text-gray-600 rounded-xl py-4 uppercase text-xs tracking-[0.15em] font-bold hover:border-gray-400 hover:text-gray-900 transition-all duration-300"
                >
                  Continuar Explorando
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
      </AnimatePresence>

      {/* Cart Drawer */}
      <AnimatePresence>
      {isCartOpen && (
        <div className="fixed inset-0 z-[120] flex justify-end">
           <div className="absolute inset-0 bg-black/40 backdrop-blur-sm cursor-pointer" onClick={() => setIsCartOpen(false)}></div>
           <motion.div 
             initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'tween' }}
             className="w-full md:w-[400px] h-full bg-white border-l border-gray-200 p-8 flex flex-col relative shadow-2xl"
           >
             <button onClick={() => setIsCartOpen(false)} className="absolute top-8 right-8 text-gray-500 hover:text-gray-900 bg-gray-100 rounded-full p-2 transition-colors">✕</button>
             <h2 className="font-serif text-3xl mb-8 text-gray-900 font-bold">Sacola</h2>
             
             <div className="flex-1 overflow-y-auto pr-2 pb-8 flex flex-col gap-6">
                {cartItems.length === 0 ? (
                  <p className="text-gray-500 text-sm italic">Sua sacola de compras está vazia.</p>
                ) : (
                  cartItems.map(item => (
                    <div key={item.cartItemId} className="flex gap-4 border-b border-gray-100 pb-4">
                       <img src={item.image} alt={item.name} className="w-20 h-28 object-cover rounded-md" />
                       <div className="flex-1 flex flex-col justify-center">
                          <h6 className="font-serif text-gray-900 line-clamp-1 font-bold">{item.name}</h6>
                          {item.chosenOptions && item.chosenOptions.length > 0 && (
                            <p className="text-[10px] font-bold text-gray-500 my-0.5 line-clamp-2">{item.chosenOptions.join(', ')}</p>
                          )}
                          <span className="font-sans text-xs text-gray-400 my-1 font-medium">Qtd: {item.quantity}</span>
                          <span className="font-sans text-[#007AFF] font-bold">R$ {item.finalPrice.toLocaleString('pt-BR')}</span>
                       </div>
                       <button 
                         onClick={() => setCartItems(cartItems.filter(i => i.cartItemId !== item.cartItemId))}
                         className="text-[10px] text-gray-400 hover:text-red-500 font-bold self-start mt-2 transition-colors uppercase tracking-widest"
                       >
                         Remover
                       </button>
                    </div>
                  ))
                )}
             </div>

             {cartItems.length > 0 && (
               <div className="border-t border-gray-200 pt-6 mt-auto bg-white">
                 <div className="flex justify-between items-center mb-6">
                    <span className="text-sm font-bold text-gray-500">Total Estimado</span>
                    <span className="text-lg text-[#1D1D1F] font-black">{calculateTotal()}</span>
                 </div>
                 
                 {orderStatus && (
                   <div className="mb-4 text-center text-xs text-[#007AFF] border border-blue-200 bg-blue-50 p-3 rounded-lg font-bold">{orderStatus}</div>
                 )}

                 <button onClick={handleCheckout} className="w-full bg-[#007AFF] text-white rounded-xl py-4 uppercase text-xs tracking-[0.15em] font-bold hover:bg-blue-600 transition-all duration-300 shadow-[0_4px_14px_rgba(0,122,255,0.39)]">
                   {user ? 'Finalizar Pedido' : 'Fazer Login e Finalizar'}
                 </button>
               </div>
             )}
           </motion.div>
        </div>
      )}
      </AnimatePresence>

      {/* Footer */}
      <footer id="footer" className="border-t border-gray-200 bg-white mt-auto">
        <div className="max-w-7xl mx-auto w-full px-6 md:px-12 py-20">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 md:gap-8 mb-20 text-[#1D1D1F]">
            <div className="md:col-span-2">
              <h2 className="font-serif text-3xl tracking-wide mb-8 font-bold text-[#007AFF]">VALENTINA</h2>
              <p className="font-sans text-sm text-gray-600 max-w-sm mb-8 font-medium">
                Assine nossa newsletter para receber convites exclusivos para lançamentos de coleções e eventos privados.
              </p>
              <div className="flex border-b border-gray-300 pb-2 max-w-sm focus-within:border-[#007AFF] transition-colors">
                <input 
                  type="email" 
                  placeholder="Seu endereço de e-mail" 
                  className="w-full bg-transparent outline-none text-sm placeholder:text-gray-400 font-medium"
                />
                <button className="text-xs font-bold uppercase tracking-widest text-[#007AFF] hover:text-blue-800 transition-colors">
                  Assinar
                </button>
              </div>
            </div>
            
            <div>
              <h6 className="font-sans text-xs uppercase tracking-widest font-bold mb-6 text-gray-400">Maison</h6>
              <ul className="space-y-4 font-sans text-sm font-medium text-gray-600">
                <li><a href="#" className="hover:text-[#007AFF] transition-colors">A Marca</a></li>
                <li><a href="#" className="hover:text-[#007AFF] transition-colors">Ateliê</a></li>
                <li><a href="#" className="hover:text-[#007AFF] transition-colors">Sustentabilidade</a></li>
                <li><a href="#" className="hover:text-[#007AFF] transition-colors">Carreiras</a></li>
              </ul>
            </div>

            <div>
              <h6 className="font-sans text-xs uppercase tracking-widest font-bold mb-6 text-gray-400">Serviços</h6>
              <ul className="space-y-4 font-sans text-sm font-medium text-gray-600">
                <li><a href="#" className="hover:text-[#007AFF] transition-colors">Entrega & Devoluções</a></li>
                <li><a href="#" className="hover:text-[#007AFF] transition-colors">Guia de Medidas</a></li>
                <li><a href="#" className="hover:text-[#007AFF] transition-colors">Personal Shopper</a></li>
                <li><a href="/" className="hover:text-[#007AFF] transition-colors font-bold text-[#007AFF]">Área do Lojista (Admin)</a></li>
              </ul>
            </div>
          </div>

          <div className="flex flex-col md:flex-row justify-between items-center pt-8 border-t border-gray-200 text-xs text-gray-500 font-bold uppercase tracking-widest">
            <p>&copy; 2026 VALENTINA. Todos os direitos reservados.</p>
            <div className="flex gap-6 mt-4 md:mt-0">
              <a href="#" className="hover:text-[#007AFF] transition-colors">Instagram</a>
              <a href="#" className="hover:text-[#007AFF] transition-colors">Pinterest</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/*" element={<AdminApp />} />
      <Route path="/loja/*" element={<Storefront />} />
    </Routes>
  );
}
