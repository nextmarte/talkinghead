"use client";

import { useEffect, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import ConversationViewer from "./ConversationViewer";
import UserActions from "./UserActions";
import InvitationManager from "./InvitationManager";
import CreateUserModal from "./CreateUserModal";

interface User {
  id: string;
  name: string | null;
  email: string;
  role: string;
  createdAt: Date;
  _count: { conversations: number };
}

interface Conversation {
  id: string;
  title: string | null;
  mode: string;
  createdAt: Date;
  user: { name: string | null; email: string };
  agent?: { id: string; name: string } | null;
  _count: { messages: number };
}

interface Stats {
  usersCount: number;
  conversationsCount: number;
  messagesCount: number;
}

interface AdminDashboardProps {
  stats: Stats;
  recentUsers: User[];
  recentConversations: Conversation[];
}

export default function AdminDashboard({
  stats,
  recentUsers,
  recentConversations,
}: AdminDashboardProps) {
  const { data: session } = useSession();
  const [activeTab, setActiveTab] = useState<"overview" | "users" | "conversations" | "invitations">("overview");
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  
  // Usuários
  const [userPage, setUserPage] = useState(1);
  const [userSearch, setUserSearch] = useState("");
  const [filteredUsers, setFilteredUsers] = useState(recentUsers);
  const usersPerPage = 10;
  
  // Conversas
  const [conversationPage, setConversationPage] = useState(1);
  const [conversationSearch, setConversationSearch] = useState("");
  const [conversationAgentFilter, setConversationAgentFilter] = useState("");
  const [conversationModeFilter, setConversationModeFilter] = useState("");
  const [allConversations, setAllConversations] = useState(recentConversations);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const conversationsPerPage = 15;

  useEffect(() => {
    const filtered = recentUsers.filter((user) => {
      const searchLower = userSearch.toLowerCase();
      return (
        !userSearch ||
        user.name?.toLowerCase().includes(searchLower) ||
        user.email.toLowerCase().includes(searchLower)
      );
    });
    setFilteredUsers(filtered);
    setUserPage(1);
  }, [userSearch]);

  useEffect(() => {
    const loadConversations = async () => {
      setLoadingConversations(true);
      try {
        const params = new URLSearchParams({
          page: "1",
          limit: "100",
          ...(conversationSearch && { search: conversationSearch }),
          ...(conversationAgentFilter && { agentId: conversationAgentFilter }),
          ...(conversationModeFilter && { mode: conversationModeFilter }),
        });

        const res = await fetch(`/api/admin/conversations?${params}`);
        if (res.ok) {
          const data = await res.json();
          setAllConversations(data.data);
          setConversationPage(1);
        }
      } catch (error) {
        console.error("Erro ao carregar conversas:", error);
      } finally {
        setLoadingConversations(false);
      }
    };

    const timer = setTimeout(() => {
      loadConversations();
    }, 300);

    return () => clearTimeout(timer);
  }, [conversationSearch, conversationAgentFilter, conversationModeFilter]);

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <header className="bg-slate-800/50 border-b border-slate-700/50 px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Painel Admin</h1>
              <p className="text-sm text-slate-400">TalkingHead AI</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="px-4 py-2 text-slate-300 hover:text-white transition"
            >
              ← Voltar ao App
            </Link>
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-400">{session?.user?.email}</span>
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition"
              >
                Sair
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Quick Actions */}
        <div className="mb-8">
          <Link
            href="/admin/agents"
            className="inline-flex items-center gap-3 px-6 py-4 bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30 rounded-xl hover:from-purple-500/30 hover:to-pink-500/30 transition group"
          >
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <p className="font-medium text-white group-hover:text-purple-300 transition">Gerenciar Agentes</p>
              <p className="text-sm text-slate-400">Criar e editar personas personalizadas com RAG</p>
            </div>
            <svg className="w-5 h-5 text-slate-400 group-hover:text-white transition ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700/50">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <div>
                <p className="text-3xl font-bold text-white">{stats.usersCount}</p>
                <p className="text-slate-400">Usuários</p>
              </div>
            </div>
          </div>

          <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700/50">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <div>
                <p className="text-3xl font-bold text-white">{stats.conversationsCount}</p>
                <p className="text-slate-400">Conversas</p>
              </div>
            </div>
          </div>

          <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700/50">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                </svg>
              </div>
              <div>
                <p className="text-3xl font-bold text-white">{stats.messagesCount}</p>
                <p className="text-slate-400">Mensagens</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {(["overview", "users", "conversations", "invitations"] as const).map((tab) => {
            const icons = {
              overview: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              ),
              users: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ),
              conversations: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              ),
              invitations: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              ),
            };
            
            const labels = {
              overview: "Visão Geral",
              users: "Usuários",
              conversations: "Conversas",
              invitations: "Convites",
            };
            
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition ${
                  activeTab === tab
                    ? "bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg shadow-blue-500/20"
                    : "bg-slate-700/50 text-slate-300 hover:text-white hover:bg-slate-700"
                }`}
              >
                {icons[tab]}
                {labels[tab]}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 overflow-hidden">
          {/* Users Tab */}
          {(activeTab === "overview" || activeTab === "users") && (
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                  </div>
                  <h2 className="text-lg font-semibold text-white">
                    {activeTab === "overview" ? "Usuários Recentes" : "Todos os Usuários"}
                  </h2>
                </div>
                {activeTab === "users" && (
                  <div className="flex items-center gap-3">
                    <input
                      type="text"
                      placeholder="Buscar por nome ou email..."
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      className="px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    <button
                      onClick={() => setShowCreateUserModal(true)}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition whitespace-nowrap"
                    >
                      + Criar Usuário
                    </button>
                  </div>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="text-left py-3 px-4 text-slate-400 font-medium">Nome</th>
                      <th className="text-left py-3 px-4 text-slate-400 font-medium">Email</th>
                      <th className="text-left py-3 px-4 text-slate-400 font-medium">Role</th>
                      <th className="text-left py-3 px-4 text-slate-400 font-medium">Conversas</th>
                      <th className="text-left py-3 px-4 text-slate-400 font-medium">Criado em</th>
                      <th className="text-left py-3 px-4 text-slate-400 font-medium">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(activeTab === "users" ? filteredUsers : recentUsers.slice(0, 5))
                      .slice((userPage - 1) * usersPerPage, userPage * usersPerPage)
                      .map((user) => (
                      <tr key={user.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                        <td className="py-3 px-4 text-white">{user.name || "-"}</td>
                        <td className="py-3 px-4 text-slate-300">{user.email}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-1 rounded text-xs font-medium ${
                              user.role === "ADMIN"
                                ? "bg-purple-500/20 text-purple-400"
                                : "bg-slate-600/50 text-slate-300"
                            }`}
                          >
                            {user.role}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-300">{user._count.conversations}</td>
                        <td className="py-3 px-4 text-slate-400 text-sm">{formatDate(user.createdAt)}</td>
                        <td className="py-3 px-4">
                          <UserActions user={user} onActionComplete={() => window.location.reload()} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {/* Paginação de Usuários */}
              {activeTab === "users" && filteredUsers.length > usersPerPage && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-slate-400">
                    Mostrando {((userPage - 1) * usersPerPage) + 1} - {Math.min(userPage * usersPerPage, filteredUsers.length)} de {filteredUsers.length}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setUserPage(Math.max(1, userPage - 1))}
                      disabled={userPage === 1}
                      className="px-3 py-1 bg-slate-700 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-600 transition"
                    >
                      Anterior
                    </button>
                    <span className="px-3 py-1 text-slate-300">
                      Página {userPage} de {Math.ceil(filteredUsers.length / usersPerPage)}
                    </span>
                    <button
                      onClick={() => setUserPage(Math.min(Math.ceil(filteredUsers.length / usersPerPage), userPage + 1))}
                      disabled={userPage >= Math.ceil(filteredUsers.length / usersPerPage)}
                      className="px-3 py-1 bg-slate-700 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-600 transition"
                    >
                      Próxima
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Conversations Tab */}
          {(activeTab === "overview" || activeTab === "conversations") && (
            <div className="p-6 border-t border-slate-700/50">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center">
                    <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </div>
                  <h2 className="text-lg font-semibold text-white">
                    {activeTab === "overview" ? "Conversas Recentes" : "Todas as Conversas"}
                  </h2>
                </div>
                {activeTab === "conversations" && (
                  <div className="flex items-center gap-3">
                    <input
                      type="text"
                      placeholder="Buscar conversas..."
                      value={conversationSearch}
                      onChange={(e) => setConversationSearch(e.target.value)}
                      className="px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    <select
                      value={conversationModeFilter}
                      onChange={(e) => setConversationModeFilter(e.target.value)}
                      className="px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="">Todos os Modos</option>
                      <option value="LIVE_CALL">Ligação</option>
                      <option value="PUSH_TO_TALK">Push-to-Talk</option>
                    </select>
                  </div>
                )}
              </div>
              
              {loadingConversations && activeTab === "conversations" ? (
                <div className="text-center py-8">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
                  <p className="text-slate-400 mt-2">Carregando conversas...</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-slate-700">
                          <th className="text-left py-3 px-4 text-slate-400 font-medium">Usuário</th>
                          <th className="text-left py-3 px-4 text-slate-400 font-medium">Agente</th>
                          <th className="text-left py-3 px-4 text-slate-400 font-medium">Modo</th>
                          <th className="text-left py-3 px-4 text-slate-400 font-medium">Msgs</th>
                          <th className="text-left py-3 px-4 text-slate-400 font-medium">Criada em</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(activeTab === "conversations" ? allConversations : recentConversations.slice(0, 5))
                          .slice((conversationPage - 1) * conversationsPerPage, conversationPage * conversationsPerPage)
                          .map((conv) => (
                          <tr 
                            key={conv.id} 
                            className="border-b border-slate-700/50 hover:bg-slate-700/30 cursor-pointer"
                            onClick={() => setSelectedConversationId(conv.id)}
                          >
                            <td className="py-3 px-4 text-white">{conv.user.name || conv.user.email}</td>
                            <td className="py-3 px-4 text-slate-300">
                              <span className="px-2 py-1 bg-purple-500/20 text-purple-400 rounded text-xs font-medium">
                                {conv.agent?.name || "Assistente Geral"}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={`px-2 py-1 rounded text-xs font-medium ${
                                  conv.mode === "LIVE_CALL"
                                    ? "bg-green-500/20 text-green-400"
                                    : "bg-blue-500/20 text-blue-400"
                                }`}
                              >
                                {conv.mode === "LIVE_CALL" ? "Ligação" : "Push-to-Talk"}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-slate-300">{conv._count.messages}</td>
                            <td className="py-3 px-4 text-slate-400 text-sm">{formatDate(conv.createdAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  
                  {/* Paginação de Conversas */}
                  {activeTab === "conversations" && allConversations.length > conversationsPerPage && (
                    <div className="flex items-center justify-between mt-4">
                      <p className="text-sm text-slate-400">
                        Mostrando {((conversationPage - 1) * conversationsPerPage) + 1} - {Math.min(conversationPage * conversationsPerPage, allConversations.length)} de {allConversations.length}
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setConversationPage(Math.max(1, conversationPage - 1))}
                          disabled={conversationPage === 1}
                          className="px-3 py-1 bg-slate-700 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-600 transition"
                        >
                          Anterior
                        </button>
                        <span className="px-3 py-1 text-slate-300">
                          Página {conversationPage} de {Math.ceil(allConversations.length / conversationsPerPage)}
                        </span>
                        <button
                          onClick={() => setConversationPage(Math.min(Math.ceil(allConversations.length / conversationsPerPage), conversationPage + 1))}
                          disabled={conversationPage >= Math.ceil(allConversations.length / conversationsPerPage)}
                          className="px-3 py-1 bg-slate-700 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-600 transition"
                        >
                          Próxima
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Invitations Tab */}
          {activeTab === "invitations" && (
            <div className="p-6">
              <InvitationManager />
            </div>
          )}
        </div>
      </main>

      {/* Conversation Viewer Modal */}
      {selectedConversationId && (
        <ConversationViewer
          conversationId={selectedConversationId}
          onClose={() => setSelectedConversationId(null)}
        />
      )}

      <CreateUserModal
        isOpen={showCreateUserModal}
        onClose={() => setShowCreateUserModal(false)}
        onUserCreated={() => window.location.reload()}
      />
    </div>
  );
}
