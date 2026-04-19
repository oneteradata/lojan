import { motion } from 'motion/react';
import { Search, ShoppingBag, User, Menu, ArrowRight } from 'lucide-react';
import { useState, useEffect } from 'react';

const products = [
  {
    id: 1,
    name: 'Vestido Seda Siena',
    price: 'R$ 2.450',
    image: 'https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&q=80&w=800'
  },
  {
    id: 2,
    name: 'Blazer Estruturado Noir',
    price: 'R$ 3.890',
    image: 'https://images.unsplash.com/photo-1604467794349-0b74285de7e7?auto=format&fit=crop&q=80&w=800'
  },
  {
    id: 3,
    name: 'Calça Alfaiataria Creme',
    price: 'R$ 1.680',
    image: 'https://images.unsplash.com/photo-1509631179647-0177331693ae?auto=format&fit=crop&q=80&w=800'
  },
  {
    id: 4,
    name: 'Trench Coat Clássico',
    price: 'R$ 5.200',
    image: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?auto=format&fit=crop&q=80&w=800'
  }
];

export default function App() {
  const [isScrolled, setIsScrolled] = useState(false);

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
          <a href="#" className="nav-link text-xs tracking-widest uppercase">Coleções</a>
          <a href="#" className="nav-link text-xs tracking-widest uppercase">Maison</a>
          <a href="#" className="nav-link text-xs tracking-widest uppercase">Editorial</a>
        </div>
        
        <div className="md:hidden">
          <Menu className="w-5 h-5" strokeWidth={1.5} />
        </div>

        <div className="absolute left-1/2 -translate-x-1/2">
          <h1 className="font-serif text-3xl tracking-wide">VALENTINA</h1>
        </div>

        <div className="flex gap-6 items-center">
          <Search className="w-4 h-4 cursor-pointer hover:opacity-70 transition-opacity" strokeWidth={1.5} />
          <User className="w-4 h-4 cursor-pointer hover:opacity-70 transition-opacity hidden md:block" strokeWidth={1.5} />
          <ShoppingBag className="w-4 h-4 cursor-pointer hover:opacity-70 transition-opacity" strokeWidth={1.5} />
        </div>
      </header>

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
          <button className="border border-white/20 hover:border-[#d4af37] text-white hover:text-[#d4af37] transition-colors duration-500 rounded-full px-8 py-3 text-xs uppercase tracking-widest">
            Descobrir Coleção
          </button>
        </motion.div>
      </section>

      {/* Introduction */}
      <section className="py-32 px-6 md:px-12 grid md:grid-cols-2 gap-16 items-center max-w-7xl mx-auto w-full">
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
      <section className="py-32 px-6 md:px-12 max-w-7xl mx-auto w-full">
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
            >
              <div className="overflow-hidden mb-4 relative aspect-[3/4]">
                <img 
                  src={product.image} 
                  alt={product.name} 
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-transparent group-hover:bg-white/10 transition-colors duration-500"></div>
              </div>
              <h5 className="font-serif text-lg text-white mb-1">{product.name}</h5>
              <p className="font-sans text-sm text-gray-400">{product.price}</p>
            </motion.div>
          ))}
        </div>
        
        <div className="mt-12 text-center md:hidden">
            <a href="#" className="inline-block border border-white/20 hover:border-[#d4af37] text-white hover:text-[#d4af37] transition-colors rounded-full px-8 py-3 text-xs tracking-widest uppercase">
              Ver Todas
            </a>
        </div>
      </section>

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
