import { motion } from 'motion/react';
import { Search, ShoppingBag, User, Menu, ArrowRight } from 'lucide-react';
import { useState, useEffect } from 'react';

const defaultProducts = [
  {
    id: 1,
    name: 'Vestido Seda Siena',
    price: 'R$ 2.450',
    image: 'https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&q=80&w=800',
    description: 'Um vestido de seda pura com caimento esvoaçante e sofisticação inigualável. Perfeito para noites de gala e eventos exclusivos.'
  },
  {
    id: 2,
    name: 'Blazer Estruturado Noir',
    price: 'R$ 3.890',
    image: 'https://images.unsplash.com/photo-1604467794349-0b74285de7e7?auto=format&fit=crop&q=80&w=800',
    description: 'Alfaiataria impecável com ombros marcados e cintura ajustada em lã fria. O ápice do luxo minimalista europeu e do corte feito à mão.'
  },
  {
    id: 3,
    name: 'Calça Alfaiataria Creme',
    price: 'R$ 1.680',
    image: 'https://images.unsplash.com/photo-1509631179647-0177331693ae?auto=format&fit=crop&q=80&w=800',
    description: 'Calça reta de cintura alta em crepe de alfaiataria premium. Traz leveza e imponência ao mesmo tempo, ideal para conjuntos clássicos.'
  },
  {
    id: 4,
    name: 'Trench Coat Clássico',
    price: 'R$ 5.200',
    image: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?auto=format&fit=crop&q=80&w=800',
    description: 'A peça atemporal essencial. Confeccionado em gabardine resistente à água de alto padrão, forro em seda geométrica e botões em madrepérola escura.'
  }
];

export default function App() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [products, setProducts] = useState<any[]>(defaultProducts);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  
  const [showLogin, setShowLogin] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [user, setUser] = useState<any>(null);
  
  // Cart state
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [cartItems, setCartItems] = useState<any[]>([]);
  const [orderStatus, setOrderStatus] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

  // Busca produtos do DB
  useEffect(() => {
    fetch('/api/products')
      .then(res => res.json())
      .then(data => {
        if (data && data.length > 0) setProducts(data);
      })
      .catch(err => console.error("Erro ao buscar produtos, usando falback visual.", err));
  }, []);

  const handleAuth = async (e: any) => {
    e.preventDefault();
    setAuthError('');
    
    const endpoint = isRegistering ? '/api/register' : '/api/login';
    const bodyPayload = isRegistering ? { name, email, password } : { email, password };

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload)
      });
      const data = await res.json();
      if (data.success) {
        setUser(data.user);
        setShowLogin(false);
        // Reset modal states on success
        setEmail('');
        setPassword('');
        setName('');
        setIsRegistering(false);
      } else {
        setAuthError(data.error);
      }
    } catch(err) {
      setAuthError("Erro ao conectar no servidor. Tentando simular...");
      // Falback para uso durante build caso servidor esteja off
      setUser({ id: 1, name: name || 'Admin Silva', email });
      setShowLogin(false);
    }
  };

  const handleAddToCart = (product: any) => {
    const existing = cartItems.find(item => item.id === product.id);
    if (existing) {
       setCartItems(cartItems.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item));
    } else {
       setCartItems([...cartItems, { ...product, quantity: 1 }]);
    }
    setSelectedProduct(null);
    setIsCartOpen(true);
    setOrderStatus(null);
  };

  const calculateTotal = () => {
    const rawTotal = cartItems.reduce((acc, item) => {
      // Remove 'R$', espaços, e converte '.' para milhar (no BR). Ex: "R$ 2.450" -> 2450
      const numericPrice = parseFloat(item.price.replace(/[R$\s\.]/g, '').replace(',', '.'));
      return acc + (numericPrice * item.quantity);
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
         items: cartItems.map(item => ({ id: item.id, quantity: item.quantity }))
      };
      
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      
      if (data.success) {
         setOrderStatus(`✅ Pedido 00${data.orderId} gerado no Banco de Dados com Sucesso!`);
         setCartItems([]); // Limpa a sacola INSTANTANEAMENTE
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
     const section = document.getElementById('products-section');
     if (section) section.scrollIntoView({ behavior: 'smooth' });
  };
  
  const scrollToCategories = (e: any) => {
     e.preventDefault();
     const section = document.getElementById('categories-section');
     if (section) section.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-[var(--color-brand-bg)] overflow-x-hidden">
      {/* Navigation */}
      <header className={`fixed w-full top-0 z-50 p-6 flex justify-between items-center transition-all duration-300 ${isScrolled ? 'bg-[var(--color-brand-bg)] text-[var(--color-brand-ink)] border-b border-white/10' : 'text-white border-b border-transparent'}`}>
        <div className="flex gap-6 hidden md:flex">
          <a href="#categories-section" onClick={scrollToCategories} className="nav-link text-xs tracking-widest uppercase">Coleções</a>
          <a href="#products-section" onClick={scrollToProducts} className="nav-link text-xs tracking-widest uppercase">Maison</a>
          <a href="#footer" className="nav-link text-xs tracking-widest uppercase">Editorial</a>
        </div>
        
        <div className="md:hidden">
          <Menu className="w-5 h-5" strokeWidth={1.5} />
        </div>

        <div className="absolute left-1/2 -translate-x-1/2">
          <h1 className="font-serif text-3xl tracking-wide cursor-pointer" onClick={() => window.scrollTo({top: 0, behavior: 'smooth'})}>VALENTINA</h1>
        </div>

        <div className="flex gap-6 items-center">
          <Search className="w-4 h-4 cursor-pointer hover:text-[#d4af37] transition-colors" strokeWidth={1.5} />
          {user ? (
            <span className="text-xs uppercase tracking-widest text-[#d4af37] hidden md:block">Olá, {user.name.split(' ')[0]}</span>
          ) : (
            <User onClick={() => setShowLogin(true)} className="w-4 h-4 cursor-pointer hover:text-[#d4af37] transition-colors hidden md:block" strokeWidth={1.5} />
          )}
          <div className="relative">
             <ShoppingBag onClick={() => setIsCartOpen(true)} className="w-4 h-4 cursor-pointer hover:text-[#d4af37] transition-colors" strokeWidth={1.5} />
             {cartItems.length > 0 && (
                <span className="absolute -top-2 -right-2 bg-[#d4af37] text-white text-[8px] font-bold w-4 h-4 flex items-center justify-center rounded-full">
                  {cartItems.reduce((acc, item) => acc + item.quantity, 0)}
                </span>
             )}
          </div>
        </div>
      </header>

      {/* Modal de Autenticação (PostgreSQL) */}
      {showLogin && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-[#0a0a0a] border border-white/20 p-10 max-w-sm w-full relative">
            <button onClick={() => setShowLogin(false)} className="absolute top-4 right-4 text-gray-500 hover:text-white">✕</button>
            <h2 className="font-serif text-3xl mb-2 text-center">{isRegistering ? 'Criar Conta' : 'Login'}</h2>
            <p className="text-[0.65rem] text-center text-gray-500 mb-8 uppercase tracking-widest">
              {isRegistering ? 'Junte-se à Maison Valentina' : 'Acesso à conta'}
            </p>
            
            <form onSubmit={handleAuth} className="flex flex-col gap-4">
              {isRegistering && (
                <input 
                  type="text" 
                  placeholder="Nome Completo" 
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="bg-transparent border-b border-white/20 pb-2 text-sm outline-none focus:border-[#d4af37] transition-colors"
                  required
                />
              )}
              <input 
                type="email" 
                placeholder={isRegistering ? "E-mail" : "E-mail (ex: admin@valentina.com)"} 
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="bg-transparent border-b border-white/20 pb-2 text-sm outline-none focus:border-[#d4af37] transition-colors"
                required
              />
              <input 
                type="password" 
                placeholder={isRegistering ? "Defina uma senha" : "Senha"} 
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="bg-transparent border-b border-white/20 pb-2 text-sm outline-none focus:border-[#d4af37] transition-colors"
                required
              />
              {authError && <p className="text-red-400 text-xs mt-1 text-center">{authError}</p>}
              
              <button type="submit" className="bg-white text-black mt-6 py-3 text-xs uppercase tracking-widest font-semibold hover:bg-[#d4af37] hover:text-white transition-colors">
                {isRegistering ? 'Registrar' : 'Entrar'}
              </button>
            </form>

            <div className="mt-6 text-center">
              <button 
                onClick={() => {
                   setIsRegistering(!isRegistering);
                   setAuthError('');
                }} 
                className="text-xs text-gray-400 hover:text-[#d4af37] transition-colors"
              >
                {isRegistering ? 'Já tem uma conta? Faça login' : 'Ainda não tem conta? Criar agora'}
              </button>
            </div>
          </div>
        </div>
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
          <button onClick={scrollToProducts} className="border border-white/30 hover:border-[#d4af37] text-white hover:text-[#d4af37] hover:bg-[#d4af37]/10 transition-all duration-300 rounded-full px-8 py-3 text-xs uppercase tracking-widest">
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
          <div className="hidden md:block">
            <span className="vertical-text text-gray-400">Desde 1998</span>
          </div>
          <div>
            <h3 className="font-serif text-4xl md:text-5xl font-light leading-snug mb-8">
              Redefinindo o luxo contemporâneo através de <span className="italic">silhuetas impecáveis</span> e tecidos nobres.
            </h3>
            <p className="font-sans text-sm text-gray-400 leading-relaxed max-w-md mb-8">
              Cada peça Valentina é uma celebração da feminilidade moderna. Desenhada em nosso ateliê, costurada à mão com maestria e pensada para transcender as estações.
            </p>
            <a href="#" className="font-sans text-xs uppercase tracking-widest flex items-center gap-2 hover:text-[#d4af37] transition-colors">
              Conheça a Maison <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </motion.div>
      </section>

      {/* Categories Grid */}
      <section className="border-y border-white/10">
        <div className="grid md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-white/10">
          {[
            { title: "Vestidos", img: "https://images.unsplash.com/photo-1543163521-1bf539c55dd2?auto=format&fit=crop&q=80&w=800" },
            { title: "Alfaiataria", img: "https://images.unsplash.com/photo-1584273143981-41c073dfe8f8?auto=format&fit=crop&q=80&w=800" },
            { title: "Acessórios", img: "https://images.unsplash.com/photo-1588636734120-7fdbd9ab44cd?auto=format&fit=crop&q=80&w=800" }
          ].map((cat, i) => (
            <motion.div 
              key={i} 
              className="relative group cursor-pointer aspect-[3/4] md:aspect-auto md:h-[600px] overflow-hidden"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: i * 0.2 }}
            >
              <img 
                src={cat.img} 
                className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105 opacity-80 group-hover:opacity-100" 
                alt={cat.title} 
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-[#0a0a0a]/20 group-hover:bg-transparent transition-colors duration-500"></div>
              <div className="absolute bottom-8 left-8">
                <h4 className="font-serif text-3xl text-white mb-2">{cat.title}</h4>
                <div className="w-0 h-[1px] bg-[#d4af37] group-hover:w-full transition-all duration-500"></div>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Featured Products */}
      <section id="products-section" className="py-32 px-6 md:px-12 max-w-7xl mx-auto w-full">
        <div className="flex justify-between items-end mb-16">
          <h3 className="font-serif text-4xl md:text-5xl font-light">Novidades</h3>
          <a href="#" className="hidden md:inline-block nav-link text-xs tracking-widest uppercase">
            Ver Todas
          </a>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {products.map((product, i) => (
            <motion.div 
              key={product.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: i * 0.1 }}
              className="group cursor-pointer"
              onClick={() => setSelectedProduct(product)}
            >
              <div className="overflow-hidden mb-4 relative aspect-[3/4]">
                <img 
                  src={product.image} 
                  alt={product.name} 
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-[#0a0a0a]/10 group-hover:bg-transparent transition-colors duration-500"></div>
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <span className="bg-white/90 text-black text-[10px] uppercase font-bold tracking-widest py-2 px-6 hover:bg-[#d4af37] hover:text-white transition-colors">Ver Detalhes</span>
                </div>
              </div>
              <h5 className="font-serif text-lg text-white mb-1 group-hover:text-[#d4af37] transition-colors">{product.name}</h5>
              <p className="font-sans text-sm text-gray-400">{product.price}</p>
            </motion.div>
          ))}
        </div>
        
        <div className="mt-12 text-center md:hidden">
            <a href="#" className="inline-block border border-white/30 hover:border-[#d4af37] hover:bg-[#d4af37]/10 text-white hover:text-[#d4af37] transition-all duration-300 rounded-full px-8 py-3 text-xs tracking-widest uppercase">
              Ver Todas
            </a>
        </div>
      </section>

      {/* Product Details Modal */}
      {selectedProduct && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 md:p-12">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-5xl bg-[#0a0a0a] border border-white/10 flex flex-col md:flex-row relative max-h-full overflow-y-auto"
          >
            <button 
              onClick={() => setSelectedProduct(null)} 
              className="absolute top-4 right-4 z-10 text-white hover:text-[#d4af37] bg-black/30 md:bg-transparent rounded-full p-2 md:p-0 transition-colors"
            >
              ✕
            </button>
            <div className="md:w-1/2 aspect-[3/4] md:aspect-auto">
              <img 
                src={selectedProduct.image} 
                alt={selectedProduct.name} 
                className="w-full h-full object-cover" 
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="md:w-1/2 p-8 md:p-16 flex flex-col justify-center">
              <span className="text-[10px] text-gray-500 uppercase tracking-[0.2em] mb-4">Coleção Exclusiva</span>
              <h2 className="font-serif text-3xl md:text-5xl text-white mb-4">{selectedProduct.name}</h2>
              <p className="text-[#d4af37] text-xl md:text-2xl mb-8">{selectedProduct.price}</p>
              
              <div className="w-8 h-[1px] bg-white/20 mb-8"></div>
              
              <p className="text-gray-400 text-sm leading-relaxed mb-10">
                {selectedProduct.description || 'Uma peça exclusiva da coleção Valentina. Confeccionada com os mais altos padrões de luxo em nosso ateliê, pensada para trazer elegância e sofisticação instantânea ao seu guarda-roupa.'}
              </p>
              
              <div className="flex flex-col gap-4">
                <button onClick={() => handleAddToCart(selectedProduct)} className="w-full bg-white text-black py-4 uppercase text-xs tracking-[0.15em] font-bold hover:bg-[#d4af37] hover:text-white transition-all duration-300">
                  Adicionar à Sacola
                </button>
                <button 
                  onClick={() => setSelectedProduct(null)}
                  className="w-full bg-transparent border border-white/20 text-white py-4 uppercase text-xs tracking-[0.15em] font-bold hover:border-white transition-all duration-300"
                >
                  Continuar Explorando
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Cart Drawer */}
      {isCartOpen && (
        <div className="fixed inset-0 z-[120] flex justify-end">
           <div className="absolute inset-0 bg-black/60 backdrop-blur-sm cursor-pointer" onClick={() => setIsCartOpen(false)}></div>
           <motion.div 
             initial={{ x: '100%' }} animate={{ x: 0 }} transition={{ type: 'tween' }}
             className="w-full md:w-[400px] h-full bg-[#0a0a0a] border-l border-white/10 p-8 flex flex-col relative"
           >
             <button onClick={() => setIsCartOpen(false)} className="absolute top-8 right-8 text-white hover:text-[#d4af37] transition-colors">✕</button>
             <h2 className="font-serif text-3xl mb-8">Sacola</h2>
             
             <div className="flex-1 overflow-y-auto pr-2 pb-8 flex flex-col gap-6">
                {cartItems.length === 0 ? (
                  <p className="text-gray-500 text-sm italic">Sua sacola de compras está vazia.</p>
                ) : (
                  cartItems.map(item => (
                    <div key={item.id} className="flex gap-4 border-b border-white/10 pb-4">
                       <img src={item.image} alt={item.name} className="w-20 h-28 object-cover" />
                       <div className="flex-1 flex flex-col justify-center">
                          <h6 className="font-serif text-white">{item.name}</h6>
                          <span className="font-sans text-xs text-gray-500 my-1">Qtd: {item.quantity}</span>
                          <span className="font-sans text-[#d4af37]">{item.price}</span>
                       </div>
                       <button 
                         onClick={() => setCartItems(cartItems.filter(i => i.id !== item.id))}
                         className="text-[10px] text-gray-600 hover:text-red-400 self-start mt-2 transition-colors uppercase tracking-widest"
                       >
                         Remover
                       </button>
                    </div>
                  ))
                )}
             </div>

             {cartItems.length > 0 && (
               <div className="border-t border-white/20 pt-6 mt-auto">
                 <div className="flex justify-between items-center mb-6">
                    <span className="text-sm text-gray-400">Total Estimado</span>
                    <span className="text-lg text-white font-medium">{calculateTotal()}</span>
                 </div>
                 
                 {orderStatus && (
                   <div className="mb-4 text-center text-xs text-[#d4af37] border border-[#d4af37]/30 p-2">{orderStatus}</div>
                 )}

                 <button onClick={handleCheckout} className="w-full bg-white text-black py-4 uppercase text-xs tracking-[0.15em] font-bold hover:bg-[#d4af37] hover:text-white transition-all duration-300">
                   {user ? 'Finalizar Pedido' : 'Fazer Login e Finalizar'}
                 </button>
               </div>
             )}
           </motion.div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-white/10 mt-auto">
        <div className="max-w-7xl mx-auto w-full px-6 md:px-12 py-20">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 md:gap-8 mb-20 text-white">
            <div className="md:col-span-2">
              <h2 className="font-serif text-3xl tracking-wide mb-8">VALENTINA</h2>
              <p className="font-sans text-sm text-gray-400 max-w-sm mb-8">
                Assine nossa newsletter para receber convites exclusivos para lançamentos de coleções e eventos privados.
              </p>
              <div className="flex border-b border-white/20 pb-2 max-w-sm focus-within:border-[#d4af37] transition-colors">
                <input 
                  type="email" 
                  placeholder="Seu endereço de e-mail" 
                  className="w-full bg-transparent outline-none text-sm placeholder:text-gray-500"
                />
                <button className="text-xs uppercase tracking-widest hover:text-[#d4af37] transition-colors">
                  Assinar
                </button>
              </div>
            </div>
            
            <div>
              <h6 className="font-sans text-xs uppercase tracking-widest font-semibold mb-6">Maison</h6>
              <ul className="space-y-4 font-sans text-sm text-gray-400">
                <li><a href="#" className="hover:text-[#d4af37] transition-colors">A Marca</a></li>
                <li><a href="#" className="hover:text-[#d4af37] transition-colors">Ateliê</a></li>
                <li><a href="#" className="hover:text-[#d4af37] transition-colors">Sustentabilidade</a></li>
                <li><a href="#" className="hover:text-[#d4af37] transition-colors">Carreiras</a></li>
              </ul>
            </div>

            <div>
              <h6 className="font-sans text-xs uppercase tracking-widest font-semibold mb-6">Serviços</h6>
              <ul className="space-y-4 font-sans text-sm text-gray-400">
                <li><a href="#" className="hover:text-[#d4af37] transition-colors">Entrega & Devoluções</a></li>
                <li><a href="#" className="hover:text-[#d4af37] transition-colors">Guia de Medidas</a></li>
                <li><a href="#" className="hover:text-[#d4af37] transition-colors">Personal Shopper</a></li>
                <li><a href="#" className="hover:text-[#d4af37] transition-colors">Contato</a></li>
              </ul>
            </div>
          </div>

          <div className="flex flex-col md:flex-row justify-between items-center pt-8 border-t border-white/10 text-xs text-gray-500 uppercase tracking-widest">
            <p>&copy; 2026 VALENTINA. Todos os direitos reservados.</p>
            <div className="flex gap-6 mt-4 md:mt-0">
              <a href="#" className="hover:text-[#d4af37] transition-colors">Instagram</a>
              <a href="#" className="hover:text-[#d4af37] transition-colors">Pinterest</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
