import React, { useState, useEffect } from 'react';
import { Bell, ShieldAlert, Lock, ArrowRight, Check, X, Eye, RefreshCw, Trash } from 'lucide-react';
import { apiFetch } from '../utils';

interface NotificationPanelProps {
  onClose: () => void;
  onClear?: () => void;
}

export function NotificationPanel({ onClose, onClear }: NotificationPanelProps) {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [selectedNotif, setSelectedNotif] = useState<any | null>(null);
  const [password, setPassword] = useState('');
  const [notifDetails, setNotifDetails] = useState<any | null>(null);
  const [authError, setAuthError] = useState('');
  const [reading, setReading] = useState(false);

  useEffect(() => {
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/notifications');
      const data = await res.json();
      if (data.success && Array.isArray(data.notifications)) {
        setNotifications(data.notifications);
      }
    } catch (err) {
      console.error('Erro ao buscar notificações:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleReadNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setReading(true);
    setAuthError('');
    try {
      const res = await apiFetch(`/api/notifications/${selectedNotif.id}/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await res.json();
      if (data.success && data.notification) {
        setNotifDetails(data.notification);
        setPassword('');
      } else {
        setAuthError(data.error || 'Erro de autenticação para leitura.');
      }
    } catch (err: any) {
      setAuthError('Falha ao comunicar com o servidor.');
    } finally {
      setReading(false);
    }
  };

  const handleClearNotifications = async () => {
    if (!window.confirm("Deseja realmente limpar todas as suas notificações?")) return;
    setClearing(true);
    try {
      const res = await apiFetch('/api/notifications/clear', {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success) {
        setNotifications([]);
        setSelectedNotif(null);
        setNotifDetails(null);
        if (onClear) onClear();
      } else {
        alert(data.error || 'Erro ao limpar notificações.');
      }
    } catch (err) {
      console.error(err);
      alert('Erro ao se conectar para limpar notificações.');
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[90] flex items-center justify-end animate-fade-in text-left">
      <div className="absolute inset-0" onClick={onClose} />
      
      <div className="bg-white w-full max-w-md h-full shadow-2xl relative z-10 p-6 flex flex-col justify-between overflow-y-auto animate-slide-in font-sans">
        <div>
          {/* Header */}
          <div className="flex items-center justify-between border-b pb-4 mb-6">
            <div className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-[#007AFF]" />
              <h3 className="font-extrabold text-base uppercase text-gray-900 leading-none">Notificações</h3>
            </div>
            <button onClick={onClose} className="p-1 px-2.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-900 transition-colors">
              ✕
            </button>
          </div>

          {/* List or Detail view */}
          {selectedNotif ? (
            <div className="space-y-6">
              <button 
                onClick={() => { setSelectedNotif(null); setNotifDetails(null); setPassword(''); setAuthError(''); }}
                className="text-xs font-bold text-[#007AFF] hover:underline flex items-center gap-1"
              >
                ← Voltar para a lista
              </button>

              <div className="border border-gray-100 rounded-3xl p-5 bg-[#faf9fe]">
                <h4 className="font-bold text-gray-900 text-sm mb-2">{selectedNotif.title}</h4>
                <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">
                  Postada em: {new Date(selectedNotif.created_at).toLocaleString('pt-BR')}
                </p>
              </div>

              {notifDetails ? (
                /* Message Decrypted */
                <div className="space-y-4">
                  <div className="p-5 bg-white border border-gray-200 rounded-3xl text-sm font-semibold text-gray-850 leading-relaxed min-h-24 whitespace-pre-wrap">
                    {notifDetails.message}
                  </div>
                  
                  <div className="p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl flex items-center gap-3">
                    <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                    <div>
                      <p className="text-[10px] font-black uppercase text-emerald-500 tracking-wider">Leitura Autorizada</p>
                      <p className="text-[9px] text-[#86868B] font-semibold leading-relaxed">
                        Identidade re-validada com sucesso para visualização de conteúdo seguro.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                /* Password Re-auth Check required */
                <div className="space-y-4">
                  <div className="p-4 bg-amber-500/5 border border-amber-500/10 rounded-2xl flex items-start gap-3">
                    <Lock className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[10px] font-black uppercase text-amber-500 tracking-wider mb-0.5">Autorização Necessária</p>
                      <p className="text-[9px] text-[#86868B] font-semibold leading-relaxed">
                        Conforme política de privacidade do sistema, você deve digitar sua senha de acesso para liberar esta notificação.
                      </p>
                    </div>
                  </div>

                  <form onSubmit={handleReadNotification} className="space-y-4">
                    <div>
                      <label className="text-[10px] font-black opacity-50 uppercase pl-1 block mb-1">Digite sua senha de login</label>
                      <input 
                        type="password" 
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="Sua senha de login"
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:border-[#007AFF]/25 focus:bg-white"
                        autoFocus
                      />
                    </div>

                    {authError && (
                      <p className="text-[10px] text-red-500 font-black uppercase tracking-wider">{authError}</p>
                    )}

                    <button 
                      type="submit" 
                      disabled={reading || !password}
                      className="w-full bg-[#007AFF] hover:bg-blue-600 disabled:opacity-50 text-white font-black py-3 rounded-xl shadow-md transition-all text-sm uppercase tracking-widest flex items-center justify-center gap-2"
                    >
                      {reading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                      AUTORIZAR LEITURA
                    </button>
                  </form>
                </div>
              )}
            </div>
          ) : (
            /* Notification List */
            <div className="space-y-3">
              {notifications.length > 0 && (
                <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-100">
                  <span className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest">
                    {notifications.length} {notifications.length === 1 ? 'NOTIF' : 'NOTIFS'}
                  </span>
                  <button 
                    onClick={handleClearNotifications}
                    disabled={clearing}
                    className="text-[10px] font-bold uppercase tracking-wider text-red-500 hover:text-red-600 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-full transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Trash className="w-3 h-3" />
                    Limpar notificações
                  </button>
                </div>
              )}
              {loading ? (
                <div className="py-12 flex items-center justify-center">
                  <RefreshCw className="w-6 h-6 animate-spin text-gray-300" />
                </div>
              ) : notifications.length === 0 ? (
                <div className="py-16 text-center text-gray-400 font-sans">
                  <Bell className="w-8 h-8 mx-auto stroke-1 text-gray-300 mb-3" />
                  <p className="text-xs font-bold uppercase tracking-wider">Nenhuma notificação encontrada</p>
                </div>
              ) : (
                notifications.map((notif: any) => (
                  <div 
                    key={notif.id}
                    onClick={() => setSelectedNotif(notif)}
                    className="p-5 border border-gray-100 hover:border-gray-200 bg-white hover:bg-gray-50 cursor-pointer rounded-2xl flex items-start gap-4 transition-all hover:scale-[1.01] shadow-sm text-left"
                  >
                    <div className="w-2.5 h-2.5 bg-[#007AFF] rounded-full shrink-0 mt-1.5" />
                    <div>
                      <h4 className="font-bold text-gray-900 text-xs mb-1 hover:text-[#007AFF] transition-colors">{notif.title}</h4>
                      <div className="flex items-center gap-2">
                        <span className="text-[8px] font-black uppercase text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                          {notif.is_generic ? 'Geral' : 'Privada'}
                        </span>
                        <span className="text-[9px] text-[#86868B] font-semibold">
                          {new Date(notif.created_at).toLocaleDateString('pt-BR')}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div className="text-center pt-8 border-t text-[10px] text-gray-400 font-semibold tracking-wider">
          VITRINE SEGURA — AUTENTICAÇÃO DUPLA
        </div>
      </div>
    </div>
  );
}
