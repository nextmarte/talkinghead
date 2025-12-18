'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

interface LatencyBreakdown {
  stt_ms: number;
  llm_ms: number;
  tts_ms: number;
}

interface WebSocketMessage {
  type: 'transcript' | 'response' | 'audio' | 'audio_chunk' | 'audio_complete' | 'reset_ack' | 'error';
  text?: string;
  data?: string;
  sample_rate?: number;
  latency_ms?: number;
  breakdown?: LatencyBreakdown & { tts_first_chunk_ms?: number; chunks?: number };
  error?: string;
  chunk_index?: number;
  is_last?: boolean;
  sentence?: string;
}

// Duração mínima de gravação em ms
const MIN_RECORDING_DURATION = 500;

interface UseConversationOptions {
  agentId?: string | null;
}

export function useConversation(options: UseConversationOptions = {}) {
  const { agentId } = options;
  
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [latency, setLatency] = useState<LatencyBreakdown | null>(null);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingStartTimeRef = useRef<number>(0);
  
  // Fila de áudio para streaming
  const audioQueueRef = useRef<{data: string, sampleRate: number, sentence?: string}[]>([]);
  const isPlayingQueueRef = useRef(false);

  // Conecta ao WebSocket (modo push-to-talk)
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    // Usa variável de ambiente ou constrói URL dinamicamente
    let wsUrl: string;
    const envWsUrl = process.env.NEXT_PUBLIC_WS_URL;
    
    if (envWsUrl) {
      // Usa URL da variável de ambiente
      wsUrl = `${envWsUrl}/ws/conversation`;
    } else {
      // Fallback: constrói URL baseada no host atual
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      wsUrl = `${protocol}//${host}/ws/conversation`;
    }
    
    // Adiciona agent_id como query param se fornecido
    if (agentId) {
      wsUrl += `?agent_id=${encodeURIComponent(agentId)}`;
    }
    
    console.log(`🔌 Conectando ao WebSocket (PTT): ${wsUrl}`);
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      setIsConnected(true);
      setError(null);
      console.log('✅ Conectado ao servidor');
    };

    ws.onclose = () => {
      setIsConnected(false);
      console.log('❌ Desconectado do servidor');
    };

    ws.onerror = (e) => {
      setError('Erro de conexão com o servidor');
      console.error('WebSocket error:', e);
    };

    ws.onmessage = async (event) => {
      const message: WebSocketMessage = JSON.parse(event.data);

      switch (message.type) {
        case 'transcript':
          setTranscript(message.text || '');
          break;

        case 'response':
          setResponse(message.text || '');
          break;

        case 'audio':
          // Fallback para áudio completo (compatibilidade)
          setIsProcessing(false);
          setIsSpeaking(true);
          await playAudio(message.data!, message.sample_rate!);
          setIsSpeaking(false);
          if (message.breakdown) {
            setLatency(message.breakdown);
          }
          break;

        case 'audio_chunk':
          // Streaming: adiciona chunk à fila e inicia reprodução
          if (message.data) {
            audioQueueRef.current.push({
              data: message.data,
              sampleRate: message.sample_rate!,
              sentence: message.sentence
            });
            // Inicia reprodução do primeiro chunk imediatamente
            processAudioQueue();
          }
          break;

        case 'audio_complete':
          // Streaming concluído - atualiza latência
          setIsProcessing(false);
          if (message.breakdown) {
            setLatency(message.breakdown);
            console.log(`📊 Latência - STT: ${message.breakdown.stt_ms}ms, LLM: ${message.breakdown.llm_ms}ms, TTS: ${message.breakdown.tts_ms}ms (1º chunk: ${message.breakdown.tts_first_chunk_ms}ms)`);
          }
          break;

        case 'text_complete':
          // Resposta de texto puro (sem áudio)
          setIsProcessing(false);
          if (message.breakdown) {
            setLatency(message.breakdown);
            console.log(`📝 Texto - LLM: ${message.breakdown.llm_ms}ms`);
          }
          break;

        case 'error':
          setIsProcessing(false);
          setError(message.error || 'Erro desconhecido');
          break;

        case 'reset_ack':
          setTranscript('');
          setResponse('');
          break;
      }
    };

    wsRef.current = ws;
  }, [agentId]);

  // Desconecta
  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    setIsConnected(false);
  }, []);

  // Toca áudio recebido
  const playAudio = async (base64Data: string, sampleRate: number): Promise<void> => {
    try {
      // Decodifica base64 para bytes
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Converte Int16 para Float32
      const int16Array = new Int16Array(bytes.buffer);
      const float32Array = new Float32Array(int16Array.length);
      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32768.0;
      }

      // Cria AudioContext e toca
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new AudioContext();
      }
      const ctx = audioContextRef.current;

      // Resume se suspenso (política de autoplay)
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      const audioBuffer = ctx.createBuffer(1, float32Array.length, sampleRate);
      audioBuffer.getChannelData(0).set(float32Array);

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      
      return new Promise<void>((resolve) => {
        source.onended = () => resolve();
        source.start();
      });
    } catch (err) {
      console.error('Erro ao tocar áudio:', err);
    }
  };

  // Processa fila de áudio para streaming
  const processAudioQueue = useCallback(async () => {
    if (isPlayingQueueRef.current || audioQueueRef.current.length === 0) {
      return;
    }
    
    isPlayingQueueRef.current = true;
    setIsSpeaking(true);
    
    while (audioQueueRef.current.length > 0) {
      const chunk = audioQueueRef.current.shift()!;
      await playAudio(chunk.data, chunk.sampleRate);
    }
    
    isPlayingQueueRef.current = false;
    setIsSpeaking(false);
  }, []);

  // Inicia gravação
  const startRecording = useCallback(async () => {
    if (!isConnected) {
      setError('Não conectado ao servidor');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        }
      });

      streamRef.current = stream;
      audioChunksRef.current = [];
      recordingStartTimeRef.current = Date.now();
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const recordingDuration = Date.now() - recordingStartTimeRef.current;
        
        // Verifica duração mínima
        if (recordingDuration < MIN_RECORDING_DURATION) {
          console.log(`Gravação muito curta (${recordingDuration}ms), ignorando...`);
          setError('Fale por mais tempo');
          setTimeout(() => setError(null), 2000);
          // Limpa stream
          streamRef.current?.getTracks().forEach(track => track.stop());
          return;
        }

        try {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          
          // Verifica se há dados
          if (audioBlob.size < 1000) {
            console.log('Áudio muito pequeno, ignorando...');
            setError('Áudio não detectado');
            setTimeout(() => setError(null), 2000);
            streamRef.current?.getTracks().forEach(track => track.stop());
            return;
          }
          
          // Converte para PCM 16-bit
          const arrayBuffer = await audioBlob.arrayBuffer();
          const audioContext = new AudioContext({ sampleRate: 16000 });
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
          
          // Verifica duração do áudio decodificado
          if (audioBuffer.duration < 0.2) {
            console.log(`Áudio decodificado muito curto (${audioBuffer.duration}s), ignorando...`);
            setError('Fale por mais tempo');
            setTimeout(() => setError(null), 2000);
            await audioContext.close();
            streamRef.current?.getTracks().forEach(track => track.stop());
            return;
          }
          
          // Extrai dados do canal mono
          const channelData = audioBuffer.getChannelData(0);
          const int16Array = new Int16Array(channelData.length);
          for (let i = 0; i < channelData.length; i++) {
            int16Array[i] = Math.max(-32768, Math.min(32767, channelData[i] * 32768));
          }

          // Envia via WebSocket
          const uint8Array = new Uint8Array(int16Array.buffer);
          let base64 = '';
          const chunkSize = 8192;
          for (let i = 0; i < uint8Array.length; i += chunkSize) {
            const chunk = uint8Array.subarray(i, i + chunkSize);
            base64 += String.fromCharCode.apply(null, Array.from(chunk));
          }
          base64 = btoa(base64);
          
          wsRef.current?.send(JSON.stringify({
            type: 'audio',
            data: base64,
            sample_rate: 16000
          }));

          setIsProcessing(true);
          
          await audioContext.close();
        } catch (err) {
          console.error('Erro ao processar áudio:', err);
          setError('Erro ao processar áudio');
        }
        
        // Limpa stream
        streamRef.current?.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(100); // Coleta dados a cada 100ms
      setIsRecording(true);
      setError(null);
      setTranscript('');
      setResponse('');
      
    } catch (err) {
      setError('Erro ao acessar microfone');
      console.error('Erro ao iniciar gravação:', err);
    }
  }, [isConnected]);

  // Para gravação
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  // Reset da conversa
  const resetConversation = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: 'reset' }));
    setTranscript('');
    setResponse('');
    setLatency(null);
    setError(null);
  }, []);

  // Troca de agente
  const setAgent = useCallback((newAgentId: string | null) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ 
        type: 'set_agent', 
        agent_id: newAgentId 
      }));
      setTranscript('');
      setResponse('');
      setLatency(null);
    }
  }, []);

  // Enviar mensagem de texto (em vez de voz)
  const sendTextMessage = useCallback((text: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.error('WebSocket não conectado');
      return;
    }

    // Atualiza transcript local imediatamente
    setTranscript(text);
    setResponse('');
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
      streamRef.current?.getTracks().forEach(track => track.stop());
    };
  }, [disconnect]);

  return {
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
    setAgent,
    sendTextMessage,
  };
}
