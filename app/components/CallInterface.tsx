'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useConversation } from '@/app/hooks/useConversation';
import { useCallStore } from '@/app/store/callStore';
import Avatar from './Avatar';
import CallControls from './CallControls';
import TranscriptPanel from './TranscriptPanel';
import StatusBar from './StatusBar';

export default function CallInterface() {
  const {
    isConnected,
    isRecording,
    isProcessing,
    isSpeaking,
    transcript,
    response,
    latency,
    error,
    connect,
    disconnect,
    startRecording,
    stopRecording,
    resetConversation,
  } = useConversation();

  const { status, duration, isMuted, setStatus, incrementDuration, resetDuration, reset } = useCallStore();
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
    setStatus('ended');
    disconnect();
    setTimeout(() => reset(), 2000);
  }, [disconnect, setStatus, reset]);

  // Push-to-talk handlers
  const handlePushToTalkStart = useCallback(() => {
    if (!isMuted && status === 'connected') {
      startRecording();
    }
  }, [isMuted, status, startRecording]);

  const handlePushToTalkEnd = useCallback(() => {
    stopRecording();
  }, [stopRecording]);

  // Formata duração
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col">
      {/* Header */}
      <header className="px-6 py-4 flex items-center justify-between border-b border-slate-700/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-semibold text-white">TalkingHead AI</h1>
            <p className="text-sm text-slate-400">Assistente Virtual</p>
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
                <span className={`
                  px-3 py-1 rounded-full text-xs font-medium
                  ${isRecording ? 'bg-red-500/20 text-red-400 animate-pulse' : 
                    isProcessing ? 'bg-yellow-500/20 text-yellow-400' :
                    isSpeaking ? 'bg-green-500/20 text-green-400' :
                    'bg-slate-700/50 text-slate-400'}
                `}>
                  {isRecording ? '🎤 Ouvindo...' : 
                   isProcessing ? '🧠 Processando...' :
                   isSpeaking ? '🔊 Falando...' :
                   '⏸️ Aguardando'}
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
              {status === 'connected' && 'Em chamada'}
              {status === 'ended' && 'Chamada encerrada'}
            </p>
          </div>

          {/* Error Display */}
          {error && (
            <div className="mb-4 px-4 py-2 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Call Controls */}
          <CallControls
            status={status}
            isMuted={isMuted}
            isRecording={isRecording}
            onStartCall={handleStartCall}
            onEndCall={handleEndCall}
            onToggleMute={() => useCallStore.getState().toggleMute()}
            onPushToTalkStart={handlePushToTalkStart}
            onPushToTalkEnd={handlePushToTalkEnd}
            onReset={resetConversation}
          />
        </div>

        {/* Transcript Panel */}
        <TranscriptPanel 
          transcript={transcript}
          response={response}
          status={status}
        />
      </main>
    </div>
  );
}
