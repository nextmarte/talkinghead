'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

interface LatencyBreakdown {
  stt_ms: number;
  llm_ms: number;
  first_audio_ms?: number;
  total_ms?: number;
  sentences?: number;
  streaming?: boolean;
}

interface WebSocketMessage {
  type: 
    | 'listening' 
    | 'processing'
    | 'transcript' 
    | 'response' 
    | 'response_chunk'
    | 'audio' 
    | 'audio_chunk' 
    | 'audio_complete' 
    | 'text_complete'
    | 'reset_ack' 
    | 'interrupted'
    | 'error';
  text?: string;
  full_text?: string;
  data?: string;
  sample_rate?: number;
  latency_ms?: number;
  breakdown?: LatencyBreakdown;
  error?: string;
  chunk_index?: number;
  is_last?: boolean;
  sentence?: string;
}

// Configurações de streaming
const CHUNK_INTERVAL_MS = 100; // Envia chunk a cada 100ms
const SAMPLE_RATE = 16000;

interface UseStreamingOptions {
  agentId?: string | null;
}

export function useStreamingConversation(options: UseStreamingOptions = {}) {
  const { agentId } = options;
  
  const [isConnected, setIsConnected] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [responsePreview, setResponsePreview] = useState('');
  const [latency, setLatency] = useState<LatencyBreakdown | null>(null);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);

  // Conecta ao WebSocket (modo streaming)
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    // Usa variável de ambiente ou constrói URL dinamicamente
    let wsUrl: string;
    const envWsUrl = process.env.NEXT_PUBLIC_WS_URL;
    
    if (envWsUrl) {
      // Usa URL da variável de ambiente
      wsUrl = `${envWsUrl}/ws/stream`;
    } else {
      // Fallback: constrói URL baseada no host atual
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      wsUrl = `${protocol}//${host}/ws/stream`;
    }
    
    // Adiciona agent_id como query param se fornecido
    if (agentId) {
      wsUrl += `?agent_id=${encodeURIComponent(agentId)}`;
    }
    
    console.log(`🔌 Conectando ao WebSocket: ${wsUrl}`);
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      setIsConnected(true);
      setError(null);
      console.log('✅ Conectado ao servidor (streaming mode)');
      
      // Keep-alive ping a cada 30s para evitar desconexão por inatividade
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 30000);
      
      ws.addEventListener('close', () => clearInterval(pingInterval));
    };

    ws.onclose = () => {
      setIsConnected(false);
      stopListening();
      console.log('❌ Desconectado do servidor');
    };

    ws.onerror = (e) => {
      setError('Erro de conexão com o servidor');
      console.error('WebSocket error:', e);
    };

    ws.onmessage = async (event) => {
      const message: WebSocketMessage = JSON.parse(event.data);

      switch (message.type) {
        case 'listening':
          setIsUserSpeaking(true);
          setTranscript('');
          setResponsePreview('');
          break;

        case 'processing':
          setIsUserSpeaking(false);
          setIsProcessing(true);
          break;

        case 'transcript':
          setTranscript(message.text || '');
          break;

        case 'response_chunk':
          // Preview incremental do LLM
          setResponsePreview(message.full_text || '');
          break;

        case 'response':
          setResponse(message.text || '');
          setResponsePreview('');
          break;

        case 'audio_chunk':
          // Recebe e toca áudio completo imediatamente
          if (message.data) {
            console.log(`🎵 audio_chunk recebido (sr=${message.sample_rate})`);
            
            // Decodifica o áudio em float32
            const binaryString = atob(message.data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            const int16Array = new Int16Array(bytes.buffer);
            const float32Array = new Float32Array(int16Array.length);
            for (let i = 0; i < int16Array.length; i++) {
              float32Array[i] = int16Array[i] / 32768.0;
            }
            
            // Toca áudio completo contínuo
            playAudioContinuous(float32Array, message.sample_rate!);
            setIsSpeaking(true);
          }
          break;

        case 'audio_complete':
          // Marca fim da síntese (áudio já foi tocado)
          setIsProcessing(false);
          setIsSpeaking(false);
          if (message.breakdown) {
            setLatency(message.breakdown);
            const b = message.breakdown;
            console.log(`📊 Streaming - 1º áudio: ${b.first_audio_ms}ms, Total: ${b.total_ms}ms`);
          }
          break;

        case 'text_complete':
          // Resposta de texto puro (sem áudio)
          setIsProcessing(false);
          if (message.breakdown) {
            setLatency(message.breakdown);
            const b = message.breakdown;
            console.log(`📝 Texto - LLM: ${b.llm_ms}ms, Total: ${b.total_ms}ms`);
          }
          break;

        case 'interrupted':
          // Interrompe reprodução de áudio
          stopCurrentAudio();
          setIsSpeaking(false);
          console.log('⚠️ Resposta interrompida');
          break;

        case 'error':
          setIsProcessing(false);
          setError(message.error || 'Erro desconhecido');
          break;

        case 'reset_ack':
          setTranscript('');
          setResponse('');
          setResponsePreview('');
          break;
      }
    };

    wsRef.current = ws;
  }, [agentId]);

  // Desconecta
  // Para áudio atual
  const stopCurrentAudio = useCallback(() => {
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
      } catch {}
      currentSourceRef.current = null;
    }
  }, []);

  // Para escuta
  const stopListening = useCallback(() => {
    // Para o processador
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    // Para a fonte
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }

    // Para o stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    // Envia sinal de fim manual (força processamento do buffer)
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'audio_end' }));
    }

    setIsListening(false);
    setIsUserSpeaking(false);
    console.log('🔇 Escuta parada');
  }, []);

  const disconnect = useCallback(() => {
    stopListening();
    stopCurrentAudio();
    setIsSpeaking(false);
    wsRef.current?.close();
    wsRef.current = null;
    setIsConnected(false);
  }, [stopListening, stopCurrentAudio]);

  // Toca áudio
  // Toca áudio contínuo completo
  const playAudioContinuous = async (float32Array: Float32Array, sampleRate: number): Promise<void> => {
    try {
      console.log(`🔊 Tocando áudio (sr=${sampleRate}, size=${float32Array.length} samples)`);
      
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        console.log(`🔊 Criando novo AudioContext (sr=${sampleRate})`);
        audioContextRef.current = new AudioContext({ sampleRate });
      }
      const ctx = audioContextRef.current;

      if (ctx.state === 'suspended') {
        console.log(`🔊 AudioContext estava suspenso, resumindo...`);
        await ctx.resume();
      }

      console.log(`🔊 Criando buffer de ${float32Array.length} samples`);
      const audioBuffer = ctx.createBuffer(1, float32Array.length, sampleRate);
      audioBuffer.getChannelData(0).set(float32Array);

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      currentSourceRef.current = source;
      
      return new Promise<void>((resolve) => {
        source.onended = () => {
          console.log(`🔊 Áudio terminou`);
          setIsSpeaking(false);
          if (currentSourceRef.current === source) {
            currentSourceRef.current = null;
          }
          resolve();
        };
        console.log(`🔊 Iniciando reprodução...`);
        source.start();
      });
    } catch (err) {
      console.error('❌ Erro ao tocar áudio:', err);
      setIsSpeaking(false);
    }
  };

  // Inicia escuta contínua (modo streaming)
  const startListening = useCallback(async () => {
    if (!isConnected) {
      setError('Não conectado ao servidor');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: SAMPLE_RATE,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });

      streamRef.current = stream;

      // Cria contexto de áudio para processamento
      const audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      sourceRef.current = source;

      // Processor para capturar chunks de áudio
      // Nota: ScriptProcessorNode é deprecated mas ainda funciona
      // TODO: Migrar para AudioWorklet no futuro
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

        const inputData = e.inputBuffer.getChannelData(0);
        
        // Converte para Int16
        const int16Array = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          int16Array[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
        }

        // Converte para base64
        const uint8Array = new Uint8Array(int16Array.buffer);
        let base64 = '';
        const chunkSize = 8192;
        for (let i = 0; i < uint8Array.length; i += chunkSize) {
          const chunk = uint8Array.subarray(i, i + chunkSize);
          base64 += String.fromCharCode.apply(null, Array.from(chunk));
        }
        base64 = btoa(base64);

        // Envia chunk para o servidor
        wsRef.current.send(JSON.stringify({
          type: 'audio_chunk',
          data: base64,
          sample_rate: SAMPLE_RATE
        }));
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      setIsListening(true);
      setError(null);
      console.log('🎤 Escuta contínua iniciada');
      
    } catch (err) {
      setError('Erro ao acessar microfone');
      console.error('Erro ao iniciar escuta:', err);
    }
  }, [isConnected]);

  // Interrompe resposta do agente
  const interrupt = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'interrupt' }));
    }
    stopCurrentAudio();
    setIsSpeaking(false);
  }, [stopCurrentAudio]);

  // Reset da conversa
  const resetConversation = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: 'reset' }));
    setTranscript('');
    setResponse('');
    setResponsePreview('');
    setLatency(null);
    setError(null);
  }, []);

  // Troca de agente em tempo real
  const setAgent = useCallback((newAgentId: string | null) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ 
        type: 'set_agent', 
        agent_id: newAgentId 
      }));
      setTranscript('');
      setResponse('');
      setResponsePreview('');
      setLatency(null);
    }
  }, []);

  // Toggle escuta
  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  // Enviar mensagem de texto (em vez de voz)
  const sendTextMessage = useCallback((text: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.error('WebSocket não conectado');
      return;
    }

    // Atualiza transcript local imediatamente
    setTranscript(text);
    setResponse('');
    setResponsePreview('');
    setIsProcessing(true);

    // Envia mensagem de texto para o backend
    wsRef.current.send(JSON.stringify({
      type: 'text_message',
      text: text,
    }));

    console.log('📝 Mensagem de texto enviada:', text);
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      disconnect();
      audioContextRef.current?.close();
    };
  }, [disconnect]);

  return {
    // Estado
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
    
    // Ações
    connect,
    disconnect,
    startListening,
    stopListening,
    toggleListening,
    interrupt,
    resetConversation,
    setAgent,
    sendTextMessage,
  };
}
