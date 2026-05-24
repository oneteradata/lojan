import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  RefreshCw,
  List,
  Eye,
  EyeOff,
  Send,
  Download,
  CreditCard,
  ArrowUpRight,
  ArrowDownLeft,
  X,
  Check,
  DollarSign,
} from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { apiFetch } from "./utils";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function AdminWallet({
  user,
  onRefreshUser,
}: {
  user: any;
  onRefreshUser?: () => void;
}) {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showBalance, setShowBalance] = useState(true);
  const [activeTab, setActiveTab] = useState<
    "extrato" | "transferir" | "receber" | "solicitar" | "saque"
  >("extrato");
  const [selectedTransaction, setSelectedTransaction] = useState<any>(null);

  const groupedTokensIni =
    user.wallet?.tokens?.reduce((acc: any, val: string) => {
      acc[val.length] = (acc[val.length] || 0) + 1;
      return acc;
    }, {}) || {};
  const firstAvailableToken =
    Object.keys(groupedTokensIni).length > 0
      ? Object.keys(groupedTokensIni)[0]
      : "128";

  // Transfer state
  const [transferUserId, setTransferUserId] = useState("");
  const [transferAmount, setTransferAmount] = useState("1");
  const [transferType, setTransferType] = useState(firstAvailableToken); // default to first available token length

  useEffect(() => {
    if (
      Object.keys(groupedTokensIni).length > 0 &&
      !Object.keys(groupedTokensIni).includes(transferType)
    ) {
      setTransferType(Object.keys(groupedTokensIni)[0]);
    }
  }, [user.wallet?.tokens]);
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferSuccess, setTransferSuccess] = useState(false);

  const [settings, setSettings] = useState<any>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (onRefreshUser) onRefreshUser();

      const resSettings = await apiFetch("/api/settings");
      const dataSettings = await resSettings.json();
      if (dataSettings.success) setSettings(dataSettings.settings);

      const res = await apiFetch("/api/my-logs");
      const data = await res.json();
      if (Array.isArray(data)) {
        setLogs(data);
      }
    } catch (e) {}
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleTransfer = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setTransferLoading(true);
    const formData = new FormData(e.currentTarget);
    const password = formData.get("password");
    try {
      const res = await apiFetch("/api/transfer_tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receiver_id: transferUserId,
          amount: parseInt(transferAmount),
          token_length: parseInt(transferType),
          password,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setTransferSuccess(true);
        fetchData();
        setTimeout(() => setTransferSuccess(false), 3000);
        setTransferUserId("");
      } else {
        alert(data.error || "Erro ao transferir.");
      }
    } catch (err) {
      alert("Erro de conexão ao tentar transferir.");
    }
    setTransferLoading(false);
  };

  // Request state
  const [requestUserId, setRequestUserId] = useState("");
  const [requestAmount, setRequestAmount] = useState("1");
  const [requestType, setRequestType] = useState("64");
  const [requestLoading, setRequestLoading] = useState(false);
  const [requestSuccess, setRequestSuccess] = useState(false);

  const handleRequestTokens = async (e: React.FormEvent) => {
    e.preventDefault();
    setRequestLoading(true);
    try {
      const payload: any = {
        quantidade: parseInt(requestAmount),
        tipo_token: parseInt(requestType),
      };
      if (user.role === "admin") {
        payload.user_id_recebedor = requestUserId || user.id;
      }

      const res = await apiFetch("/api/credit-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        setRequestSuccess(true);
        setTimeout(() => setRequestSuccess(false), 3000);
        setRequestUserId("");
      } else {
        alert(data.error || "Erro ao solicitar e-tokens.");
      }
    } catch (err) {
      alert("Erro de conexão ao solicitar.");
    }
    setRequestLoading(false);
  };

  const handleWithdraw = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setRequestLoading(true);
    const formData = new FormData(e.currentTarget);
    const amount = formData.get("amount");
    const pix_key = formData.get("pix_key");
    const password = formData.get("password");

    try {
      const res = await apiFetch("/api/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Number(amount), pix_key, password }),
      });
      const data = await res.json();
      if (data.success) {
        alert("Saque solicitado com sucesso!");
        setActiveTab("extrato");
        fetchData();
      } else {
        alert(data.error || "Erro ao solicitar saque.");
      }
    } catch (err) {
      alert("Erro de conexão ao solicitar saque.");
    }
    setRequestLoading(false);
  };

  const totalTokens = user.wallet?.tokens?.length || 0;
  const groupedTokens =
    user.wallet?.tokens?.reduce((acc: any, val: string) => {
      acc[val.length] = (acc[val.length] || 0) + 1;
      return acc;
    }, {}) || {};

  return (
    <div className="bg-[#F5F5F7] min-h-full font-sans pb-20 relative">
      {requestLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-8 flex flex-col items-center gap-4 text-center max-w-sm mx-4 shadow-2xl">
            <div className="w-16 h-16 border-4 border-blue-100 border-t-[#007AFF] rounded-full animate-spin"></div>
            <h3 className="text-xl font-bold text-[#1D1D1F]">Processando...</h3>
            <p className="text-sm text-gray-500 font-medium">
              Aguardando confirmação do sistema de pagamentos. Por favor, não
              feche esta tela.
            </p>
          </div>
        </div>
      )}
      {/* Header Digital Bank Style */}
      <div className="bg-[#007AFF] text-white pt-8 pb-32 px-6 rounded-b-[40px] shadow-lg relative z-0">
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-3">
            {user.company_logo ? (
              <img
                src={user.company_logo}
                alt="Perfil"
                className="w-12 h-12 rounded-full border-2 border-white/20 object-cover"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center font-bold text-lg border-2 border-white/20">
                {user.name?.[0]?.toUpperCase() || "U"}
              </div>
            )}
            <div>
              <p className="text-sm text-blue-100 font-medium">Olá,</p>
              <p className="text-lg font-bold leading-tight truncate max-w-[200px]">
                {user.name}
              </p>
            </div>
          </div>
          <div className="flex gap-4">
            <button
              onClick={() => setShowBalance(!showBalance)}
              className="text-white hover:text-blue-200 transition-colors"
            >
              {showBalance ? (
                <EyeOff className="w-6 h-6" />
              ) : (
                <Eye className="w-6 h-6" />
              )}
            </button>
          </div>
        </div>

        <div className="mb-2">
          <p className="text-sm font-medium text-blue-100 mb-1">
            Saldo eTokens
          </p>
          <div className="flex items-baseline gap-2">
            {showBalance ? (
              <>
                <h2 className="text-4xl font-bold">{totalTokens}</h2>
                <span className="text-lg font-medium text-blue-200 uppercase tracking-widest">
                  Unidades
                </span>
              </>
            ) : (
              <div className="w-32 h-10 bg-white/20 rounded-lg animate-pulse" />
            )}
          </div>
          {showBalance && totalTokens > 0 && (
            <div className="mt-4 flex gap-2 flex-wrap">
              {Object.entries(groupedTokens).map(([tipo, qtd]: any) => (
                <span
                  key={tipo}
                  className="bg-white/10 px-3 py-1 rounded-full text-xs font-bold uppercase border border-white/20"
                >
                  TIPO E{tipo}: {qtd}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Floating Action Buttons */}
      <div className="px-6 -mt-10 relative z-10">
        <div className="bg-white rounded-3xl p-4 shadow-xl border border-gray-100 flex justify-between gap-2 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveTab("transferir")}
            className="flex flex-col items-center gap-2 min-w-[72px] shrink-0 hover:opacity-80 transition-opacity"
          >
            <div
              className={cn(
                "w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm",
                activeTab === "transferir"
                  ? "bg-[#007AFF] text-white"
                  : "bg-gray-50 text-[#007AFF]",
              )}
            >
              <Send className="w-6 h-6" />
            </div>
            <span className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">
              Transferir
            </span>
          </button>
          <button
            onClick={() => setActiveTab("receber")}
            className="flex flex-col items-center gap-2 min-w-[72px] shrink-0 hover:opacity-80 transition-opacity"
          >
            <div
              className={cn(
                "w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm",
                activeTab === "receber"
                  ? "bg-[#007AFF] text-white"
                  : "bg-gray-50 text-[#007AFF]",
              )}
            >
              <Download className="w-6 h-6" />
            </div>
            <span className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">
              Receber
            </span>
          </button>
          <button
            onClick={() => setActiveTab("saque")}
            className="flex flex-col items-center gap-2 min-w-[72px] shrink-0 hover:opacity-80 transition-opacity"
          >
            <div
              className={cn(
                "w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm",
                activeTab === "saque"
                  ? "bg-[#007AFF] text-white"
                  : "bg-gray-50 text-[#007AFF]",
              )}
            >
              <DollarSign className="w-6 h-6" />
            </div>
            <span className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">
              Sacar
            </span>
          </button>
          <button
            onClick={() => setActiveTab("extrato")}
            className="flex flex-col items-center gap-2 min-w-[72px] shrink-0 hover:opacity-80 transition-opacity"
          >
            <div
              className={cn(
                "w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm",
                activeTab === "extrato"
                  ? "bg-[#007AFF] text-white"
                  : "bg-gray-50 text-[#007AFF]",
              )}
            >
              <List className="w-6 h-6" />
            </div>
            <span className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">
              Extrato
            </span>
          </button>
          {user.role === "admin" && (
            <button
              onClick={() => setActiveTab("solicitar")}
              className="flex flex-col items-center gap-2 min-w-[72px] shrink-0 hover:opacity-80 transition-opacity"
            >
              <div
                className={cn(
                  "w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm",
                  activeTab === "solicitar"
                    ? "bg-[#007AFF] text-white"
                    : "bg-gray-50 text-[#007AFF]",
                )}
              >
                <CreditCard className="w-6 h-6" />
              </div>
              <span className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">
                Solicitar
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div className="px-6 mt-6">
        <AnimatePresence mode="wait">
          {activeTab === "extrato" && (
            <motion.div
              key="extrato"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-[#1D1D1F] uppercase tracking-wider text-sm">
                  Últimas Transações
                </h3>
                <button
                  onClick={fetchData}
                  className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-[#007AFF] transition-colors"
                >
                  <RefreshCw
                    className={cn("w-4 h-4", loading && "animate-spin")}
                  />
                </button>
              </div>
              <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 flex flex-col gap-4">
                {logs.filter((l) =>
                  [
                    "transferencia",
                    "recebimento_transferencia",
                    "pagamento_aprovado",
                    "pagamento_recusado",
                    "pagamento_timeout",
                    "pagamento_token_cadastro",
                    "credito_recebido",
                  ].includes(l.event_name),
                ).length > 0 ? (
                  logs
                    .filter((l) =>
                      [
                        "transferencia",
                        "recebimento_transferencia",
                        "pagamento_aprovado",
                        "pagamento_recusado",
                        "pagamento_timeout",
                        "pagamento_token_cadastro",
                        "credito_recebido",
                      ].includes(l.event_name),
                    )
                    .map((log) => {
                      const isDebit =
                        log.event_name?.includes("recusado") ||
                        log.event_name?.includes("timeout") ||
                        log.event_name?.includes("erro") ||
                        log.event_name === "pagamento_token_cadastro";
                      const isCredit =
                        log.event_name?.includes("aprovado") ||
                        log.event_name === "produto_adicionado" ||
                        log.event_name === "recebimento_transferencia" ||
                        log.event_name === "credito_recebido";
                      const isTransfer = 
                        log.event_name === "transferencia" ||
                        log.event_name === "recebimento_transferencia";

                      let parsedDetails: any = null;
                      let displayDetails = log.details;
                      if (log.details && log.details.startsWith('{')) {
                        try {
                          parsedDetails = JSON.parse(log.details);
                          if (log.event_name === "credito_recebido") {
                            displayDetails = parsedDetails.details || `Crédito de ${parsedDetails.token_qty} token(s) ${parsedDetails.token_type}`;
                          } else {
                            displayDetails = parsedDetails.details || `Pagamento de ${parsedDetails.token_qty} token(s) ${parsedDetails.token_type}`;
                          }
                        } catch (e) {}
                      }

                      return (
                        <div
                          key={log.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTransaction(log);
                          }}
                          className="flex justify-between items-center border-b border-gray-50 pb-4 last:border-0 last:pb-0 cursor-pointer hover:bg-gray-50 transition-colors p-2 rounded-xl group relative"
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={cn(
                                "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
                                isTransfer
                                  ? "bg-purple-100 text-purple-600"
                                  : isCredit
                                    ? "bg-green-100 text-green-600"
                                    : isDebit
                                      ? "bg-red-100 text-red-600"
                                      : "bg-gray-100 text-gray-600",
                              )}
                            >
                              {isTransfer ? (
                                <ArrowUpRight className={cn("w-5 h-5", log.event_name === "recebimento_transferencia" && "rotate-180")} />
                              ) : isCredit ? (
                                <ArrowDownLeft className="w-5 h-5" />
                              ) : (
                                <ArrowUpRight className="w-5 h-5 text-red-500" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-bold text-[#1D1D1F] truncate">
                                {log.event_name === "pagamento_token_cadastro" ? "PAGAMENTO ETOKEN" : 
                                 log.event_name === "credito_recebido" ? "CRÉDITO DE TOKEN" :
                                 (log.event_name || "Registro")
                                  .replace(/_/g, " ")
                                  .toUpperCase()}{" "}
                                <span className="text-[10px] font-mono text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                  #{log.id}
                                </span>
                              </p>
                              <p className="text-[10px] text-gray-500 line-clamp-1">
                                {displayDetails}
                              </p>
                            </div>
                          </div>
                          <div className="text-right shrink-0 ml-4">
                            <p className="text-xs text-gray-400 font-medium">
                              {new Date(log.created_at).toLocaleString("pt-BR")}
                            </p>
                          </div>
                        </div>
                      );
                    })
                ) : (
                  <p className="text-center text-gray-400 text-sm py-8">
                    Nenhuma transação encontrada.
                  </p>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === "transferir" && (
            <motion.div
              key="transferir"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <h3 className="font-bold text-[#1D1D1F] uppercase tracking-wider text-sm mb-4">
                Transferência de eToken
              </h3>
              <form
                onSubmit={handleTransfer}
                className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 flex flex-col gap-5"
              >
                {transferSuccess ? (
                  <div className="bg-green-50 rounded-2xl p-6 flex flex-col items-center justify-center text-center">
                    <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center text-white mb-4">
                      <Check className="w-8 h-8" />
                    </div>
                    <h4 className="font-bold text-green-900 text-lg mb-1">
                      Transferência Concluída!
                    </h4>
                    <p className="text-green-700 text-sm mb-4">
                      O destinatário já recebeu os eTokens.
                    </p>
                    <button
                      onClick={() => setTransferSuccess(false)}
                      type="button"
                      className="text-green-600 font-bold uppercase text-[10px] tracking-widest border border-green-200 px-6 py-2 rounded-full hover:bg-green-100 transition-colors"
                    >
                      Nova Transferência
                    </button>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2 block">
                        DESTINATÁRIO (UUID OU NICKNAME)
                      </label>
                      <input
                        required
                        type="text"
                        value={transferUserId}
                        onChange={(e) => setTransferUserId(e.target.value)}
                        placeholder="Informe o UUID ou o Nickname do destinatário"
                        className="w-full bg-gray-50 border border-gray-200 focus:border-[#007AFF] rounded-2xl px-4 py-3 text-sm font-semibold outline-none"
                      />
                    </div>
                    <div className="flex gap-4">
                      <div className="flex-1">
                        <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2 block">
                          QUANTIDADE
                        </label>
                        <input
                          required
                          type="number"
                          min="1"
                          value={transferAmount}
                          onChange={(e) => setTransferAmount(e.target.value)}
                          className="w-full bg-gray-50 border border-gray-200 focus:border-[#007AFF] rounded-2xl px-4 py-3 text-lg font-bold text-[#007AFF] outline-none"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2 block">
                          TIPO ETOKEN
                        </label>
                        <select
                          value={transferType}
                          onChange={(e) => setTransferType(e.target.value)}
                          className="w-full bg-gray-50 border border-gray-200 focus:border-[#007AFF] rounded-2xl px-4 py-3 sm:py-[13.5px] text-sm font-semibold outline-none appearance-none"
                        >
                          {[16, 32, 64, 128, 256, 512, 1024, 2048, 4096].map(
                            (v) => (
                              <option key={v} value={v.toString()}>
                                E{v}
                              </option>
                            ),
                          )}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2 block">
                        SENHA PARA CONFIRMAR
                      </label>
                      <input
                        required
                        type="password"
                        name="password"
                        placeholder="Digite sua senha"
                        className="w-full bg-gray-50 border border-gray-200 focus:border-[#007AFF] rounded-2xl px-4 py-3 text-sm font-semibold outline-none"
                      />
                    </div>
                    <div className="pt-2 border-t border-gray-50 mt-2">
                      <button
                        type="submit"
                        disabled={transferLoading}
                        className="w-full bg-[#007AFF] text-white rounded-2xl py-4 font-bold uppercase tracking-widest text-xs hover:bg-[#0066CC] transition-colors disabled:opacity-50"
                      >
                        {transferLoading
                          ? "Processando..."
                          : "Confirmar Transferência"}
                      </button>
                    </div>
                  </>
                )}
              </form>
            </motion.div>
          )}

          {activeTab === "receber" && (
            <motion.div
              key="receber"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <h3 className="font-bold text-[#1D1D1F] uppercase tracking-wider text-sm mb-4">
                Recebimento
              </h3>
              <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center gap-4">
                <div className="w-24 h-24 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200 flex items-center justify-center">
                  <Download className="w-10 h-10 text-gray-300" />
                </div>
                <div>
                  <p className="text-gray-500 text-sm mb-1">
                    Para receber eTokens, informa seu ID:
                  </p>
                  <p className="text-3xl font-black text-[#007AFF] tracking-tight">
                    {user.id}
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "solicitar" && (
            <motion.div
              key="solicitar"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <h3 className="font-bold text-[#1D1D1F] uppercase tracking-wider text-sm mb-4">
                {user.role === "admin"
                  ? "Gerar e-Tokens"
                  : "Solicitar e-Tokens"}
              </h3>
              <form
                onSubmit={handleRequestTokens}
                className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 flex flex-col gap-5"
              >
                {requestSuccess ? (
                  <div className="bg-green-50 rounded-2xl p-6 flex flex-col items-center justify-center text-center">
                    <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center text-white mb-4">
                      <Check className="w-8 h-8" />
                    </div>
                    <h4 className="font-bold text-green-900 text-lg mb-1">
                      {user.role === "admin"
                        ? "Tokens Gerados!"
                        : "Pedido Enviado!"}
                    </h4>
                    <p className="text-green-700 text-sm mb-4">
                      {user.role === "admin"
                        ? "Os tokens foram enviados para a carteira."
                        : "Seu pedido foi registrado e será analisado."}
                    </p>
                    <button
                      onClick={() => {
                        setRequestSuccess(false);
                        fetchData();
                      }}
                      type="button"
                      className="text-green-600 font-bold uppercase text-[10px] tracking-widest border border-green-200 px-6 py-2 rounded-full hover:bg-green-100 transition-colors"
                    >
                      {user.role === "admin"
                        ? "Gerar Mais"
                        : "Nova Solicitação"}
                    </button>
                  </div>
                ) : (
                  <>
                    {user.role === "admin" && (
                      <div>
                        <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2 block">
                          ID DO USUÁRIO (OPCIONAL)
                        </label>
                        <input
                          type="number"
                          value={requestUserId}
                          onChange={(e) => setRequestUserId(e.target.value)}
                          placeholder={`Deixe em branco para o seu ID (${user.id})`}
                          className="w-full bg-gray-50 border border-gray-200 focus:border-[#007AFF] rounded-2xl px-4 py-3 text-sm font-semibold outline-none"
                        />
                      </div>
                    )}
                    <div className="flex gap-4">
                      <div className="flex-1">
                        <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2 block">
                          QUANTIDADE
                        </label>
                        <input
                          required
                          type="number"
                          min="1"
                          value={requestAmount}
                          onChange={(e) => setRequestAmount(e.target.value)}
                          className="w-full bg-gray-50 border border-gray-200 focus:border-[#007AFF] rounded-2xl px-4 py-3 text-lg font-bold text-[#007AFF] outline-none"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2 block">
                          TIPO ETOKEN
                        </label>
                        <select
                          value={requestType}
                          onChange={(e) => setRequestType(e.target.value)}
                          className="w-full bg-gray-50 border border-gray-200 focus:border-[#007AFF] rounded-2xl px-4 py-3 sm:py-[13.5px] text-sm font-semibold outline-none appearance-none"
                        >
                          {[16, 32, 64, 128, 256, 512, 1024, 2048, 4096].map(
                            (v) => (
                              <option key={v} value={v.toString()}>
                                E{v}
                              </option>
                            ),
                          )}
                        </select>
                      </div>
                    </div>
                    <div className="pt-2 border-t border-gray-50 mt-2">
                      <button
                        type="submit"
                        disabled={requestLoading}
                        className="w-full bg-[#007AFF] text-white rounded-2xl py-4 font-bold uppercase tracking-widest text-xs hover:bg-[#0066CC] transition-colors disabled:opacity-50"
                      >
                        {requestLoading
                          ? "Enviando..."
                          : user.role === "admin"
                            ? "Gerar e-Tokens"
                            : "Enviar Solicitação"}
                      </button>
                    </div>
                  </>
                )}
              </form>
            </motion.div>
          )}

          {activeTab === "saque" && (
            <motion.div
              key="saque"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <h3 className="font-bold text-[#1D1D1F] uppercase tracking-wider text-sm mb-4">
                Solicitar Saque em Real
              </h3>
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 flex flex-col gap-6">
                <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100">
                  <p className="text-[10px] font-black text-blue-800 uppercase tracking-widest mb-2">
                    Taxas de Saque Requeridas
                  </p>
                  <div className="flex gap-4">
                    <div className="bg-white px-3 py-2 rounded-xl border border-blue-200 shadow-sm flex-1">
                      <p className="text-[9px] font-bold text-gray-400 uppercase">
                        Tipo E4096
                      </p>
                      <p className="text-sm font-black text-blue-700">
                        {settings?.withdrawal_cost_4096 || 0} Unidades
                      </p>
                    </div>
                    <div className="bg-white px-3 py-2 rounded-xl border border-blue-200 shadow-sm flex-1">
                      <p className="text-[9px] font-bold text-gray-400 uppercase">
                        Tipo E2048
                      </p>
                      <p className="text-sm font-black text-blue-700">
                        {settings?.withdrawal_cost_2048 || 0} Unidades
                      </p>
                    </div>
                  </div>
                  <p className="text-[9px] text-blue-600 font-bold mt-2 italic">
                    * Estas unidades serão consumidas da sua carteira para validar a conversão.
                  </p>
                </div>

                <form onSubmit={handleWithdraw} className="space-y-4">
                  <div>
                    <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2 block">
                      VALOR DO SAQUE (R$)
                    </label>
                    <input
                      required
                      type="number"
                      step="0.01"
                      name="amount"
                      placeholder="0,00"
                      className="w-full bg-gray-50 border border-gray-200 focus:border-[#007AFF] rounded-2xl px-4 py-3 text-lg font-bold outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2 block">
                      CHAVE PIX
                    </label>
                    <input
                      required
                      type="text"
                      name="pix_key"
                      placeholder="CPF, Email, Telefone ou Aleatória"
                      className="w-full bg-gray-50 border border-gray-200 focus:border-[#007AFF] rounded-2xl px-4 py-3 text-sm font-semibold outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2 block">
                      SENHA MESTRE
                    </label>
                    <input
                      required
                      type="password"
                      name="password"
                      placeholder="Digite sua senha de segurança"
                      className="w-full bg-gray-50 border border-gray-200 focus:border-[#007AFF] rounded-2xl px-4 py-3 text-sm font-semibold outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={requestLoading}
                    className="w-full bg-black text-white rounded-2xl py-4 font-bold uppercase tracking-widest text-xs hover:bg-gray-800 transition-colors disabled:opacity-50 mt-4 shadow-xl shadow-black/10"
                  >
                    {requestLoading ? "Processando..." : "SOLICITAR SAQUE AGORA"}
                  </button>
                </form>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Modal de Detalhes da Transação */}
      <AnimatePresence>
        {selectedTransaction && (() => {
          let parsed: any = null;
          if (selectedTransaction.details && selectedTransaction.details.startsWith("{")) {
            try {
              parsed = JSON.parse(selectedTransaction.details);
            } catch (e) {}
          }
          
          const logId = selectedTransaction.id;
          const isEtokenPay = selectedTransaction.event_name === "pagamento_token_cadastro" || (parsed && parsed.is_etoken_payment);
          const isEtokenCredit = selectedTransaction.event_name === "credito_recebido" || (parsed && parsed.is_etoken_credit);
          const title = (selectedTransaction.event_name || "Registro").replace(/_/g, " ").toUpperCase();
          const dateStr = new Date(selectedTransaction.created_at).toLocaleString("pt-BR");
          
          return (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
              onClick={() => setSelectedTransaction(null)}
            >
              <motion.div
                initial={{ scale: 0.95, y: 15 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 15 }}
                className="bg-white rounded-3xl w-full max-w-md p-6 overflow-hidden shadow-2xl border border-gray-100"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div className="flex justify-between items-center pb-4 border-b border-gray-100 mb-6">
                  <div>
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">
                      Comprovante de Transação
                    </span>
                    <h2 className="text-lg font-extrabold text-[#1D1D1F] tracking-tight">
                      {isEtokenPay ? "Pagamento de eToken" : isEtokenCredit ? "Crédito de eToken" : title}
                    </h2>
                  </div>
                  <button
                    onClick={() => setSelectedTransaction(null)}
                    className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Details Content */}
                <div className="space-y-4">
                  {(isEtokenPay || isEtokenCredit) && parsed ? (
                    <>
                      {/* Visual Token badge */}
                      <div className={cn(
                        "p-6 rounded-2xl flex flex-col items-center justify-center text-center border",
                        isEtokenPay 
                          ? "bg-red-50/75 border-red-100 text-red-600" 
                          : "bg-green-50/75 border-green-100 text-green-600"
                      )}>
                        <p className="text-[10px] font-bold uppercase tracking-widest mb-1">
                          {isEtokenPay ? "Valor Pago" : "Valor Recebido"}
                        </p>
                        <p className="text-3xl font-black tracking-tight">
                          {parsed.token_qty} <span className="text-lg font-bold">{parsed.token_type}</span>
                        </p>
                        <p className="text-[10px] font-semibold text-gray-400 mt-2">
                          {isEtokenPay ? "Liquidado com sucesso do saldo" : "Creditado com sucesso na carteira"}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-4 pt-2">
                        <div className="bg-gray-50/60 p-3 rounded-2xl border border-gray-100">
                          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                            Quantidade Token
                          </p>
                          <p className="text-sm font-bold text-gray-800">
                            {parsed.token_qty} Unidades
                          </p>
                        </div>
                        <div className="bg-gray-50/60 p-3 rounded-2xl border border-gray-100">
                          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                            Tipo de Token
                          </p>
                          <p className="text-sm font-bold text-gray-800">
                            {parsed.token_type}
                          </p>
                        </div>
                      </div>

                      <div className="bg-gray-50/60 p-4 rounded-2xl border border-gray-100 space-y-3">
                        {isEtokenPay && (
                          <>
                            <div>
                              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">
                                Produto Vinculado
                              </p>
                              <p className="text-sm font-bold text-gray-800">
                                {parsed.product_name || "N/A"}
                              </p>
                            </div>
                            <div>
                              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">
                                ID do Produto
                              </p>
                              <p className="text-xs font-mono font-bold text-gray-500">
                                #{parsed.product_id || "N/A"}
                              </p>
                            </div>
                          </>
                        )}
                        {isEtokenCredit && (
                          <div>
                            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">
                              Operação
                            </p>
                            <p className="text-sm font-bold text-gray-800">
                              Crédito direto de eToken
                            </p>
                          </div>
                        )}
                        <div>
                          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">
                            Data e Hora
                          </p>
                          <p className="text-xs font-semibold text-gray-700">
                            {dateStr}
                          </p>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* General Transaction Type */}
                      <div className="bg-gray-50 p-5 rounded-2xl border border-gray-150 flex flex-col items-center justify-center text-center">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">
                          Operação
                        </p>
                        <p className="text-xl font-extrabold text-gray-800 tracking-tight">
                          {title}
                        </p>
                      </div>

                      <div className="bg-gray-50/60 p-4 rounded-2xl border border-gray-100 space-y-3">
                        <div>
                          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">
                            Descrição / Detalhes
                          </p>
                          <p className="text-sm font-medium text-gray-700">
                            {selectedTransaction.details || "N/A"}
                          </p>
                        </div>
                        <div>
                          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">
                            Data e Hora
                          </p>
                          <p className="text-xs font-semibold text-gray-700">
                            {dateStr}
                          </p>
                        </div>
                        <div>
                          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">
                            ID da Transação
                          </p>
                          <p className="text-xs font-mono text-gray-400 font-bold">
                            #{logId}
                          </p>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Action button */}
                <div className="mt-6">
                  <button
                    onClick={() => setSelectedTransaction(null)}
                    className="w-full bg-[#007AFF] text-white rounded-2xl py-3.5 font-bold uppercase tracking-widest text-[11px] hover:bg-[#0066CC] transition-colors shadow-lg shadow-blue-500/10"
                  >
                    Fechar Detalhes
                  </button>
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
}
