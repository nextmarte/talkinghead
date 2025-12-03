"use client";

import { useSession } from "next-auth/react";
import { useConversationHistory } from "@/app/hooks/useConversationHistory";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function ConversationsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const { conversations, isLoading, deleteConversation } = useConversationHistory();

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm("Tem certeza que deseja excluir esta conversa?")) {
      await deleteConversation(id);
    }
  };

  const handleSelectConversation = (id: string) => {
    // Redireciona para a home com a conversa selecionada
    router.push(`/?conversation=${id}`);
  };

  if (!session) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <header className="px-6 py-4 border-b border-slate-700/50">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-xl font-semibold text-white">Histórico de Conversas</h1>
              <p className="text-sm text-slate-400">
                {conversations.length} conversa{conversations.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          
          <Link
            href="/"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg 
                     flex items-center gap-2 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nova Conversa
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : conversations.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-800 flex items-center justify-center">
              <svg className="w-8 h-8 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <p className="text-slate-400 text-lg">Nenhuma conversa ainda</p>
            <p className="text-slate-500 text-sm mt-2">
              Comece uma nova conversa para ver o histórico aqui
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {conversations.map((conv) => (
              <div
                key={conv.id}
                onClick={() => handleSelectConversation(conv.id)}
                className="bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 
                         rounded-xl p-4 cursor-pointer transition-colors group"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`text-sm px-2 py-1 rounded-lg ${
                        conv.mode === "LIVE_CALL" 
                          ? "bg-emerald-500/20 text-emerald-400"
                          : "bg-purple-500/20 text-purple-400"
                      }`}>
                        {conv.mode === "LIVE_CALL" ? "📞 Ligação Direta" : "🎤 Push-to-Talk"}
                      </span>
                      <span className="text-sm text-slate-500">
                        {format(new Date(conv.createdAt), "dd 'de' MMMM 'às' HH:mm", { locale: ptBR })}
                      </span>
                    </div>
                    
                    <h3 className="text-lg font-medium text-white truncate">
                      {conv.title || "Conversa sem título"}
                    </h3>
                    
                    {conv.messages && conv.messages.length > 0 && (
                      <p className="text-slate-400 text-sm mt-1 line-clamp-2">
                        {conv.messages[0]?.content || ""}
                      </p>
                    )}
                    
                    <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
                      <span>{conv._count?.messages || 0} mensagens</span>
                    </div>
                  </div>
                  
                  <button
                    onClick={(e) => handleDelete(e, conv.id)}
                    className="opacity-0 group-hover:opacity-100 p-2 text-slate-500 
                             hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                    title="Excluir conversa"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
