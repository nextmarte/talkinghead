'use client';

interface CallControlsProps {
  status: 'idle' | 'connecting' | 'connected' | 'ended';
  isMuted: boolean;
  isRecording: boolean;
  onStartCall: () => void;
  onEndCall: () => void;
  onToggleMute: () => void;
  onPushToTalkStart: () => void;
  onPushToTalkEnd: () => void;
  onReset: () => void;
}

export default function CallControls({
  status,
  isMuted,
  isRecording,
  onStartCall,
  onEndCall,
  onToggleMute,
  onPushToTalkStart,
  onPushToTalkEnd,
  onReset,
}: CallControlsProps) {
  if (status === 'idle' || status === 'ended') {
    return (
      <button
        onClick={onStartCall}
        className="px-8 py-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-semibold rounded-2xl shadow-lg shadow-green-500/30 transition-all duration-200 hover:scale-105 active:scale-95 flex items-center gap-3"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
        </svg>
        Iniciar Chamada
      </button>
    );
  }

  if (status === 'connecting') {
    return (
      <button
        disabled
        className="px-8 py-4 bg-yellow-500/20 text-yellow-400 font-semibold rounded-2xl flex items-center gap-3"
      >
        <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        Conectando...
      </button>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Controles principais */}
      <div className="flex items-center gap-4">
        {/* Mute */}
        <button
          onClick={onToggleMute}
          className={`
            w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200
            ${isMuted 
              ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' 
              : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'}
          `}
          title={isMuted ? 'Ativar microfone' : 'Desativar microfone'}
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

        {/* Push-to-Talk */}
        <button
          onMouseDown={onPushToTalkStart}
          onMouseUp={onPushToTalkEnd}
          onMouseLeave={onPushToTalkEnd}
          onTouchStart={onPushToTalkStart}
          onTouchEnd={onPushToTalkEnd}
          disabled={isMuted}
          className={`
            w-20 h-20 rounded-full flex items-center justify-center transition-all duration-200
            ${isRecording 
              ? 'bg-red-500 text-white scale-110 shadow-lg shadow-red-500/50' 
              : isMuted
                ? 'bg-slate-700/30 text-slate-500 cursor-not-allowed'
                : 'bg-blue-500 text-white hover:bg-blue-600 hover:scale-105 active:scale-95 shadow-lg shadow-blue-500/30'}
          `}
          title="Segure para falar"
        >
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        </button>

        {/* End Call */}
        <button
          onClick={onEndCall}
          className="w-14 h-14 rounded-full bg-red-500 text-white hover:bg-red-600 flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95 shadow-lg shadow-red-500/30"
          title="Encerrar chamada"
        >
          <svg className="w-6 h-6 rotate-[135deg]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          </svg>
        </button>
      </div>

      {/* Instrução */}
      <p className="text-sm text-slate-400">
        {isRecording ? '🔴 Solte para enviar' : 'Segure o botão para falar'}
      </p>

      {/* Reset */}
      <button
        onClick={onReset}
        className="text-sm text-slate-500 hover:text-slate-300 transition-colors"
      >
        Limpar conversa
      </button>
    </div>
  );
}
