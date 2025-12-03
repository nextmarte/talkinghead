'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useConversation } from '@/app/hooks/useConversation';
import { useStreamingConversation } from '@/app/hooks/useStreamingConversation';
import { useConversationHistory } from '@/app/hooks/useConversationHistory';
import { useCallStore } from '@/app/store/callStore';
import Avatar from './Avatar';
import TranscriptPanel from './TranscriptPanel';
import StatusBar from './StatusBar';
import Sidebar from './Sidebar';
import UserMenu from './UserMenu';
import AgentSelector from './AgentSelector';

type ConversationMode = 'push-to-talk' | 'live-call';

// Tipo unificado para latência (suporta ambos os modos)
interface UnifiedLatency {
  stt_ms: number;
  llm_ms: number;
  tts_ms?: number;
  first_audio_ms?: number;
  total_ms?: number;
  sentences?: number;
  streaming?: boolean;
}

interface SelectedAgent {
  id: string;
  name: string;
  avatar: string | null;
}

export default function UnifiedCallInterface() {
  const [mode, setMode] = useState<ConversationMode>('push-to-talk');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<SelectedAgent | null>(null);
  
  // Hook para histórico de conversas
  const {
    currentConversation,
    createConversation,
    loadConversation,
    addMessage,
    newConversation,
  } = useConversationHistory();
  
  // Hook para push-to-talk
  const ptt = useConversation({ agentId: selectedAgentId });
  
  // Hook para live call (streaming)
  const live = useStreamingConversation({ agentId: selectedAgentId });
  
  // Seleciona o hook ativo baseado no modo
  const activeHook = mode === 'push-to-talk' ? ptt : live;
  
  const { status, duration, isMuted, setStatus, incrementDuration, resetDuration, reset, toggleMute } = useCallStore();
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedRef = useRef<{ transcript: string; response: string }>({ transcript: '', response: '' });

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
    if (activeHook.isConnected && status === 'connecting') {
      setStatus('connected');
    }
  }, [activeHook.isConnected, status, setStatus]);

  // Monitora desconexão inesperada
  useEffect(() => {
    if (status === 'connected' && !activeHook.isConnected) {
      console.log('⚠️ Desconexão detectada');
      setStatus('ended');
      setTimeout(() => setStatus('idle'), 2000);
    }
  }, [status, activeHook.isConnected, setStatus]);

  // Salva mensagens no histórico quando mudarem
  useEffect(() => {
    if (!currentConversation) return;
    
    const transcript = activeHook.transcript;
    const response = activeHook.response;
    
    // Salva mensagem do usuário
    if (transcript && transcript !== lastSavedRef.current.transcript) {
      addMessage('USER', transcript);
      lastSavedRef.current.transcript = transcript;
    }
    
    // Salva resposta do assistente
    if (response && response !== lastSavedRef.current.response) {
      const latency = activeHook.latency as UnifiedLatency | null;
      addMessage('ASSISTANT', response, {
        sttLatencyMs: latency?.stt_ms,
        llmLatencyMs: latency?.llm_ms,
        ttsLatencyMs: latency?.tts_ms,
        totalLatencyMs: latency?.total_ms,
      });
      lastSavedRef.current.response = response;
    }
  }, [activeHook.transcript, activeHook.response, activeHook.latency, currentConversation, addMessage]);

  // Quando muda de modo, desconecta o anterior
  const handleModeChange = useCallback((newMode: ConversationMode) => {
    if (status === 'connected') {
      // Desconecta o modo atual
      if (mode === 'push-to-talk') {
        ptt.disconnect();
      } else {
        live.stopListening();
        live.disconnect();
      }
      setStatus('idle');
      reset();
    }
    setMode(newMode);
  }, [status, mode, ptt, live, setStatus, reset]);

  // Inicia chamada
  const handleStartCall = useCallback(async () => {
    setStatus('connecting');
    resetDuration();
    
    // Cria nova conversa se não tiver uma ativa
    if (!currentConversation) {
      await createConversation(mode === 'push-to-talk' ? 'PUSH_TO_TALK' : 'LIVE_CALL');
    }
    
    // Reset do rastreamento de mensagens salvas
    lastSavedRef.current = { transcript: '', response: '' };
    
    activeHook.connect();
  }, [activeHook, setStatus, resetDuration, currentConversation, createConversation, mode]);

  // Encerra chamada
  const handleEndCall = useCallback(() => {
    if (mode === 'live-call') {
      live.stopListening();
    }
    activeHook.disconnect();
    setStatus('ended');
    setTimeout(() => reset(), 2000);
  }, [activeHook, mode, live, setStatus, reset]);

  // Push-to-talk handlers
  const handlePushToTalkStart = useCallback(() => {
    if (!isMuted && status === 'connected' && mode === 'push-to-talk') {
      ptt.startRecording();
    }
  }, [isMuted, status, mode, ptt]);

  const handlePushToTalkEnd = useCallback(() => {
    if (mode === 'push-to-talk') {
      ptt.stopRecording();
    }
  }, [mode, ptt]);

  // Live call handlers
  const handleToggleListening = useCallback(() => {
    if (mode === 'live-call' && !isMuted) {
      live.toggleListening();
    }
  }, [mode, isMuted, live]);

  // Handler para selecionar conversa do histórico
  const handleSelectConversation = useCallback(async (id: string) => {
    // Para qualquer chamada em andamento
    if (status === 'connected') {
      handleEndCall();
    }
    
    // Carrega a conversa
    const conv = await loadConversation(id);
    if (conv) {
      setMode(conv.mode === 'LIVE_CALL' ? 'live-call' : 'push-to-talk');
    }
    setSidebarOpen(false);
  }, [status, handleEndCall, loadConversation]);

  // Handler para nova conversa
  const handleNewConversation = useCallback(() => {
    if (status === 'connected') {
      handleEndCall();
    }
    newConversation();
    activeHook.resetConversation();
    lastSavedRef.current = { transcript: '', response: '' };
    setSidebarOpen(false);
  }, [status, handleEndCall, newConversation, activeHook]);

  // Handler para trocar de agente
  const handleAgentChange = useCallback((agentId: string | null, agentData?: { name: string; avatar: string | null }) => {
    // Se estiver conectado, desconecta antes de trocar
    if (status === 'connected') {
      handleEndCall();
    }
    setSelectedAgentId(agentId);
    setSelectedAgent(agentId && agentData ? { id: agentId, ...agentData } : null);
    // Força nova conversa com o novo agente
    newConversation();
    lastSavedRef.current = { transcript: '', response: '' };
  }, [status, handleEndCall, newConversation]);

  // Auto-start listening quando conecta em modo live
  useEffect(() => {
    if (mode === 'live-call' && live.isConnected && status === 'connected' && !live.isListening && !isMuted) {
      const timer = setTimeout(() => {
        live.startListening();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [mode, live.isConnected, status, live.isListening, isMuted, live]);

  // Para listening quando muta em modo live
  useEffect(() => {
    if (mode === 'live-call' && isMuted && live.isListening) {
      live.stopListening();
    }
  }, [mode, isMuted, live.isListening, live]);

  // Formata duração
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Status atual
  const getCurrentStatus = () => {
    if (mode === 'push-to-talk') {
      if (ptt.isRecording) return { text: '🎤 Ouvindo...', color: 'bg-red-500/20 text-red-400 animate-pulse' };
      if (ptt.isProcessing) return { text: '🧠 Processando...', color: 'bg-yellow-500/20 text-yellow-400' };
      if (ptt.isSpeaking) return { text: '🔊 Falando...', color: 'bg-green-500/20 text-green-400' };
      return { text: '⏸️ Aguardando', color: 'bg-slate-700/50 text-slate-400' };
    } else {
      if (live.isUserSpeaking) return { text: '🎤 Ouvindo você...', color: 'bg-red-500/20 text-red-400 animate-pulse' };
      if (live.isProcessing) return { text: '🧠 Processando...', color: 'bg-yellow-500/20 text-yellow-400' };
      if (live.isSpeaking) return { text: '🔊 Respondendo...', color: 'bg-green-500/20 text-green-400 animate-pulse' };
      if (live.isListening) return { text: '👂 Escutando...', color: 'bg-blue-500/20 text-blue-400' };
      return { text: '⏸️ Aguardando', color: 'bg-slate-700/50 text-slate-400' };
    }
  };

  const currentStatus = getCurrentStatus();
  const isRecording = mode === 'push-to-talk' ? ptt.isRecording : live.isUserSpeaking;
  const isProcessing = activeHook.isProcessing;
  const isSpeaking = activeHook.isSpeaking;
  const transcript = activeHook.transcript;
  const response = activeHook.response;
  const latency = activeHook.latency as UnifiedLatency | null;
  const error = activeHook.error;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex">
      {/* Sidebar */}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onSelectConversation={handleSelectConversation}
        onNewConversation={handleNewConversation}
        currentConversationId={currentConversation?.id}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="px-3 sm:px-6 py-3 sm:py-4 border-b border-slate-700/50">
          {/* Top Row - Logo and User Menu */}
          <div className="flex items-center justify-between gap-2 mb-3 sm:mb-0">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              {/* Menu Button */}
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors flex-shrink-0"
              >
                <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              
              <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                mode === 'push-to-talk' 
                  ? 'bg-gradient-to-br from-blue-500 to-purple-600'
                  : 'bg-gradient-to-br from-green-500 to-emerald-600'
              }`}>
                <svg className="w-4 h-4 sm:w-6 sm:h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              </div>
              <div className="min-w-0">
                <h1 className="text-base sm:text-xl font-semibold text-white truncate">TalkingHead AI</h1>
                <p className={`text-xs sm:text-sm truncate ${mode === 'push-to-talk' ? 'text-purple-400' : 'text-emerald-400'}`}>
                  {mode === 'push-to-talk' ? 'Push-to-Talk' : 'Ligação Direta'}
                </p>
              </div>
            </div>
            
            {/* User Menu - Always visible */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <StatusBar 
                status={status} 
                duration={formatDuration(duration)}
                latency={latency}
              />
              <UserMenu />
            </div>
          </div>
          
          {/* Bottom Row - Controls (only when idle) */}
          {status === 'idle' && (
            <div className="flex flex-wrap items-center gap-2 sm:gap-4">
              {/* Agent Selector */}
              <AgentSelector 
                selectedAgentId={selectedAgentId}
                onSelect={handleAgentChange}
              />
              
              {/* Mode Selector */}
              <div className="flex bg-slate-800 rounded-lg p-1">
                <button
                  onClick={() => handleModeChange('push-to-talk')}
                  className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all ${
                    mode === 'push-to-talk'
                      ? 'bg-blue-500 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  🎤 <span className="hidden xs:inline">Push-to-Talk</span><span className="xs:hidden">PTT</span>
                </button>
                <button
                  onClick={() => handleModeChange('live-call')}
                  className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all ${
                    mode === 'live-call'
                      ? 'bg-emerald-500 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  📞 <span className="hidden xs:inline">Ligação Direta</span><span className="xs:hidden">Live</span>
                </button>
              </div>
            </div>
          )}
        </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col lg:flex-row gap-4 sm:gap-6 p-3 sm:p-6 overflow-hidden">
        {/* Call Area */}
        <div className="flex-1 flex flex-col items-center justify-center min-h-[300px] sm:min-h-[400px]">
          {/* Avatar */}
          <div className="relative mb-4 sm:mb-8">
            <Avatar 
              isSpeaking={isSpeaking} 
              isProcessing={isProcessing}
              status={status}
              avatarUrl={selectedAgent?.avatar}
            />
            
            {/* Status indicator */}
            {status === 'connected' && (
              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2">
                <span className={`px-2 sm:px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${currentStatus.color}`}>
                  {currentStatus.text}
                </span>
              </div>
            )}
          </div>

          {/* Agent Info */}
          <div className="text-center mb-4 sm:mb-8 px-2">
            <h2 className="text-lg sm:text-2xl font-bold text-white mb-1 truncate">
              {selectedAgent?.name || 'Assistente Virtual'}
            </h2>
            <p className="text-sm sm:text-base text-slate-400">
              {status === 'idle' && 'Pronto para conectar'}
              {status === 'connecting' && 'Conectando...'}
              {status === 'connected' && (
                mode === 'push-to-talk' 
                  ? 'Segure o botão para falar'
                  : (live.isListening ? 'Fale a qualquer momento' : 'Em espera')
              )}
              {status === 'ended' && 'Chamada encerrada'}
            </p>
          </div>

          {/* Response Preview (streaming mode) */}
          {mode === 'live-call' && live.responsePreview && (
            <div className="mb-4 px-3 sm:px-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg max-w-[90%] sm:max-w-md mx-auto">
              <p className="text-slate-300 text-xs sm:text-sm">
                {live.responsePreview}
                <span className="animate-pulse">▌</span>
              </p>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="mb-4 px-3 sm:px-4 py-2 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 text-xs sm:text-sm max-w-[90%] mx-auto">
              {error}
            </div>
          )}

          {/* Call Controls */}
          <div className="flex flex-col items-center gap-3 sm:gap-4">
            {status === 'idle' || status === 'ended' ? (
              // Botão iniciar chamada
              <button
                onClick={handleStartCall}
                className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center shadow-lg transition-all duration-200 hover:scale-105 active:scale-95 ${
                  mode === 'push-to-talk'
                    ? 'bg-gradient-to-br from-blue-500 to-purple-600 hover:from-blue-400 hover:to-purple-500 shadow-blue-500/25'
                    : 'bg-gradient-to-br from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 shadow-green-500/25'
                }`}
              >
                <svg className="w-6 h-6 sm:w-8 sm:h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              </button>
            ) : status === 'connecting' ? (
              // Conectando
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-slate-700 flex items-center justify-center animate-pulse">
                <svg className="w-6 h-6 sm:w-8 sm:h-8 text-slate-400 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
            ) : (
              // Em chamada - controles
              <div className="flex items-center gap-2 sm:gap-4">
                {/* Mute */}
                <button
                  onClick={toggleMute}
                  className={`w-11 h-11 sm:w-14 sm:h-14 rounded-full flex items-center justify-center transition-all duration-200
                    ${isMuted 
                      ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' 
                      : 'bg-slate-700/50 text-slate-300 hover:bg-slate-600/50'}`}
                  title={isMuted ? 'Desmutar' : 'Mutar'}
                >
                  {isMuted ? (
                    <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                  )}
                </button>

                {/* Push-to-Talk Button (only in PTT mode) */}
                {mode === 'push-to-talk' && (
                  <button
                    onMouseDown={handlePushToTalkStart}
                    onMouseUp={handlePushToTalkEnd}
                    onMouseLeave={handlePushToTalkEnd}
                    onTouchStart={handlePushToTalkStart}
                    onTouchEnd={handlePushToTalkEnd}
                    disabled={isMuted}
                    className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center transition-all duration-200
                      ${isRecording 
                        ? 'bg-red-500 text-white scale-110 shadow-lg shadow-red-500/50' 
                        : isMuted
                          ? 'bg-slate-700/30 text-slate-500 cursor-not-allowed'
                          : 'bg-blue-500 text-white hover:bg-blue-600 hover:scale-105 active:scale-95 shadow-lg shadow-blue-500/30'}`}
                    title="Segure para falar"
                  >
                    <svg className="w-6 h-6 sm:w-8 sm:h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                  </button>
                )}

                {/* Encerrar */}
                <button
                  onClick={handleEndCall}
                  className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-red-500 to-red-600 
                           hover:from-red-400 hover:to-red-500 
                           flex items-center justify-center shadow-lg shadow-red-500/25
                           transition-all duration-200 hover:scale-105 active:scale-95"
                >
                  <svg className="w-6 h-6 sm:w-8 sm:h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
                  </svg>
                </button>

                {/* Interromper (quando agente está falando em modo live) */}
                {mode === 'live-call' && isSpeaking && (
                  <button
                    onClick={live.interrupt}
                    className="w-11 h-11 sm:w-14 sm:h-14 rounded-full bg-yellow-500/20 text-yellow-400 
                             hover:bg-yellow-500/30 flex items-center justify-center transition-all duration-200"
                    title="Interromper resposta"
                  >
                    <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </button>
                )}

                {/* Reset */}
                <button
                  onClick={handleNewConversation}
                  className="w-11 h-11 sm:w-14 sm:h-14 rounded-full bg-slate-700/50 text-slate-300 
                           hover:bg-slate-600/50 flex items-center justify-center transition-all duration-200"
                  title="Nova conversa"
                >
                  <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              </div>
            )}

            {/* Instruções */}
            {status === 'connected' && (
              <p className="text-xs sm:text-sm text-slate-500 text-center mt-2 sm:mt-4 max-w-xs px-2">
                {mode === 'push-to-talk' 
                  ? (isRecording ? '🔴 Solte para enviar' : '💡 Segure o botão azul para falar')
                  : '💡 Fale naturalmente - detecção automática de voz'
                }
              </p>
            )}
          </div>
        </div>

        {/* Transcript Panel */}
        <TranscriptPanel 
          transcript={transcript}
          response={response}
          status={status}
          messages={currentConversation?.messages || []}
          onSendMessage={activeHook.sendTextMessage}
        />
      </main>

      {/* Latency Info (bottom) */}
      {latency && status === 'connected' && (
        <footer className="px-3 sm:px-6 py-2 sm:py-3 border-t border-slate-700/50 flex justify-center">
          <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-6 text-[10px] sm:text-xs text-slate-500">
            {mode === 'live-call' && latency.first_audio_ms !== undefined && (
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-green-500"></span>
                1º: {latency.first_audio_ms}ms
              </span>
            )}
            <span>STT: {latency.stt_ms}ms</span>
            <span>LLM: {latency.llm_ms}ms</span>
            {mode === 'live-call' && latency.total_ms && <span className="hidden sm:inline">Total: {latency.total_ms}ms</span>}
            {mode === 'push-to-talk' && latency.tts_ms && <span>TTS: {latency.tts_ms}ms</span>}
            <span className={`hidden sm:inline ${mode === 'push-to-talk' ? 'text-purple-400' : 'text-emerald-400'}`}>
              {mode === 'push-to-talk' ? 'Push-to-Talk' : 'Streaming ✓'}
            </span>
          </div>
        </footer>
      )}
      </div>
    </div>
  );
}
