'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useStreamingConversation } from '@/app/hooks/useStreamingConversation';
import { useCallStore } from '@/app/store/callStore';
import Avatar from './Avatar';
import TranscriptPanel from './TranscriptPanel';
import StatusBar from './StatusBar';

export default function StreamingCallInterface() {
  const {
    isConnected,
    isListening,
    isProcessing,
    isSpeaking,
    isUserSpeaking,
    transcript,
    response,
    responsePreview,
    latency,
    error,
    connect,
    disconnect,
    startListening,
    stopListening,
    toggleListening,
    interrupt,
    resetConversation,
  } = useStreamingConversation();

  const { status, duration, isMuted, setStatus, incrementDuration, resetDuration, reset, toggleMute } = useCallStore();
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Timer de duração da chamada
  useEffect(() => {
    if (status === 'connected') {
      timerRef.current = setInterval(incrementDuration, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [status, incrementDuration]);

  // Sincroniza estado de conexão
  useEffect(() => {
    if (isConnected && status === 'connecting') {
      setStatus('connected');
    }
  }, [isConnected, status, setStatus]);

  // Inicia chamada
  const handleStartCall = useCallback(() => {
    setStatus('connecting');
    resetDuration();
    connect();
  }, [connect, setStatus, resetDuration]);

  // Encerra chamada
  const handleEndCall = useCallback(() => {
    stopListening();
    setStatus('ended');
    disconnect();
    setTimeout(() => reset(), 2000);
  }, [disconnect, stopListening, setStatus, reset]);

  // Toggle listening (modo streaming contínuo)
  const handleToggleListening = useCallback(() => {
    if (isMuted) return;
    toggleListening();
  }, [isMuted, toggleListening]);

  // Auto-start listening quando conecta
  useEffect(() => {
    if (isConnected && status === 'connected' && !isListening && !isMuted) {
      // Delay pequeno para UI mostrar conexão
      const timer = setTimeout(() => {
        startListening();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isConnected, status, isListening, isMuted, startListening]);

  // Para listening quando muta
  useEffect(() => {
    if (isMuted && isListening) {
      stopListening();
    }
  }, [isMuted, isListening, stopListening]);

  // Formata duração
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Status atual
  const getCurrentStatus = () => {
    if (isUserSpeaking) return { text: '🎤 Ouvindo você...', color: 'bg-red-500/20 text-red-400 animate-pulse' };
    if (isProcessing) return { text: '🧠 Processando...', color: 'bg-yellow-500/20 text-yellow-400' };
    if (isSpeaking) return { text: '🔊 Respondendo...', color: 'bg-green-500/20 text-green-400 animate-pulse' };
    if (isListening) return { text: '👂 Escutando...', color: 'bg-blue-500/20 text-blue-400' };
    return { text: '⏸️ Aguardando', color: 'bg-slate-700/50 text-slate-400' };
  };

  const currentStatus = getCurrentStatus();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col">
      {/* Header */}
      <header className="px-6 py-4 flex items-center justify-between border-b border-slate-700/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-semibold text-white">TalkingHead AI</h1>
            <p className="text-sm text-emerald-400">Modo Streaming • Tempo Real</p>
          </div>
        </div>
        
        <StatusBar 
          status={status} 
          duration={formatDuration(duration)}
          latency={latency}
        />
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col lg:flex-row gap-6 p-6">
        {/* Call Area */}
        <div className="flex-1 flex flex-col items-center justify-center">
          {/* Avatar */}
          <div className="relative mb-8">
            <Avatar 
              isSpeaking={isSpeaking} 
              isProcessing={isProcessing}
              status={status}
            />
            
            {/* Status indicator */}
            {status === 'connected' && (
              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2">
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${currentStatus.color}`}>
                  {currentStatus.text}
                </span>
              </div>
            )}
          </div>

          {/* Agent Info */}
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-white mb-1">Assistente Virtual</h2>
            <p className="text-slate-400">
              {status === 'idle' && 'Pronto para conectar'}
              {status === 'connecting' && 'Conectando...'}
              {status === 'connected' && (isListening ? 'Ligação ativa - Fale a qualquer momento' : 'Em espera')}
              {status === 'ended' && 'Chamada encerrada'}
            </p>
          </div>

          {/* Response Preview (streaming) */}
          {responsePreview && (
            <div className="mb-4 px-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg max-w-md">
              <p className="text-slate-300 text-sm">
                {responsePreview}
                <span className="animate-pulse">▌</span>
              </p>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="mb-4 px-4 py-2 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Call Controls - Streaming Mode */}
          <div className="flex flex-col items-center gap-4">
            {status === 'idle' || status === 'ended' ? (
              // Botão iniciar chamada
              <button
                onClick={handleStartCall}
                className="w-20 h-20 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 
                         hover:from-green-400 hover:to-emerald-500 
                         flex items-center justify-center shadow-lg shadow-green-500/25
                         transition-all duration-200 hover:scale-105 active:scale-95"
              >
                <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              </button>
            ) : status === 'connecting' ? (
              // Conectando
              <div className="w-20 h-20 rounded-full bg-slate-700 flex items-center justify-center animate-pulse">
                <svg className="w-8 h-8 text-slate-400 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
            ) : (
              // Em chamada - controles
              <div className="flex items-center gap-4">
                {/* Mute */}
                <button
                  onClick={toggleMute}
                  className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200
                    ${isMuted 
                      ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' 
                      : 'bg-slate-700/50 text-slate-300 hover:bg-slate-600/50'}`}
                  title={isMuted ? 'Desmutar' : 'Mutar'}
                >
                  {isMuted ? (
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                    </svg>
                  ) : (
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                  )}
                </button>

                {/* Encerrar */}
                <button
                  onClick={handleEndCall}
                  className="w-20 h-20 rounded-full bg-gradient-to-br from-red-500 to-red-600 
                           hover:from-red-400 hover:to-red-500 
                           flex items-center justify-center shadow-lg shadow-red-500/25
                           transition-all duration-200 hover:scale-105 active:scale-95"
                >
                  <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
                  </svg>
                </button>

                {/* Interromper (quando agente está falando) */}
                {isSpeaking && (
                  <button
                    onClick={interrupt}
                    className="w-14 h-14 rounded-full bg-yellow-500/20 text-yellow-400 
                             hover:bg-yellow-500/30 flex items-center justify-center transition-all duration-200"
                    title="Interromper resposta"
                  >
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </button>
                )}

                {/* Reset */}
                <button
                  onClick={resetConversation}
                  className="w-14 h-14 rounded-full bg-slate-700/50 text-slate-300 
                           hover:bg-slate-600/50 flex items-center justify-center transition-all duration-200"
                  title="Nova conversa"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              </div>
            )}

            {/* Instruções */}
            {status === 'connected' && (
              <p className="text-sm text-slate-500 text-center mt-4 max-w-xs">
                💡 Fale naturalmente - o sistema detecta automaticamente quando você começa e termina de falar
              </p>
            )}
          </div>
        </div>

        {/* Transcript Panel */}
        <TranscriptPanel 
          transcript={transcript}
          response={response}
          status={status}
        />
      </main>

      {/* Latency Info (bottom) */}
      {latency && status === 'connected' && (
        <footer className="px-6 py-3 border-t border-slate-700/50 flex justify-center">
          <div className="flex items-center gap-6 text-xs text-slate-500">
            {latency.first_audio_ms !== undefined && (
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                1º áudio: {latency.first_audio_ms}ms
              </span>
            )}
            <span>STT: {latency.stt_ms}ms</span>
            <span>LLM: {latency.llm_ms}ms</span>
            {latency.total_ms && <span>Total: {latency.total_ms}ms</span>}
            {latency.sentences && <span>Sentenças: {latency.sentences}</span>}
            {latency.streaming && <span className="text-emerald-400">Streaming ✓</span>}
          </div>
        </footer>
      )}
    </div>
  );
}
