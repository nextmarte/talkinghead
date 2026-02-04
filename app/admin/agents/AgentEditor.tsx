"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface Agent {
  id: string;
  name: string;
  description: string | null;
  systemPrompt: string;
  avatar: string | null;
  voiceSample: string | null;
  voiceGender: string | null;
  voicePitch: number | null;
  voiceSpeed: number | null;
  useElevenLabs: boolean | null;
  elevenLabsVoiceId: string | null;
  isActive: boolean;
  isDefault: boolean;
  isPublic: boolean | null;
}

interface AgentEditorProps {
  agent: Agent | null;
  onClose: (saved?: boolean) => void;
}

export default function AgentEditor({ agent, onClose }: AgentEditorProps) {
  const isEditing = !!agent;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [name, setName] = useState(agent?.name || "");
  const [description, setDescription] = useState(agent?.description || "");
  const [systemPrompt, setSystemPrompt] = useState(agent?.systemPrompt || "");
  const [isDefault, setIsDefault] = useState(agent?.isDefault || false);
  const [isPublic, setIsPublic] = useState(agent?.isPublic !== false); // default true
  const [avatar, setAvatar] = useState<string | null>(agent?.avatar || null);
  const [voiceSample, setVoiceSample] = useState<string | null>(agent?.voiceSample || null);
  const [voiceGender, setVoiceGender] = useState(agent?.voiceGender || "neutral");
  const [voicePitch, setVoicePitch] = useState(agent?.voicePitch || 1.0);
  const [voiceSpeed, setVoiceSpeed] = useState(agent?.voiceSpeed || 1.0);
  const [useElevenLabs, setUseElevenLabs] = useState(agent?.useElevenLabs || false);
  const [elevenLabsVoiceId, setElevenLabsVoiceId] = useState(agent?.elevenLabsVoiceId || "");
  
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const voiceInputRef = useRef<HTMLInputElement>(null);
  
  // Estados para gravação de áudio
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const MAX_RECORDING_TIME = 10; // segundos

  // Limpar timer ao desmontar
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  // Iniciar gravação
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };
      
      mediaRecorder.start(100);
      setIsRecording(true);
      setRecordingTime(0);
      setAudioBlob(null);
      
      // Timer para atualizar tempo e parar automaticamente em 10s
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => {
          if (prev >= MAX_RECORDING_TIME - 1) {
            stopRecording();
            return MAX_RECORDING_TIME;
          }
          return prev + 1;
        });
      }, 1000);
      
    } catch (err) {
      console.error('Erro ao acessar microfone:', err);
      setError('Não foi possível acessar o microfone. Verifique as permissões.');
    }
  }, []);

  // Parar gravação
  const stopRecording = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }, []);

  // Upload do áudio gravado
  const uploadRecordedAudio = async () => {
    if (!audioBlob || !agent) return;
    
    // Converter webm para wav/mp3 não é trivial no browser, 
    // então enviamos webm e o backend converte se necessário
    const formData = new FormData();
    formData.append("file", audioBlob, "voice_recording.webm");

    try {
      const res = await fetch(`/api/agents/${agent.id}/voice`, {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        setVoiceSample(data.voiceSample);
        setAudioBlob(null);
        setRecordingTime(0);
      } else {
        const data = await res.json();
        setError(data.error || 'Erro ao enviar áudio gravado');
      }
    } catch (err) {
      console.error("Erro ao fazer upload de áudio gravado:", err);
      setError('Erro ao enviar áudio gravado');
    }
  };

  // Descartar gravação
  const discardRecording = () => {
    setAudioBlob(null);
    setRecordingTime(0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const url = isEditing ? `/api/agents/${agent.id}` : "/api/agents";
      const method = isEditing ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description || null,
          systemPrompt,
          isDefault,
          isPublic,
          voiceGender,
          voicePitch,
          voiceSpeed,
          useElevenLabs,
          elevenLabsVoiceId: useElevenLabs ? elevenLabsVoiceId : null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erro ao salvar agente");
      }

      onClose(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !agent) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`/api/agents/${agent.id}/avatar`, {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        setAvatar(data.avatar);
      }
    } catch (err) {
      console.error("Erro ao fazer upload de avatar:", err);
    }
  };

  const handleVoiceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !agent) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`/api/agents/${agent.id}/voice`, {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        setVoiceSample(data.voiceSample);
      }
    } catch (err) {
      console.error("Erro ao fazer upload de voz:", err);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">
            {isEditing ? "Editar Agente" : "Novo Agente"}
          </h2>
          <button
            onClick={() => onClose()}
            className="p-2 text-slate-400 hover:text-white transition"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Avatar & Voice (apenas para edição) */}
          {isEditing && (
            <div className="grid grid-cols-2 gap-4">
              {/* Avatar */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Avatar
                </label>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-xl bg-slate-700 flex items-center justify-center overflow-hidden">
                    {avatar ? (
                      <img src={avatar} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <svg className="w-8 h-8 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    className="px-3 py-2 bg-slate-700 text-slate-300 rounded-lg text-sm hover:bg-slate-600 transition"
                  >
                    Escolher Foto
                  </button>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarUpload}
                    className="hidden"
                  />
                </div>
              </div>

              {/* Voice Sample */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Sample de Voz
                </label>
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded-xl bg-slate-700 flex items-center justify-center relative">
                    {isRecording ? (
                      <div className="relative">
                        <svg className="w-8 h-8 text-red-400 animate-pulse" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                          <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                        </svg>
                        <span className="absolute -bottom-1 -right-1 text-xs font-bold text-red-400 bg-slate-800 px-1 rounded">
                          {MAX_RECORDING_TIME - recordingTime}s
                        </span>
                      </div>
                    ) : voiceSample || audioBlob ? (
                      <svg className="w-8 h-8 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      </svg>
                    ) : (
                      <svg className="w-8 h-8 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      </svg>
                    )}
                  </div>
                  
                  <div className="flex flex-col gap-2">
                    {/* Botões de gravação */}
                    {!audioBlob && !isRecording && (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={startRecording}
                          className="px-3 py-2 bg-red-500/20 text-red-400 rounded-lg text-sm hover:bg-red-500/30 transition flex items-center gap-1"
                        >
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                            <circle cx="12" cy="12" r="6"/>
                          </svg>
                          Gravar
                        </button>
                        <button
                          type="button"
                          onClick={() => voiceInputRef.current?.click()}
                          className="px-3 py-2 bg-slate-700 text-slate-300 rounded-lg text-sm hover:bg-slate-600 transition"
                        >
                          {voiceSample ? "Trocar Áudio" : "Enviar Áudio"}
                        </button>
                      </div>
                    )}
                    
                    {/* Botão parar gravação */}
                    {isRecording && (
                      <button
                        type="button"
                        onClick={stopRecording}
                        className="px-3 py-2 bg-red-500 text-white rounded-lg text-sm hover:bg-red-600 transition flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <rect x="6" y="6" width="12" height="12"/>
                        </svg>
                        Parar ({recordingTime}s / {MAX_RECORDING_TIME}s)
                      </button>
                    )}
                    
                    {/* Prévia e ações do áudio gravado */}
                    {audioBlob && !isRecording && (
                      <div className="flex flex-col gap-2">
                        <audio 
                          controls 
                          src={URL.createObjectURL(audioBlob)} 
                          className="h-8 w-full"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={uploadRecordedAudio}
                            className="px-3 py-1.5 bg-green-500 text-white rounded-lg text-xs hover:bg-green-600 transition flex items-center gap-1"
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
                            </svg>
                            Usar
                          </button>
                          <button
                            type="button"
                            onClick={discardRecording}
                            className="px-3 py-1.5 bg-slate-600 text-slate-300 rounded-lg text-xs hover:bg-slate-500 transition"
                          >
                            Descartar
                          </button>
                          <button
                            type="button"
                            onClick={startRecording}
                            className="px-3 py-1.5 bg-red-500/20 text-red-400 rounded-lg text-xs hover:bg-red-500/30 transition"
                          >
                            Regravar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <input
                    ref={voiceInputRef}
                    type="file"
                    accept="audio/*"
                    onChange={handleVoiceUpload}
                    className="hidden"
                  />
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Grave até 10 segundos ou envie um arquivo. Recomendado: fala clara sem ruído.
                </p>
              </div>
            </div>
          )}

          {/* Configurações de Voz */}
          <div className="p-4 bg-slate-700/50 rounded-xl space-y-4">
              <h3 className="text-sm font-medium text-slate-300 flex items-center gap-2">
                <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Configurações de Voz
              </h3>
              
              {/* Gênero da Voz */}
              <div>
                <label className="block text-xs text-slate-400 mb-2">Gênero da Voz</label>
                <div className="flex gap-2">
                  {[
                    { value: "male", label: "Masculino", icon: "♂" },
                    { value: "female", label: "Feminino", icon: "♀" },
                    { value: "neutral", label: "Neutro", icon: "⚪" },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setVoiceGender(option.value)}
                      className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition ${
                        voiceGender === option.value
                          ? "bg-purple-500 text-white"
                          : "bg-slate-600 text-slate-300 hover:bg-slate-500"
                      }`}
                    >
                      {option.icon} {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Pitch/Tom */}
              <div>
                <label className="block text-xs text-slate-400 mb-2">
                  Tom da Voz: {voicePitch < 1 ? "Grave" : voicePitch > 1 ? "Agudo" : "Normal"} ({voicePitch.toFixed(1)}x)
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="1.5"
                  step="0.1"
                  value={voicePitch}
                  onChange={(e) => setVoicePitch(parseFloat(e.target.value))}
                  className="w-full h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-purple-500"
                />
                <div className="flex justify-between text-xs text-slate-500 mt-1">
                  <span>Grave</span>
                  <span>Normal</span>
                  <span>Agudo</span>
                </div>
              </div>

              {/* Velocidade */}
              <div>
                <label className="block text-xs text-slate-400 mb-2">
                  Velocidade: {voiceSpeed < 1 ? "Lento" : voiceSpeed > 1 ? "Rápido" : "Normal"} ({voiceSpeed.toFixed(1)}x)
                </label>
                <input
                  type="range"
                  min="0.7"
                  max="1.3"
                  step="0.1"
                  value={voiceSpeed}
                  onChange={(e) => setVoiceSpeed(parseFloat(e.target.value))}
                  className="w-full h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-purple-500"
                />
                <div className="flex justify-between text-xs text-slate-500 mt-1">
                  <span>Lento</span>
                  <span>Normal</span>
                  <span>Rápido</span>
                </div>
              </div>

              {/* ElevenLabs TTS */}
              <div className="pt-4 border-t border-slate-600">
                <div className="flex items-start gap-3 mb-3">
                  <input
                    type="checkbox"
                    id="useElevenLabs"
                    checked={useElevenLabs}
                    onChange={(e) => setUseElevenLabs(e.target.checked)}
                    className="mt-1 w-4 h-4 rounded border-slate-600 bg-slate-700 text-purple-500 focus:ring-purple-500 focus:ring-offset-slate-800"
                  />
                  <div className="flex-1">
                    <label htmlFor="useElevenLabs" className="block text-xs font-medium text-slate-300 cursor-pointer">
                      Usar ElevenLabs TTS (Premium)
                    </label>
                    <p className="text-xs text-slate-500 mt-1">
                      Vozes de alta qualidade via API do ElevenLabs. Requer Voice ID configurado.
                    </p>
                  </div>
                </div>

                {useElevenLabs && (
                  <div>
                    <label className="block text-xs text-slate-400 mb-2">
                      Voice ID do ElevenLabs
                    </label>
                    <input
                      type="text"
                      value={elevenLabsVoiceId}
                      onChange={(e) => setElevenLabsVoiceId(e.target.value)}
                      placeholder="Ex: 21m00Tcm4TlvDq8ikWAM"
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      Obtenha seu Voice ID em{" "}
                      <a
                        href="https://elevenlabs.io/app/voice-library"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-purple-400 hover:text-purple-300 underline"
                      >
                        elevenlabs.io/app/voice-library
                      </a>
                    </p>
                  </div>
                )}
              </div>
            </div>

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Nome do Agente *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Ex: Dr. Silva, Assistente de Vendas..."
              className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Descrição (visível aos usuários)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Uma breve descrição do agente para os usuários..."
              className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
            />
          </div>

          {/* System Prompt */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              System Prompt (personalidade) *
            </label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              required
              rows={6}
              placeholder="Descreva a personalidade, conhecimentos, estilo de fala e comportamento do agente..."
              className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none font-mono text-sm"
            />
            <p className="text-xs text-slate-500 mt-1">
              Este texto define como o agente se comporta e responde. Seja específico sobre personalidade, tom de voz e áreas de conhecimento.
            </p>
          </div>

          {/* Configurações de Acesso */}
          <div className="p-4 bg-slate-700/50 rounded-xl space-y-3">
            <h3 className="text-sm font-medium text-slate-300 flex items-center gap-2">
              <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Controle de Acesso
            </h3>

            {/* Is Public */}
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="isPublic"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                className="mt-1 w-4 h-4 rounded bg-slate-700 border-slate-600 text-purple-500 focus:ring-purple-500"
              />
              <div>
                <label htmlFor="isPublic" className="text-sm text-slate-300 cursor-pointer">
                  Agente Público
                </label>
                <p className="text-xs text-slate-500 mt-0.5">
                  {isPublic 
                    ? "Todos os usuários podem usar este agente" 
                    : "Apenas usuários com acesso específico podem usar este agente"}
                </p>
              </div>
            </div>

            {/* Is Default */}
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="isDefault"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="mt-1 w-4 h-4 rounded bg-slate-700 border-slate-600 text-purple-500 focus:ring-purple-500"
              />
              <div>
                <label htmlFor="isDefault" className="text-sm text-slate-300 cursor-pointer">
                  Agente Padrão
                </label>
                <p className="text-xs text-slate-500 mt-0.5">
                  Será usado como assistente principal quando nenhum outro for selecionado
                </p>
              </div>
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-700 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => onClose()}
            className="px-4 py-2 text-slate-300 hover:text-white transition"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !name || !systemPrompt}
            className="px-6 py-2 bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-lg font-medium hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Salvando..." : isEditing ? "Salvar" : "Criar Agente"}
          </button>
        </div>
      </div>
    </div>
  );
}
