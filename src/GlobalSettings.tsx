import React, { useState, useEffect } from 'react';
import { Save, RefreshCw, DollarSign, Database, Activity } from 'lucide-react';
import { apiFetch } from './utils';

export function GlobalSettings() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  
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
    </div>
  );
}
