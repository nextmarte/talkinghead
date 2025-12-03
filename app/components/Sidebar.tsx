"use client";

import { useSession, signOut } from "next-auth/react";
import { useConversationHistory } from "@/app/hooks/useConversationHistory";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import Link from "next/link";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  currentConversationId?: string | null;
}

export default function Sidebar({
  isOpen,
  onClose,
  onSelectConversation,
  onNewConversation,
  currentConversationId,
}: SidebarProps) {
  const { data: session } = useSession();
  const { conversations, isLoading, deleteConversation } = useConversationHistory();

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm("Tem certeza que deseja excluir esta conversa?")) {
      await deleteConversation(id);
    }
  };

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 h-full w-72 bg-slate-900 border-r border-slate-700/50 z-50 
        transform transition-transform duration-300 ease-in-out flex flex-col
        ${isOpen ? "translate-x-0" : "-translate-x-full"} 
        lg:translate-x-0 lg:relative`}
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-700/50">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Conversas</h2>
            <button
              onClick={onClose}
              className="lg:hidden text-slate-400 hover:text-white"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          <button
            onClick={onNewConversation}
            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg 
                     flex items-center justify-center gap-2 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nova Conversa
          </button>
        </div>

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto p-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : conversations.length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-8">
              Nenhuma conversa ainda
            </p>
          ) : (
            <>
              <ul className="space-y-1">
                {conversations.slice(0, 5).map((conv) => (
                  <li key={conv.id}>
                    <button
                      onClick={() => onSelectConversation(conv.id)}
                      className={`w-full text-left px-3 py-2 rounded-lg transition-colors group
                        ${currentConversationId === conv.id
                          ? "bg-blue-600/20 text-blue-400"
                          : "text-slate-300 hover:bg-slate-800"
                        }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">
                            {conv.title || "Nova conversa"}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                              conv.mode === "LIVE_CALL" 
                                ? "bg-emerald-500/20 text-emerald-400"
                                : "bg-purple-500/20 text-purple-400"
                            }`}>
                              {conv.mode === "LIVE_CALL" ? "📞" : "🎤"}
                            </span>
                            <span className="text-xs text-slate-500">
                              {format(new Date(conv.createdAt), "dd/MM · HH:mm", { locale: ptBR })}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={(e) => handleDelete(e, conv.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 
                                   hover:text-red-400 transition-opacity"
                          title="Excluir"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
              
              {/* Ver todas as conversas */}
              {conversations.length > 5 && (
                <Link
                  href="/conversations"
                  className="mt-3 w-full px-3 py-2 text-sm text-slate-400 hover:text-white 
                           hover:bg-slate-800 rounded-lg flex items-center justify-center gap-2 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                      d="M19 9l-7 7-7-7" />
                  </svg>
                  Ver todas ({conversations.length})
                </Link>
              )}
            </>
          )}
        </div>

        {/* User Footer */}
        <div className="p-4 border-t border-slate-700/50">
          {session?.user && (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 
                            flex items-center justify-center text-white font-medium">
                {session.user.name?.charAt(0).toUpperCase() || "U"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {session.user.name}
                </p>
                <p className="text-xs text-slate-500 truncate">
                  {session.user.email}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {session.user.role === "ADMIN" && (
                  <Link
                    href="/admin"
                    className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                    title="Painel Admin"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </Link>
                )}
                <button
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors"
                  title="Sair"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
