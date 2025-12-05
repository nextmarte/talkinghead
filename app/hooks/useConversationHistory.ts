"use client";

import { useState, useCallback, useEffect } from "react";

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

interface Conversation {
  id: string;
  title: string | null;
  mode: "PUSH_TO_TALK" | "LIVE_CALL";
  createdAt: string;
  updatedAt: string;
  messages?: Message[];
  _count?: { messages: number };
}

export function useConversationHistory() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lista conversas do usuário
  const fetchConversations = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/conversations");
      if (!res.ok) throw new Error("Erro ao carregar conversas");
      const data = await res.json();
      // API retorna objeto para admin { conversations, total } ou array para usuário normal
      const conversationsList = Array.isArray(data) ? data : (data.conversations || []);
      setConversations(conversationsList);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
      setConversations([]); // Garante que sempre seja um array
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Cria nova conversa
  const createConversation = useCallback(async (mode: "PUSH_TO_TALK" | "LIVE_CALL") => {
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      if (!res.ok) throw new Error("Erro ao criar conversa");
      const conversation = await res.json();
      setCurrentConversation({ ...conversation, messages: [] });
      setConversations((prev) => [conversation, ...prev]);
      return conversation;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
      return null;
    }
  }, []);

  // Carrega conversa específica
  const loadConversation = useCallback(async (id: string) => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/conversations/${id}`);
      if (!res.ok) throw new Error("Erro ao carregar conversa");
      const conversation = await res.json();
      setCurrentConversation(conversation);
      return conversation;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Adiciona mensagem à conversa atual
  const addMessage = useCallback(
    async (
      role: "USER" | "ASSISTANT",
      content: string,
      latency?: {
        sttLatencyMs?: number;
        llmLatencyMs?: number;
        ttsLatencyMs?: number;
        totalLatencyMs?: number;
      }
    ) => {
      if (!currentConversation) return null;

      try {
        const res = await fetch(`/api/conversations/${currentConversation.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role,
            content,
            ...latency,
          }),
        });
        if (!res.ok) throw new Error("Erro ao salvar mensagem");
        const message = await res.json();

        // Atualiza estado local
        setCurrentConversation((prev) =>
          prev
            ? {
                ...prev,
                messages: [...(prev.messages || []), message],
                title: prev.title || (role === "USER" ? content.slice(0, 50) : prev.title),
              }
            : null
        );

        return message;
      } catch (err) {
        console.error("Erro ao salvar mensagem:", err);
        return null;
      }
    },
    [currentConversation]
  );

  // Deleta conversa
  const deleteConversation = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/conversations/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Erro ao deletar conversa");

      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (currentConversation?.id === id) {
        setCurrentConversation(null);
      }
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
      return false;
    }
  }, [currentConversation]);

  // Nova conversa (limpa a atual)
  const newConversation = useCallback(() => {
    setCurrentConversation(null);
  }, []);

  // Carrega conversas ao montar
  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  return {
    conversations,
    currentConversation,
    isLoading,
    error,
    fetchConversations,
    createConversation,
    loadConversation,
    addMessage,
    deleteConversation,
    newConversation,
  };
}
