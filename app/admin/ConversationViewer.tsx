"use client";

import { useState, useEffect } from "react";

interface Message {
  id: string;
  role: "USER" | "ASSISTANT" | "SYSTEM";
  content: string;
  createdAt: string;
  sttLatencyMs?: number;
  llmLatencyMs?: number;
  ttsLatencyMs?: number;
  totalLatencyMs?: number;
}

interface ConversationDetail {
  id: string;
  title: string | null;
  mode: string;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    name: string | null;
    email: string;
  };
  messages: Message[];
}

interface ConversationViewerProps {
  conversationId: string;
  onClose: () => void;
}

export default function ConversationViewer({ conversationId, onClose }: ConversationViewerProps) {
  const [conversation, setConversation] = useState<ConversationDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    async function fetchConversation() {
      try {
        setIsLoading(true);
        const res = await fetch(`/api/admin/conversations/${conversationId}`);
        if (!res.ok) throw new Error("Erro ao carregar conversa");
        const data = await res.json();
        setConversation(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro desconhecido");
      } finally {
        setIsLoading(false);
      }
    }
    fetchConversation();
  }, [conversationId]);

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  // Anonimiza parcialmente o email
  const anonymizeEmail = (email: string) => {
    const [local, domain] = email.split("@");
    if (local.length <= 3) return `***@${domain}`;
    return `${local.slice(0, 2)}***@${domain}`;
  };

  // Filtra mensagens por termo de busca
  const filteredMessages = conversation?.messages.filter((msg) =>
    msg.content.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  // Destaca o termo de busca no texto
  const highlightText = (text: string, highlight: string) => {
    if (!highlight.trim()) return text;
    const regex = new RegExp(`(${highlight})`, "gi");
    const parts = text.split(regex);
    return parts.map((part, i) =>
      regex.test(part) ? (
        <mark key={i} className="bg-yellow-500/30 text-yellow-200 px-1 rounded">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col border border-slate-700">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-700">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-lg font-semibold text-white">
                {conversation?.title || "Conversa"}
              </h2>
              {conversation && (
                <p className="text-sm text-slate-400">
                  Usuário: {anonymizeEmail(conversation.user.email)} • 
                  {conversation.mode === "LIVE_CALL" ? " 📞 Ligação" : " 🎤 Push-to-Talk"} • 
                  {conversation.messages.length} mensagens
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          {/* Busca dentro da conversa */}
          <div className="relative">
            <input
              type="text"
              placeholder="Buscar nas mensagens..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 pl-10 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <svg className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          
          {searchTerm && conversation && (
            <p className="text-sm text-slate-400 mt-2">
              {filteredMessages.length} {filteredMessages.length === 1 ? "mensagem encontrada" : "mensagens encontradas"}
            </p>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {error && (
            <div className="bg-red-500/20 text-red-400 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {conversation && (
            <div className="space-y-4">
              {filteredMessages.length === 0 ? (
                <p className="text-slate-500 text-center py-8">
                  {searchTerm ? "Nenhuma mensagem encontrada com esse termo" : "Nenhuma mensagem nesta conversa"}
                </p>
              ) : (
                filteredMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.role === "USER" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                        msg.role === "USER"
                          ? "bg-blue-500/20 border border-blue-500/30 rounded-br-sm"
                          : "bg-slate-700/50 border border-slate-600/50 rounded-bl-sm"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`text-xs font-medium ${
                            msg.role === "USER" ? "text-blue-400" : "text-purple-400"
                          }`}
                        >
                          {msg.role === "USER" ? "Usuário" : "Assistente"}
                        </span>
                        <span className="text-xs text-slate-500">
                          {formatDate(msg.createdAt)}
                        </span>
                      </div>
                      <p className="text-white whitespace-pre-wrap">
                        {highlightText(msg.content, searchTerm)}
                      </p>
                      
                      {/* Latência (se disponível) */}
                      {(msg.sttLatencyMs || msg.llmLatencyMs || msg.ttsLatencyMs) && (
                        <div className="mt-2 flex gap-2 text-xs text-slate-500">
                          {msg.sttLatencyMs && <span>STT: {msg.sttLatencyMs}ms</span>}
                          {msg.llmLatencyMs && <span>LLM: {msg.llmLatencyMs}ms</span>}
                          {msg.ttsLatencyMs && <span>TTS: {msg.ttsLatencyMs}ms</span>}
                          {msg.totalLatencyMs && <span>Total: {msg.totalLatencyMs}ms</span>}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {conversation && (
          <div className="px-6 py-3 border-t border-slate-700 text-xs text-slate-500">
            Criada em {formatDate(conversation.createdAt)} • 
            Última atualização {formatDate(conversation.updatedAt)}
          </div>
        )}
      </div>
    </div>
  );
}
