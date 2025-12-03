"use client";

import { useEffect, useState, useCallback } from "react";

interface Agent {
  id: string;
  name: string;
  description: string | null;
  avatar: string | null;
  isDefault: boolean;
}

interface AgentSelectorProps {
  onSelect: (agentId: string | null, agentData?: { name: string; avatar: string | null }) => void;
  selectedAgentId: string | null;
}

export default function AgentSelector({ onSelect, selectedAgentId }: AgentSelectorProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [backendUrl, setBackendUrl] = useState<string>("");

  // Detecta o backend URL correto no client-side
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const { protocol, hostname } = window.location;
      // Se estamos em HTTPS (produção), usa o mesmo host (Apache faz proxy para /uploads)
      // Se estamos em HTTP (dev), usa backend direto na porta 8583
      if (protocol === 'https:') {
        setBackendUrl('');
      } else {
        setBackendUrl(`http://${hostname}:8583`);
      }
    }
  }, []);

  // Helper para montar URL do avatar
  const getAvatarUrl = useCallback((avatarPath: string | null): string | null => {
    if (!avatarPath) return null;
    if (avatarPath.startsWith("http")) return avatarPath;
    return `${backendUrl}${avatarPath}`;
  }, [backendUrl]);

  useEffect(() => {
    fetchAgents();
  }, []);

  const fetchAgents = async () => {
    try {
      const res = await fetch("/api/agents");
      if (res.ok) {
        const data = await res.json();
        setAgents(data);
      }
    } catch (error) {
      console.error("Erro ao buscar agentes:", error);
    } finally {
      setLoading(false);
    }
  };

  const selectedAgent = selectedAgentId 
    ? agents.find((a) => a.id === selectedAgentId) 
    : null;

  const handleSelect = (agent: Agent | null) => {
    if (agent) {
      onSelect(agent.id, { name: agent.name, avatar: agent.avatar });
    } else {
      onSelect(null);
    }
    setIsOpen(false);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-800/50 rounded-lg">
        <div className="w-8 h-8 rounded-full bg-slate-700 animate-pulse" />
        <span className="text-slate-400 text-sm">Carregando...</span>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Selected Agent Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 px-3 py-2 bg-slate-800/50 hover:bg-slate-700/50 rounded-lg transition border border-slate-700/50 min-w-[200px]"
      >
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center overflow-hidden flex-shrink-0">
          {selectedAgent?.avatar ? (
            <img
              src={getAvatarUrl(selectedAgent.avatar) || ""}
              alt={selectedAgent.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          )}
        </div>
        <div className="flex-1 text-left min-w-0">
          <p className="text-sm font-medium text-white truncate">
            {selectedAgent?.name || "Assistente Geral"}
          </p>
          <p className="text-xs text-slate-400 truncate">
            {selectedAgent?.description || "Assistente de propósito geral"}
          </p>
        </div>
        <svg
          className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Menu */}
          <div className="absolute top-full left-0 mt-2 w-72 max-w-[90vw] bg-slate-800 rounded-xl border border-slate-700/50 shadow-xl z-50 overflow-hidden">
            <div className="p-2 border-b border-slate-700/50">
              <p className="text-xs text-slate-400 px-2">Escolha um assistente</p>
            </div>

            <div className="max-h-80 overflow-y-auto p-2 space-y-1">
              {/* Assistente Geral */}
              <button
                onClick={() => handleSelect(null)}
                className={`w-full flex items-center gap-3 p-3 rounded-lg transition ${
                  !selectedAgentId
                    ? "bg-purple-500/20 border border-purple-500/50"
                    : "hover:bg-slate-700/50"
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <div className="flex-1 text-left min-w-0">
                  <p className="text-sm font-medium text-white">Assistente Geral</p>
                  <p className="text-xs text-slate-400 truncate">
                    Assistente de propósito geral
                  </p>
                </div>
                {!selectedAgentId && (
                  <svg className="w-5 h-5 text-purple-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                )}
              </button>

              {/* Divider */}
              {agents.length > 0 && (
                <div className="border-t border-slate-700/50 my-2" />
              )}

              {/* Agentes personalizados */}
              {agents.map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => handleSelect(agent)}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg transition ${
                    selectedAgentId === agent.id
                      ? "bg-purple-500/20 border border-purple-500/50"
                      : "hover:bg-slate-700/50"
                  }`}
                >
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center overflow-hidden flex-shrink-0">
                    {agent.avatar ? (
                      <img
                        src={getAvatarUrl(agent.avatar) || ""}
                        alt={agent.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-white truncate">{agent.name}</p>
                      {agent.isDefault && (
                        <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded text-[10px] font-medium">
                          Padrão
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 truncate">
                      {agent.description || "Sem descrição"}
                    </p>
                  </div>
                  {selectedAgentId === agent.id && (
                    <svg className="w-5 h-5 text-purple-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              ))}

              {agents.length === 0 && (
                <p className="text-center text-slate-500 text-sm py-4">
                  Nenhum agente personalizado disponível
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
