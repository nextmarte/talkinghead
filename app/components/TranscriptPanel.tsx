'use client';

import { useEffect, useRef, useState } from 'react';

interface Message {
  id: string;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM';
  content: string;
  createdAt: string;
}

interface TranscriptPanelProps {
  transcript: string;
  response: string;
  status: 'idle' | 'connecting' | 'connected' | 'ended';
  messages?: Message[];
  onSendMessage?: (message: string) => void;
}

export default function TranscriptPanel({ 
  transcript, 
  response, 
  status, 
  messages = [],
  onSendMessage 
}: TranscriptPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript, response, messages]);

  // Enviar mensagem digitada
  const handleSend = async () => {
    if (!inputText.trim() || !onSendMessage || isSending) return;
    
    setIsSending(true);
    try {
      await onSendMessage(inputText.trim());
      setInputText('');
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Filtra mensagens para evitar duplicação com transcript/response atuais
  const filteredMessages = messages.filter(msg => {
    // Se a última mensagem do usuário é igual ao transcript atual, não mostra
    if (msg.role === 'USER' && msg.content === transcript) return false;
    // Se a última resposta é igual ao response atual, não mostra
    if (msg.role === 'ASSISTANT' && msg.content === response) return false;
    return true;
  });

  return (
    <div className="w-full lg:w-96 bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-700/50">
        <h3 className="font-semibold text-white">Transcrição</h3>
        <p className="text-xs text-slate-400">
          {messages.length > 0 ? `${messages.length} mensagens` : 'Conversa em tempo real'}
        </p>
      </div>

      {/* Content */}
      <div 
        ref={scrollRef}
        className="flex-1 p-4 space-y-4 overflow-y-auto max-h-[350px] lg:max-h-[500px]"
      >
        {status === 'idle' && messages.length === 0 && (
          <div className="text-center text-slate-500 py-8">
            <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <p>Inicie uma chamada para ver a transcrição</p>
          </div>
        )}

        {status === 'connecting' && (
          <div className="text-center text-yellow-400 py-8">
            <div className="w-8 h-8 mx-auto mb-3 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
            <p>Conectando ao servidor...</p>
          </div>
        )}

        {/* Histórico de mensagens (filtrado) */}
        {filteredMessages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'USER' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${
              msg.role === 'USER' 
                ? 'bg-blue-500/20 border border-blue-500/30 rounded-br-sm'
                : 'bg-slate-700/50 border border-slate-600/50 rounded-bl-sm'
            }`}>
              <p className={`text-xs mb-1 font-medium ${msg.role === 'USER' ? 'text-blue-400' : 'text-purple-400'}`}>
                {msg.role === 'USER' ? 'Você' : 'Assistente'}
              </p>
              <p className="text-white">{msg.content}</p>
            </div>
          </div>
        ))}

        {(status === 'connected' || status === 'ended') && (
          <>
            {!transcript && !response && messages.length === 0 && (
              <div className="text-center text-slate-500 py-8">
                <p>Fale ou digite uma mensagem...</p>
              </div>
            )}

            {/* User message (current) */}
            {transcript && (
              <div className="flex justify-end">
                <div className="max-w-[80%] bg-blue-500/20 border border-blue-500/30 rounded-2xl rounded-br-sm px-4 py-3">
                  <p className="text-xs text-blue-400 mb-1 font-medium">Você</p>
                  <p className="text-white">{transcript}</p>
                </div>
              </div>
            )}

            {/* AI Response (current) */}
            {response && (
              <div className="flex justify-start">
                <div className="max-w-[80%] bg-slate-700/50 border border-slate-600/50 rounded-2xl rounded-bl-sm px-4 py-3">
                  <p className="text-xs text-purple-400 mb-1 font-medium">Assistente</p>
                  <p className="text-white">{response}</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Input de texto */}
      {status === 'connected' && onSendMessage && (
        <div className="px-4 py-3 border-t border-slate-700/50">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Digite uma mensagem..."
              disabled={isSending}
              className="flex-1 bg-slate-700/50 border border-slate-600 rounded-xl px-4 py-2 text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={!inputText.trim() || isSending}
              className="p-2 bg-purple-500 hover:bg-purple-600 disabled:bg-slate-600 disabled:cursor-not-allowed rounded-xl transition"
            >
              {isSending ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Footer status */}
      {status === 'connected' && !onSendMessage && (
        <div className="px-4 py-3 border-t border-slate-700/50">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs text-slate-400">Conectado</span>
          </div>
        </div>
      )}
    </div>
  );
}
