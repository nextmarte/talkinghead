'use client';

import { useEffect, useRef } from 'react';

interface TranscriptPanelProps {
  transcript: string;
  response: string;
  status: 'idle' | 'connecting' | 'connected' | 'ended';
}

export default function TranscriptPanel({ transcript, response, status }: TranscriptPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript, response]);

  return (
    <div className="w-full lg:w-96 bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-700/50">
        <h3 className="font-semibold text-white">Transcrição</h3>
        <p className="text-xs text-slate-400">Conversa em tempo real</p>
      </div>

      {/* Content */}
      <div 
        ref={scrollRef}
        className="flex-1 p-4 space-y-4 overflow-y-auto max-h-[400px] lg:max-h-[600px]"
      >
        {status === 'idle' && (
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

        {(status === 'connected' || status === 'ended') && (
          <>
            {!transcript && !response && (
              <div className="text-center text-slate-500 py-8">
                <p>Segure o botão e fale...</p>
              </div>
            )}

            {/* User message */}
            {transcript && (
              <div className="flex justify-end">
                <div className="max-w-[80%] bg-blue-500/20 border border-blue-500/30 rounded-2xl rounded-br-sm px-4 py-3">
                  <p className="text-xs text-blue-400 mb-1 font-medium">Você</p>
                  <p className="text-white">{transcript}</p>
                </div>
              </div>
            )}

            {/* AI Response */}
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

      {/* Footer */}
      {status === 'connected' && (
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
