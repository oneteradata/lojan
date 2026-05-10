import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Package, MapPin, CheckCircle, Clock, Search, QrCode, ArrowRight, Check } from 'lucide-react';
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
import { Html5QrcodeScanner } from 'html5-qrcode'; // We can install this

export function AdminDeliveries({ user }: { user: any }) {
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'pendente' | 'entregue'>('pendente');
  const [loading, setLoading] = useState(true);
  const [searchCode, setSearchCode] = useState('');
  const [scanning, setScanning] = useState(false);

  const fetchDeliveries = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/orders', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await res.json();
      if (data.success) {
        setDeliveries(data.sales || data.purchases || data || []);
      }
    } catch (e) {
    }
    setLoading(false);
  };

  useEffect(() => { fetchDeliveries(); }, []);

  const handleMarkAsDelivered = async (orderId: string) => {
    try {
       const res = await fetch(`/api/orders/${orderId}/status`, {
          method: 'PUT',
          headers: {
             'Content-Type': 'application/json',
             'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify({ status: 'Entregue' })
       });
       if(res.ok) {
          fetchDeliveries();
          setSearchCode('');
       }
    } catch (e) {
    }
  };

  const handleAcceptDelivery = async (orderId: string) => {
    try {
       const res = await fetch(`/api/orders/${orderId}/accept-delivery`, {
          method: 'PUT',
          headers: {
             'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
       });
       const data = await res.json();
       if(data.success) {
          fetchDeliveries();
       } else {
          alert(data.error);
       }
    } catch (e) {
       alert('Erro ao aceitar entrega');
    }
  };

  useEffect(() => {
    let scanner: Html5QrcodeScanner | null = null;
    let isMounted = true;

    if (scanning) {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
        .then((stream) => {
          if (!isMounted) {
            stream.getTracks().forEach(track => track.stop());
            return;
          }
          // Stop stream so scanner can take over
          stream.getTracks().forEach(track => track.stop());
          
          scanner = new Html5QrcodeScanner('reader', { qrbox: { width: 250, height: 250 }, fps: 5 }, false);
          scanner.render((decodedText) => {
             const match = decodedText.match(/\d+/);
             if(match) {
                setSearchCode(match[0]);
                setScanning(false);
                if (scanner) {
                   scanner.clear().catch(() => {});
                   scanner = null;
                }
             }
          }, (error) => {});
        })
        .catch((err) => {
          if (isMounted) {
             alert('Permissão de câmera negada ou câmera não encontrada.');
             setScanning(false);
          }
        });
        
      return () => {
         isMounted = false;
         if (scanner) {
            scanner.clear().catch(() => {});
         }
      };
    }
  }, [scanning]);

  const currentDeliveries = deliveries.filter(d => 
     (activeTab === 'pendente' ? d.status !== 'Entregue' : d.status === 'Entregue') &&
     (searchCode ? d.id.toString().includes(searchCode) : true)
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in zoom-in-95 duration-300 pb-24">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight text-[#1D1D1F]">Painel de Entregas</h2>
          <p className="text-sm text-[#86868B] mt-1">Gerencie e confirme as entregas da sua rota.</p>
        </div>
        <div className="flex bg-gray-100 p-1.5 rounded-2xl">
           <button onClick={() => setActiveTab('pendente')} className={cn("px-5 py-2.5 text-sm font-bold rounded-xl transition-all", activeTab === 'pendente' ? "bg-white text-[#1D1D1F] shadow-sm" : "text-[#86868B]")}>Pendentes</button>
           <button onClick={() => setActiveTab('entregue')} className={cn("px-5 py-2.5 text-sm font-bold rounded-xl transition-all", activeTab === 'entregue' ? "bg-white text-[#1D1D1F] shadow-sm" : "text-[#86868B]")}>Concluídas</button>
        </div>
      </div>
      
      <div className="bg-white rounded-3xl p-6 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.04)] border border-gray-100 flex flex-col sm:flex-row gap-4 items-center">
         <div className="relative flex-1 w-full">
           <Search className="w-5 h-5 absolute left-4 top-3.5 text-gray-400" />
           <input type="text" placeholder="Digite o número do pedido..." value={searchCode} onChange={e => setSearchCode(e.target.value)} className="w-full bg-gray-50 border-none rounded-2xl h-12 pl-12 pr-4 text-sm font-bold placeholder:font-medium focus:ring-2 focus:ring-[#007AFF] outline-none transition-all" />
         </div>
         <button onClick={() => setScanning(!scanning)} className="h-12 w-full sm:w-auto px-6 bg-[#1a1b1f] text-white font-extrabold text-[11px] uppercase tracking-widest rounded-2xl flex items-center justify-center gap-2 hover:bg-black transition-colors shadow-lg">
            <QrCode className="w-5 h-5" /> <span>{scanning ? 'Cancelar' : 'Escanear QR'}</span>
         </button>
      </div>

      {scanning && (
         <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 overflow-hidden">
            <div id="reader" className="w-full max-w-md mx-auto"></div>
         </div>
      )}
      
      {currentDeliveries.length === 0 ? (
         <div className="bg-[#F5F5F7] rounded-[32px] p-12 text-center flex flex-col items-center">
            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-6 shadow-sm">
               <Package className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-xl font-bold mb-2">Nenhuma entrega encontrada.</h3>
            <p className="text-sm text-gray-500">Volte mais tarde ou verifique os filtros.</p>
         </div>
      ) : (
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {currentDeliveries.map(d => (
               <div key={d.id} className="bg-white p-6 rounded-[2rem] shadow-[0_10px_40px_-10px_rgba(0,0,0,0.04)] border border-gray-100 hover:shadow-xl transition-all relative overflow-hidden group">
                  {d.status === 'Entregue' && <div className="absolute top-0 left-0 w-full h-1 bg-green-500" />}
                  {d.status !== 'Entregue' && <div className="absolute top-0 left-0 w-full h-1 bg-orange-400" />}

                  <div className="flex justify-between items-start mb-4 mt-2">
                     <div>
                        <span className="text-[10px] font-extrabold uppercase tracking-widest text-gray-400">ID #{d.id}</span>
                        <h4 className="font-bold text-lg mt-1 truncate">{d.delivery_user_id ? (d.customer_name || 'Desconhecido') : 'Pedido Disponível'}</h4>
                     </div>
                     <span className={cn("px-3 py-1.5 rounded-xl text-[10px] font-extrabold uppercase", d.status === 'Entregue' ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700")}>{d.status}</span>
                  </div>
                  
                  <div className="space-y-3 mb-6">
                     {!d.delivery_user_id ? (
                        <div className="flex flex-col gap-3">
                           <div className="flex gap-3 items-start">
                              <div className="p-2 bg-gray-50 rounded-xl text-gray-400 shrink-0"><Package className="w-4 h-4" /></div>
                              <p className="text-xs font-medium text-gray-600 leading-relaxed">Coleta: Bairro {d.seller_bairro || 'Desconhecido'}</p>
                           </div>
                           <div className="flex gap-3 items-start">
                              <div className="p-2 bg-gray-50 rounded-xl text-gray-400 shrink-0"><MapPin className="w-4 h-4" /></div>
                              <p className="text-xs font-medium text-gray-600 leading-relaxed">Entrega: Bairro {d.bairro || 'Desconhecido'}</p>
                           </div>
                        </div>
                     ) : d.endereco && (
                        <div className="flex gap-3 items-start">
                           <div className="p-2 bg-gray-50 rounded-xl text-gray-400 shrink-0"><MapPin className="w-4 h-4" /></div>
                           <p className="text-xs font-medium text-gray-600 leading-relaxed">{d.endereco}, {d.numero}<br/>{d.bairro} - {d.cidade}</p>
                        </div>
                     )}
                     <div className="flex gap-3 items-center">
                        <div className="p-2 bg-gray-50 rounded-xl text-gray-400 shrink-0"><Clock className="w-4 h-4" /></div>
                        <p className="text-xs font-medium text-gray-600">{new Date(d.created_at).toLocaleString('pt-BR')}</p>
                     </div>
                  </div>

                  {d.status !== 'Entregue' && (
                     d.delivery_user_id ? (
                        <button onClick={() => handleMarkAsDelivered(d.id)} className="w-full py-4 bg-[#007AFF] text-white rounded-2xl font-extrabold text-[11px] uppercase tracking-widest hover:bg-[#0066cc] shadow-lg shadow-[#007AFF]/20 transition-all flex items-center justify-center gap-2">
                           <Check className="w-4 h-4" />
                           Confirmar Entrega
                        </button>
                     ) : (
                        <button onClick={() => handleAcceptDelivery(d.id)} className="w-full py-4 bg-orange-500 text-white rounded-2xl font-extrabold text-[11px] uppercase tracking-widest hover:bg-orange-600 shadow-lg shadow-orange-500/20 transition-all flex items-center justify-center gap-2">
                           <Package className="w-4 h-4" />
                           Aceitar Entrega
                        </button>
                     )
                  )}
               </div>
            ))}
         </div>
      )}
    </div>
  )
}
