import React, { useState, useEffect } from 'react';
import { Save, RefreshCw, DollarSign, Database, Activity, Trash2, Mail, ShieldAlert, Lock, Info, Users, Package } from 'lucide-react';
import { apiFetch } from './utils';

export function GlobalSettings() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // --- NOTIFICATION STATE ---
  const [notifTitle, setNotifTitle] = useState('');
  const [notifMessage, setNotifMessage] = useState('');
  const [notifTargetType, setNotifTargetType] = useState('all'); // all, last_login, user
  const [notifTargetUserId, setNotifTargetUserId] = useState('');
  const [sendingNotif, setSendingNotif] = useState(false);

  // --- CLEANUP STATE ---
  const [cleanupType, setCleanupType] = useState<'users' | 'products' | 'orders' | 'logs' | 'wallets' | 'all'>('products');
  const [cleanupIdsText, setCleanupIdsText] = useState(''); // selective comma separated IDs
  const [cleanupPassword, setCleanupPassword] = useState('');
  const [isCleanupModalOpen, setIsCleanupModalOpen] = useState(false);
  const [executingCleanup, setExecutingCleanup] = useState(false);

  const handleSendNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notifTitle || !notifMessage) {
      alert('Favor preencher o título e a mensagem da notificação.');
      return;
    }
    setSendingNotif(true);
    try {
      const res = await apiFetch('/api/admin/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: notifTitle,
          message: notifMessage,
          targetType: notifTargetType,
          targetUserId: notifTargetUserId ? parseInt(notifTargetUserId) : null
        })
      });
      const data = await res.json();
      if (data.success) {
        alert('Notificação enviada com sucesso para os destinatários!');
        setNotifTitle('');
        setNotifMessage('');
        setNotifTargetType('all');
        setNotifTargetUserId('');
      } else {
        alert('Erro ao enviar notificação: ' + data.error);
      }
    } catch (err: any) {
      alert('Erro de comunicação com o servidor: ' + err.message);
    } finally {
      setSendingNotif(false);
    }
  };

  const handleExecuteCleanup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cleanupPassword) {
      alert('A senha de administrador é obrigatória.');
      return;
    }
    
    // Parse target IDs if provided
    let ids: number[] | null = null;
    if (cleanupIdsText.trim()) {
      ids = cleanupIdsText.split(',').map(v => parseInt(v.trim())).filter(v => !isNaN(v));
    }

    setExecutingCleanup(true);
    try {
      const res = await apiFetch('/api/admin/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: cleanupType,
          ids,
          password: cleanupPassword
        })
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message || 'Limpeza realizada com sucesso!');
        setCleanupPassword('');
        setCleanupIdsText('');
        setIsCleanupModalOpen(false);
      } else {
        alert('Erro na limpeza: ' + data.error);
      }
    } catch (err: any) {
      alert('Erro de rede ao executar limpeza: ' + err.message);
    } finally {
      setExecutingCleanup(false);
    }
  };
  
  const [settings, setSettings] = useState({
    cost_7d_amount: 1,
    cost_7d_type: 128,
    cost_30d_amount: 2,
    cost_30d_type: 256,
    product_token_cost_amount: 1,
    product_token_cost_type: 128,
    token_costs: {
      "16": 0, "32": 0, "64": 0, "128": 0, "256": 0, "512": 0, "1024": 0, "2048": 0, "4096": 0
    },
    withdrawal_cost_4096: 0,
    withdrawal_cost_2048: 0,
    conversion_cost: 0
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/settings');
      const data = await res.json();
      if (data.success && data.settings) {
        const s = data.settings;
        setSettings({
          ...s,
          token_costs: typeof s.token_costs === 'string' ? JSON.parse(s.token_costs) : s.token_costs
        });
      }
    } catch (err) {
      console.error(err);
      setError('Erro ao carregar configurações globais.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const res = await apiFetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      const data = await res.json();
      if (data.success) {
        setMessage('Configurações salvas com sucesso!');
      } else {
        throw new Error(data.error || 'Falha ao salvar');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleTokenCostChange = (token: string, value: string) => {
    setSettings(prev => ({
      ...prev,
      token_costs: {
        ...prev.token_costs,
        [token]: parseFloat(value) || 0
      }
    }));
  };

  if (loading) return (
    <div className="flex items-center justify-center p-12">
      <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
    </div>
  );

  return (
    <div className="p-4 md:p-8 space-y-8 max-w-4xl">
      <header>
        <h2 className="text-2xl font-black tracking-tighter">CONFIGURAÇÕES GLOBAIS DO SISTEMA</h2>
        <p className="text-sm font-bold opacity-50 uppercase tracking-widest mt-1">Custos de tokens, saques e transações</p>
      </header>

      {error && <div className="p-4 bg-red-50 text-red-600 rounded-2xl text-xs font-bold">{error}</div>}
      {message && <div className="p-4 bg-green-50 text-green-600 rounded-2xl text-xs font-bold">{message}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Custos por Tamanho de Token */}
        <section className="bg-white/40 border border-white/60 p-6 rounded-[2rem] shadow-sm backdrop-blur-xl space-y-6">
          <div className="flex items-center gap-2 mb-2">
            <Database className="w-5 h-5 text-blue-500" />
            <h3 className="font-black text-sm uppercase tracking-widest">Custo por Tamanho de Token (E)</h3>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {Object.keys(settings.token_costs).map(token => (
              <div key={token} className="space-y-1">
                <label className="text-[10px] font-black opacity-50 uppercase pl-1">E{token}</label>
                <input 
                  type="number" 
                  step="0.01"
                  value={settings.token_costs[token as keyof typeof settings.token_costs]}
                  onChange={(e) => handleTokenCostChange(token, e.target.value)}
                  className="w-full bg-white/50 border border-black/5 rounded-xl px-4 py-2 text-xs font-bold focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                />
              </div>
            ))}
          </div>
        </section>

        {/* Custos de Saque e Conversão */}
        <section className="bg-white/40 border border-white/60 p-6 rounded-[2rem] shadow-sm backdrop-blur-xl space-y-6">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-5 h-5 text-green-500" />
            <h3 className="font-black text-sm uppercase tracking-widest">Taxas e Conversões (Real)</h3>
          </div>
          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-black opacity-50 uppercase pl-1">Custo para Sacar (E4096)</label>
              <input 
                type="number" 
                value={settings.withdrawal_cost_4096}
                onChange={(e) => setSettings({...settings, withdrawal_cost_4096: parseInt(e.target.value) || 0})}
                className="w-full bg-white/50 border border-black/5 rounded-xl px-4 py-2 text-xs font-bold outline-none"
              />
              <p className="text-[9px] opacity-40 mt-1 italic font-bold">Quantidade de tokens E4096 consumidos no saque</p>
            </div>
            <div>
              <label className="text-[10px] font-black opacity-50 uppercase pl-1">Custo para Sacar (E2048)</label>
              <input 
                type="number" 
                value={settings.withdrawal_cost_2048}
                onChange={(e) => setSettings({...settings, withdrawal_cost_2048: parseInt(e.target.value) || 0})}
                className="w-full bg-white/50 border border-black/5 rounded-xl px-4 py-2 text-xs font-bold outline-none"
              />
              <p className="text-[9px] opacity-40 mt-1 italic font-bold">Quantidade de tokens E2048 consumidos no saque</p>
            </div>
            <div>
              <label className="text-[10px] font-black opacity-50 uppercase pl-1">Custo de Conversão (Token para Real)</label>
              <input 
                type="number" 
                step="0.01"
                value={settings.conversion_cost}
                onChange={(e) => setSettings({...settings, conversion_cost: parseFloat(e.target.value) || 0})}
                className="w-full bg-white/50 border border-black/5 rounded-xl px-4 py-2 text-xs font-bold outline-none"
              />
            </div>
          </div>
        </section>

        {/* Configurações de Funções do Site */}
        <section className="bg-white/40 border border-white/60 p-6 rounded-[2rem] shadow-sm backdrop-blur-xl md:col-span-2 space-y-6">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-5 h-5 text-orange-500" />
            <h3 className="font-black text-sm uppercase tracking-widest">Custos por Função do Site</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-black/5 p-4 rounded-2xl space-y-3">
              <h4 className="text-[11px] font-black uppercase opacity-60">Cadastro de Produto</h4>
              <div className="flex gap-2">
                <input type="number" value={settings.product_token_cost_amount} onChange={e => setSettings({...settings, product_token_cost_amount: parseInt(e.target.value)})} className="w-16 bg-white rounded-lg px-2 py-1 text-xs font-bold" />
                <select value={settings.product_token_cost_type} onChange={e => setSettings({...settings, product_token_cost_type: parseInt(e.target.value)})} className="flex-1 bg-white rounded-lg px-2 py-1 text-xs font-bold">
                  {[16,32,64,128,256,512,1024,2048,4096].map(v => <option key={v} value={v}>E{v}</option>)}
                </select>
              </div>
            </div>

            <div className="bg-black/5 p-4 rounded-2xl space-y-3">
              <h4 className="text-[11px] font-black uppercase opacity-60">Visibilidade 7 Dias</h4>
              <div className="flex gap-2">
                <input type="number" value={settings.cost_7d_amount} onChange={e => setSettings({...settings, cost_7d_amount: parseInt(e.target.value)})} className="w-16 bg-white rounded-lg px-2 py-1 text-xs font-bold" />
                <select value={settings.cost_7d_type} onChange={e => setSettings({...settings, cost_7d_type: parseInt(e.target.value)})} className="flex-1 bg-white rounded-lg px-2 py-1 text-xs font-bold">
                  {[16,32,64,128,256,512,1024,2048,4096].map(v => <option key={v} value={v}>E{v}</option>)}
                </select>
              </div>
            </div>

            <div className="bg-black/5 p-4 rounded-2xl space-y-3">
              <h4 className="text-[11px] font-black uppercase opacity-60">Visibilidade 30 Dias</h4>
              <div className="flex gap-2">
                <input type="number" value={settings.cost_30d_amount} onChange={e => setSettings({...settings, cost_30d_amount: parseInt(e.target.value)})} className="w-16 bg-white rounded-lg px-2 py-1 text-xs font-bold" />
                <select value={settings.cost_30d_type} onChange={e => setSettings({...settings, cost_30d_type: parseInt(e.target.value)})} className="flex-1 bg-white rounded-lg px-2 py-1 text-xs font-bold">
                  {[16,32,64,128,256,512,1024,2048,4096].map(v => <option key={v} value={v}>E{v}</option>)}
                </select>
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className="bg-[#007AFF]/10 border border-[#007AFF]/20 p-6 rounded-[2rem] flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="text-left">
          <p className="text-xs font-black uppercase tracking-widest text-[#007AFF]">Aguardar Webhook Externo</p>
          <p className="text-[10px] font-semibold opacity-60 mt-1 max-w-md">Ao salvar, todas as transações (compras, transferências e créditos) passarão a aguardar 30 segundos pela confirmação do sistema central (200 OK).</p>
        </div>
        <button 
          onClick={handleSave} 
          disabled={saving}
          className="bg-[#007AFF] hover:bg-blue-600 text-white font-black px-10 py-4 rounded-2xl shadow-xl shadow-blue-500/20 flex items-center gap-3 transition-all active:scale-95 disabled:opacity-50"
        >
          {saving ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
          CONFIRMAR ALTERAÇÕES GLOBAIS
        </button>
      </div>

      {/* Central de Notificações Gerais ou Segmentadas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-10 text-left">
        <section className="bg-white/40 border border-white/60 p-6 rounded-[2rem] shadow-sm backdrop-blur-xl flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Mail className="w-5 h-5 text-[#007AFF]" />
              <h3 className="font-black text-sm uppercase tracking-widest text-[#1D1D1F]">Central de Notificações</h3>
            </div>
            <p className="text-[10px] text-gray-500 font-medium mb-4">
              Dispare notificações para seus usuários ou clientes. Para ler a mensagem completa, os destinatários precisarão re-autenticar por segurança.
            </p>
            
            <form onSubmit={handleSendNotification} className="space-y-4">
              <div>
                <label className="text-[10px] font-black opacity-50 uppercase pl-1 block text-left mb-1">Título da Notificação</label>
                <input 
                  type="text" 
                  value={notifTitle}
                  onChange={e => setNotifTitle(e.target.value)}
                  placeholder="Ex: Atualização Importante de Saldo"
                  className="w-full bg-white border border-black/5 rounded-xl px-4 py-2.5 text-xs font-bold outline-none focus:border-[#007AFF]/40"
                />
              </div>

              <div>
                <label className="text-[10px] font-black opacity-50 uppercase pl-1 block text-left mb-1">Mensagem (Conteúdo Protegido)</label>
                <textarea 
                  value={notifMessage}
                  onChange={e => setNotifMessage(e.target.value)}
                  placeholder="Escreva a mensagem que requererá login para ser lida..."
                  className="w-full h-24 bg-white border border-black/5 rounded-xl px-4 py-2.5 text-xs font-bold outline-none focus:border-[#007AFF]/40 resize-none"
                />
              </div>

              <div>
                <label className="text-[10px] font-black opacity-50 uppercase pl-1 block text-left mb-1">Público Alvo</label>
                <select 
                  value={notifTargetType}
                  onChange={e => setNotifTargetType(e.target.value)}
                  className="w-full bg-white border border-black/5 rounded-xl px-4 py-2.5 text-xs font-bold outline-none"
                >
                  <option value="all">Sincronizar Todos os Usuários (Genérica)</option>
                  <option value="last_login">Filtro: Usuário Conforme Último Login Ativo</option>
                  <option value="user">Usuário Específico por ID</option>
                </select>
              </div>

              {notifTargetType === 'user' && (
                <div className="animate-fade-in">
                  <label className="text-[10px] font-black opacity-50 uppercase pl-1 block text-left mb-1">ID do Usuário Destinatário</label>
                  <input 
                    type="number" 
                    value={notifTargetUserId}
                    onChange={e => setNotifTargetUserId(e.target.value)}
                    placeholder="Ex: 5"
                    className="w-full bg-white border border-black/5 rounded-xl px-4 py-2.5 text-xs font-bold outline-none"
                  />
                </div>
              )}

              <button 
                type="submit" 
                disabled={sendingNotif}
                className="w-full bg-[#007AFF] hover:bg-blue-600 text-white font-black py-3 rounded-xl shadow-md transition-all text-xs uppercase tracking-widest flex items-center justify-center gap-2"
              >
                {sendingNotif ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                ENVIAR NOTIFICAÇÃO SEGUINTE
              </button>
            </form>
          </div>
        </section>

        {/* Gerenciamento e Limpeza Relacional de Tabelas (Admin) */}
        <section className="bg-white/40 border border-white/60 p-6 rounded-[2rem] shadow-sm backdrop-blur-xl flex flex-col justify-between space-y-4 text-left">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Trash2 className="w-5 h-5 text-red-500" />
              <h3 className="font-black text-sm uppercase tracking-widest text-[#1D1D1F]">Limpeza do Banco de Dados</h3>
            </div>
            <p className="text-[10px] text-gray-500 font-medium mb-4">
              Realize manutenções e limpezas profundas no banco Postgres. Todas as referências são mapeadas por chaves estrangeiras com exclusão em cascata.
            </p>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black opacity-50 uppercase pl-1 block text-left mb-1">Selecione a Tabela/Elemento</label>
                <select 
                  value={cleanupType}
                  onChange={e => setCleanupType(e.target.value as any)}
                  className="w-full bg-white border border-black/5 rounded-xl px-4 py-2.5 text-xs font-bold outline-none"
                >
                  <option value="products">Lista de Produtos (products)</option>
                  <option value="users">Lista de Usuários Comuns (users - exceto admin)</option>
                  <option value="orders">Lista de Históricos de Vendas (orders)</option>
                  <option value="logs">Logs Operacionais do Sistema (logs)</option>
                  <option value="wallets">Zerar Saldos de eTokens (wallets)</option>
                  <option value="all">Fazer Limpeza Completa (Tudo, exceto Admin)</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-black opacity-50 uppercase pl-1 block text-left mb-1">IDs Específicos (Opcional - Selecionar um por um)</label>
                <input 
                  type="text" 
                  value={cleanupIdsText}
                  onChange={e => setCleanupIdsText(e.target.value)}
                  placeholder="Ex: 1, 4, 15 (Deixe em branco para apagar tudo de uma vez)"
                  disabled={cleanupType === 'all'}
                  className="w-full bg-white border border-black/5 rounded-xl px-4 py-2.5 text-xs font-bold outline-none disabled:opacity-50"
                />
              </div>

              <div className="p-4 bg-red-500/5 border border-red-500/10 rounded-2xl flex items-start gap-3 text-left">
                <ShieldAlert className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] font-black uppercase text-red-500 tracking-wider mb-0.5">Atenção!</p>
                  <p className="text-[9px] text-[#86868B] font-semibold leading-relaxed">
                    A remoção é permanente. Para processar a solicitação, você precisará confirmar sua senha administrativa na etapa de checkout seguinte.
                  </p>
                </div>
              </div>

              <button 
                onClick={() => setIsCleanupModalOpen(true)}
                className="w-full bg-red-500 hover:bg-red-600 text-white font-black py-3 rounded-xl shadow-md transition-all text-xs uppercase tracking-widest flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                CONFIGURAR LIMPEZA
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* MODAL DE CONFIRMAÇÃO DE SENHA PARA LIMPEZA */}
      {isCleanupModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 text-left">
          <div className="bg-white rounded-[2rem] w-full max-w-md p-8 border border-gray-100 shadow-2xl relative">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-red-100 rounded-2xl text-red-500">
                <Lock className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-text-black text-base font-black uppercase text-gray-900 leading-none">Segurança de Dados</h4>
                <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest mt-1">Autorização Administrativa</p>
              </div>
            </div>

            <p className="text-xs text-gray-500 leading-relaxed mb-6">
              Para prosseguir com a limpeza permanente de <strong className="text-gray-900 font-extrabold uppercase">{cleanupType === 'all' ? 'TUDO' : cleanupType}</strong>{cleanupIdsText.trim() ? ` (IDs específicos: ${cleanupIdsText})` : ' (TUDO)'}, por favor re-digite sua senha pessoal de Administrador abaixo:
            </p>

            <form onSubmit={handleExecuteCleanup} className="space-y-4">
              <div>
                <label className="text-[10px] font-black opacity-50 uppercase pl-1 block mb-1">Senha de Administrador</label>
                <input 
                  type="password" 
                  value={cleanupPassword}
                  onChange={e => setCleanupPassword(e.target.value)}
                  placeholder="Sua senha secreta de admin"
                  className="w-full bg-gray-50 border border-gray-250 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:border-red-500/20 focus:bg-white"
                  autoFocus
                />
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button 
                  type="button" 
                  onClick={() => { setIsCleanupModalOpen(false); setCleanupPassword(''); }}
                  className="px-5 py-3 text-xs font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-all"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  disabled={executingCleanup || !cleanupPassword}
                  className="px-6 py-3 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white font-black text-xs uppercase tracking-widest rounded-xl shadow-lg shadow-red-500/10 flex items-center gap-2 transition-all"
                >
                  {executingCleanup ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  CONFIRMAR E DELETAR
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
