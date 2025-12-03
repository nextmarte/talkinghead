'use client';

interface LatencyBreakdown {
  stt_ms: number;
  llm_ms: number;
  tts_ms?: number;
  first_audio_ms?: number;
  total_ms?: number;
}

interface StatusBarProps {
  status: 'idle' | 'connecting' | 'connected' | 'ended';
  duration: string;
  latency: LatencyBreakdown | null;
}

export default function StatusBar({ status, duration, latency }: StatusBarProps) {
  const ttsLatency = latency?.tts_ms ?? latency?.first_audio_ms ?? 0;
  const totalLatency = latency?.total_ms ?? (latency ? latency.stt_ms + latency.llm_ms + ttsLatency : 0);

  return (
    <div className="flex items-center gap-6">
      {/* Connection Status */}
      <div className="flex items-center gap-2">
        <div className={`
          w-2.5 h-2.5 rounded-full
          ${status === 'connected' ? 'bg-green-500 animate-pulse' : 
            status === 'connecting' ? 'bg-yellow-500 animate-pulse' : 
            'bg-slate-500'}
        `} />
        <span className="text-sm text-slate-400">
          {status === 'connected' ? 'Conectado' : 
           status === 'connecting' ? 'Conectando...' : 
           status === 'ended' ? 'Encerrado' : 'Desconectado'}
        </span>
      </div>

      {/* Duration */}
      {status === 'connected' && (
        <div className="flex items-center gap-2 text-slate-400">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm font-mono">{duration}</span>
        </div>
      )}

      {/* Latency Breakdown */}
      {latency && status === 'connected' && (
        <div className="hidden md:flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1">
            <span className="text-slate-500">STT:</span>
            <span className="text-blue-400 font-mono">{latency.stt_ms}ms</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-slate-500">LLM:</span>
            <span className="text-purple-400 font-mono">{latency.llm_ms}ms</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-slate-500">TTS:</span>
            <span className="text-green-400 font-mono">{ttsLatency}ms</span>
          </div>
          <div className="flex items-center gap-1 pl-2 border-l border-slate-600">
            <span className="text-slate-500">Total:</span>
            <span className={`font-mono font-medium ${totalLatency < 2000 ? 'text-green-400' : totalLatency < 4000 ? 'text-yellow-400' : 'text-red-400'}`}>
              {totalLatency}ms
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
