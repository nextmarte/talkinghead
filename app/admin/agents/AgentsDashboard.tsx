"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AgentEditor from "./AgentEditor";
import KnowledgeUploader from "./KnowledgeUploader";

// Helper para montar URL completa do avatar
const getAvatarUrl = (avatarPath: string | null): string | null => {
  if (!avatarPath) return null;
  // Se já é uma URL completa, retorna como está
  if (avatarPath.startsWith("http")) return avatarPath;
  // Monta URL usando o backend
  const backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8583";
  return `${backendUrl}${avatarPath}`;
};

interface KnowledgeBase {
  id: string;
  fileName: string;
  fileSize: number;
  status: string;
  createdAt: Date;
}

interface Agent {
  id: string;
  name: string;
  description: string | null;
  systemPrompt: string;
  avatar: string | null;
  voiceSample: string | null;
  voiceGender: string | null;
  voicePitch: number | null;
  voiceSpeed: number | null;
  isActive: boolean;
  isDefault: boolean;
  createdAt: Date;
  _count: {
    conversations: number;
    knowledgeBase: number;
  };
  knowledgeBase: KnowledgeBase[];
}

interface AgentsDashboardProps {
  agents: Agent[];
}

export default function AgentsDashboard({ agents: initialAgents }: AgentsDashboardProps) {
  const router = useRouter();
  const [agents, setAgents] = useState(initialAgents);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [showKnowledge, setShowKnowledge] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleCreateAgent = () => {
    setSelectedAgent(null);
    setIsCreating(true);
    setShowEditor(true);
  };

  const handleEditAgent = (agent: Agent) => {
    setSelectedAgent(agent);
    setIsCreating(false);
    setShowEditor(true);
  };

  const handleToggleActive = async (agent: Agent) => {
    try {
      const res = await fetch(`/api/agents/${agent.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !agent.isActive }),
      });

      if (res.ok) {
        setAgents((prev) =>
          prev.map((a) =>
            a.id === agent.id ? { ...a, isActive: !a.isActive } : a
          )
        );
      }
    } catch (error) {
      console.error("Erro ao atualizar agente:", error);
    }
  };

  const handleDeleteAgent = async (agent: Agent) => {
    if (!confirm(`Tem certeza que deseja excluir o agente "${agent.name}"?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/agents/${agent.id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setAgents((prev) => prev.filter((a) => a.id !== agent.id));
      }
    } catch (error) {
      console.error("Erro ao deletar agente:", error);
    }
  };

  const handleEditorClose = (saved?: boolean) => {
    setShowEditor(false);
    setSelectedAgent(null);
    setIsCreating(false);
    if (saved) {
      router.refresh();
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "COMPLETED":
        return "bg-green-500/20 text-green-400";
      case "PROCESSING":
        return "bg-yellow-500/20 text-yellow-400";
      case "FAILED":
        return "bg-red-500/20 text-red-400";
      default:
        return "bg-slate-500/20 text-slate-400";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "COMPLETED":
        return "Vetorizado";
      case "PROCESSING":
        return "Processando";
      case "FAILED":
        return "Erro";
      default:
        return "Pendente";
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <header className="bg-slate-800/50 border-b border-slate-700/50 px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <Link
              href="/admin"
              className="text-slate-400 hover:text-white transition"
            >
              ← Voltar
            </Link>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Agentes / Personas</h1>
              <p className="text-sm text-slate-400">Gerencie assistentes personalizados</p>
            </div>
          </div>

          <button
            onClick={handleCreateAgent}
            className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-lg font-medium hover:opacity-90 transition flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Novo Agente
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {agents.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-full bg-slate-700/50 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">Nenhum agente criado</h2>
            <p className="text-slate-400 mb-6">
              Crie seu primeiro agente personalizado para começar.
            </p>
            <button
              onClick={handleCreateAgent}
              className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-lg font-medium hover:opacity-90 transition"
            >
              Criar Primeiro Agente
            </button>
          </div>
        ) : (
          <div className="grid gap-6">
            {agents.map((agent) => (
              <div
                key={agent.id}
                className="bg-slate-800/50 rounded-2xl border border-slate-700/50 overflow-hidden"
              >
                <div className="p-6">
                  <div className="flex items-start gap-4">
                    {/* Avatar */}
                    <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center overflow-hidden flex-shrink-0">
                      {agent.avatar ? (
                        <img
                          src={getAvatarUrl(agent.avatar) || ""}
                          alt={agent.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="text-lg font-semibold text-white truncate">
                          {agent.name}
                        </h3>
                        {agent.isDefault && (
                          <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded text-xs font-medium">
                            Padrão
                          </span>
                        )}
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${
                            agent.isActive
                              ? "bg-green-500/20 text-green-400"
                              : "bg-slate-600/50 text-slate-400"
                          }`}
                        >
                          {agent.isActive ? "Ativo" : "Inativo"}
                        </span>
                      </div>
                      <p className="text-slate-400 text-sm line-clamp-2 mb-3">
                        {agent.description || "Sem descrição"}
                      </p>
                      <div className="flex items-center gap-4 text-sm text-slate-500">
                        <span>{agent._count.conversations} conversas</span>
                        <span>•</span>
                        <span>{agent._count.knowledgeBase} documentos</span>
                        <span>•</span>
                        <span>Criado em {formatDate(agent.createdAt)}</span>
                        {agent.voiceSample && (
                          <>
                            <span>•</span>
                            <span className="text-purple-400">🎙️ Voz personalizada</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setShowKnowledge(showKnowledge === agent.id ? null : agent.id)}
                        className="p-2 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition"
                        title="Base de conhecimento"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleEditAgent(agent)}
                        className="p-2 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition"
                        title="Editar"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleToggleActive(agent)}
                        className={`p-2 rounded-lg transition ${
                          agent.isActive
                            ? "text-green-400 hover:bg-green-500/20"
                            : "text-slate-400 hover:bg-slate-700/50"
                        }`}
                        title={agent.isActive ? "Desativar" : "Ativar"}
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          {agent.isActive ? (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          ) : (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                          )}
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDeleteAgent(agent)}
                        className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg transition"
                        title="Excluir"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Knowledge Base Expandable */}
                {showKnowledge === agent.id && (
                  <div className="border-t border-slate-700/50 p-6 bg-slate-900/30">
                    <KnowledgeUploader
                      agentId={agent.id}
                      documents={agent.knowledgeBase}
                      onUpdate={() => router.refresh()}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Editor Modal */}
      {showEditor && (
        <AgentEditor
          agent={isCreating ? null : selectedAgent}
          onClose={handleEditorClose}
        />
      )}
    </div>
  );
}
