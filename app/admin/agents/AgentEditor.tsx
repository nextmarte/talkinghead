"use client";

import { useState, useRef } from "react";

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
  isActive: boolean;
  isDefault: boolean;
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
  const [avatar, setAvatar] = useState<string | null>(agent?.avatar || null);
  const [voiceSample, setVoiceSample] = useState<string | null>(agent?.voiceSample || null);
  const [voiceGender, setVoiceGender] = useState(agent?.voiceGender || "neutral");
  const [voicePitch, setVoicePitch] = useState(agent?.voicePitch || 1.0);
  const [voiceSpeed, setVoiceSpeed] = useState(agent?.voiceSpeed || 1.0);
  
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const voiceInputRef = useRef<HTMLInputElement>(null);

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
          voiceGender,
          voicePitch,
          voiceSpeed,
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
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-xl bg-slate-700 flex items-center justify-center">
                    {voiceSample ? (
                      <svg className="w-8 h-8 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      </svg>
                    ) : (
                      <svg className="w-8 h-8 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      </svg>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => voiceInputRef.current?.click()}
                    className="px-3 py-2 bg-slate-700 text-slate-300 rounded-lg text-sm hover:bg-slate-600 transition"
                  >
                    {voiceSample ? "Trocar Áudio" : "Enviar Áudio"}
                  </button>
                  <input
                    ref={voiceInputRef}
                    type="file"
                    accept="audio/*"
                    onChange={handleVoiceUpload}
                    className="hidden"
                  />
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Recomendado: 10-30 segundos de fala clara
                </p>
              </div>
            </div>
          )}

          {/* Configurações de Voz */}
          {isEditing && (
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
            </div>
          )}

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

          {/* Is Default */}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="isDefault"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="w-4 h-4 rounded bg-slate-700 border-slate-600 text-purple-500 focus:ring-purple-500"
            />
            <label htmlFor="isDefault" className="text-sm text-slate-300">
              Definir como agente padrão (substitui o assistente geral)
            </label>
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
