"use client";

import { useState, useEffect } from "react";

interface Agent {
  id: string;
  name: string;
  description: string | null;
  avatar: string | null;
  isPublic: boolean;
  isDefault: boolean;
  hasAccess: boolean;
  isExplicitAccess: boolean;
}

interface User {
  id: string;
  name: string | null;
  email: string;
}

interface UserAgentAccessModalProps {
  userId: string;
  onClose: () => void;
}

export default function UserAgentAccessModal({ userId, onClose }: UserAgentAccessModalProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`/api/admin/users/${userId}/agents`);
        if (!res.ok) throw new Error("Erro ao carregar dados");
        
        const data = await res.json();
        setUser(data.user);
        setAgents(data.agents);
        
        // Inicializar seleção com agentes que têm acesso explícito
        const initialSelected = new Set<string>(
          data.agents
            .filter((a: Agent) => a.isExplicitAccess)
            .map((a: Agent) => a.id)
        );
        setSelectedAgents(initialSelected);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [userId]);

  const handleToggleAgent = (agentId: string, agent: Agent) => {
    // Não permitir toggle em agentes públicos ou default
    if (agent.isPublic || agent.isDefault) return;

    setSelectedAgents((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(agentId)) {
        newSet.delete(agentId);
      } else {
        newSet.add(agentId);
      }
      return newSet;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/admin/users/${userId}/agents`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentIds: Array.from(selectedAgents) }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erro ao salvar");
      }

      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // Separar agentes públicos e privados
  const publicAgents = agents.filter((a) => a.isPublic || a.isDefault);
  const privateAgents = agents.filter((a) => !a.isPublic && !a.isDefault);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-2xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">Acesso a Agentes</h2>
            {user && (
              <p className="text-sm text-slate-400">{user.name || user.email}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white transition"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : error ? (
            <div className="p-4 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          ) : (
            <div className="space-y-6">
              {/* Agentes públicos */}
              {publicAgents.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-slate-400 mb-3 flex items-center gap-2">
                    <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Agentes Públicos (acesso para todos)
                  </h3>
                  <div className="space-y-2">
                    {publicAgents.map((agent) => (
                      <div
                        key={agent.id}
                        className="flex items-center gap-3 p-3 bg-slate-700/30 rounded-lg opacity-70"
                      >
                        <div className="w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center overflow-hidden">
                          {agent.avatar ? (
                            <img src={agent.avatar} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                          )}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-white flex items-center gap-2">
                            {agent.name}
                            {agent.isDefault && (
                              <span className="text-xs px-2 py-0.5 bg-purple-500/30 text-purple-300 rounded">
                                Padrão
                              </span>
                            )}
                          </p>
                          {agent.description && (
                            <p className="text-xs text-slate-500 truncate">{agent.description}</p>
                          )}
                        </div>
                        <svg className="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                        </svg>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Agentes privados */}
              {privateAgents.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-slate-400 mb-3 flex items-center gap-2">
                    <svg className="w-4 h-4 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    Agentes Privados (selecione quais o usuário pode acessar)
                  </h3>
                  <div className="space-y-2">
                    {privateAgents.map((agent) => {
                      const isSelected = selectedAgents.has(agent.id);
                      return (
                        <button
                          key={agent.id}
                          type="button"
                          onClick={() => handleToggleAgent(agent.id, agent)}
                          className={`w-full flex items-center gap-3 p-3 rounded-lg transition ${
                            isSelected
                              ? "bg-purple-500/20 border border-purple-500/50"
                              : "bg-slate-700/30 border border-transparent hover:bg-slate-700/50"
                          }`}
                        >
                          <div className="w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center overflow-hidden">
                            {agent.avatar ? (
                              <img src={agent.avatar} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                              </svg>
                            )}
                          </div>
                          <div className="flex-1 text-left">
                            <p className="text-sm font-medium text-white">{agent.name}</p>
                            {agent.description && (
                              <p className="text-xs text-slate-500 truncate">{agent.description}</p>
                            )}
                          </div>
                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition ${
                            isSelected
                              ? "bg-purple-500 border-purple-500"
                              : "border-slate-600"
                          }`}>
                            {isSelected && (
                              <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                              </svg>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {privateAgents.length === 0 && (
                <div className="text-center py-8 text-slate-400">
                  <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p>Todos os agentes são públicos.</p>
                  <p className="text-sm mt-1">Este usuário tem acesso a todos.</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-700 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-slate-300 hover:text-white transition"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="px-6 py-2 bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-lg font-medium hover:opacity-90 transition disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
