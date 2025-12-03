'use client';

import { useEffect, useRef, useState, useMemo } from 'react';

interface AvatarProps {
  isSpeaking: boolean;
  isProcessing: boolean;
  status: 'idle' | 'connecting' | 'connected' | 'ended';
  avatarUrl?: string | null;
}

export default function Avatar({ isSpeaking, isProcessing, status, avatarUrl }: AvatarProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | undefined>(undefined);
  const [imageError, setImageError] = useState(false);
  const [backendUrl, setBackendUrl] = useState<string>("");
  
  // Detecta o backend URL correto no client-side
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const { protocol, hostname } = window.location;
      // Se estamos em HTTPS (produção), usa o mesmo host (Apache faz proxy para /uploads)
      // Se estamos em HTTP (dev), usa backend direto na porta 8583
      if (protocol === 'https:') {
        setBackendUrl('');
      } else {
        setBackendUrl(`http://${hostname}:8583`);
      }
    }
  }, []);
  
  // Monta URL do avatar baseada no ambiente
  const fullAvatarUrl = useMemo(() => {
    if (!avatarUrl) return null;
    if (avatarUrl.startsWith("http")) return avatarUrl;
    return `${backendUrl}${avatarUrl}`;
  }, [avatarUrl, backendUrl]);
  
  // Reset erro quando URL muda
  useEffect(() => {
    setImageError(false);
  }, [fullAvatarUrl]);

  // Animação de ondas de áudio (apenas ondas, não o avatar)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;

    let phase = 0;

    const animate = () => {
      ctx.clearRect(0, 0, width, height);

      // Círculos de onda quando falando ou processando
      if (isSpeaking || isProcessing) {
        const numWaves = 3;
        for (let i = 0; i < numWaves; i++) {
          const offset = (phase + i * 0.3) % 1;
          const radius = 80 + offset * 60;
          const alpha = 1 - offset;

          ctx.beginPath();
          ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
          ctx.strokeStyle = isSpeaking 
            ? `rgba(34, 197, 94, ${alpha * 0.5})` // Verde quando falando
            : `rgba(234, 179, 8, ${alpha * 0.5})`; // Amarelo quando processando
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        phase += isSpeaking ? 0.02 : 0.01;
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isSpeaking, isProcessing]);

  // Determina as cores de borda baseado no status
  const getBorderClasses = () => {
    if (isSpeaking) return 'ring-4 ring-green-500/80';
    if (isProcessing) return 'ring-4 ring-yellow-500/60 animate-pulse';
    if (status === 'connected') return 'ring-2 ring-purple-500/50';
    if (status === 'connecting') return 'ring-2 ring-orange-500/50 animate-pulse';
    return 'ring-2 ring-slate-600/30';
  };

  // Determina o gradiente de fundo
  const getGradientClasses = () => {
    if (status === 'connected') return 'from-blue-500 to-purple-600';
    if (status === 'connecting') return 'from-orange-500 to-red-500';
    return 'from-slate-600 to-slate-700';
  };

  return (
    <div className="relative w-[180px] h-[180px] sm:w-[280px] sm:h-[280px]">
      {/* Glow effect */}
      <div className={`
        absolute inset-0 rounded-full blur-xl transition-all duration-500
        ${isSpeaking ? 'bg-green-500/30' : 
          isProcessing ? 'bg-yellow-500/30' : 
          status === 'connected' ? 'bg-blue-500/20' : 'bg-transparent'}
      `} />
      
      {/* Canvas para animação de ondas */}
      <canvas 
        ref={canvasRef} 
        width={280} 
        height={280}
        className="absolute inset-0 z-10 w-full h-full"
      />
      
      {/* Avatar container - centralizado */}
      <div className="absolute inset-0 flex items-center justify-center z-20">
        <div className={`
          w-[90px] h-[90px] sm:w-[140px] sm:h-[140px] rounded-full overflow-hidden
          ${getBorderClasses()}
          ${!fullAvatarUrl ? `bg-gradient-to-br ${getGradientClasses()}` : ''}
          flex items-center justify-center
          transition-all duration-300
        `}>
          {fullAvatarUrl && !imageError ? (
            <img
              src={fullAvatarUrl}
              alt="Avatar do agente"
              className="w-full h-full object-cover"
              onError={() => setImageError(true)}
            />
          ) : (
            <span className="text-3xl sm:text-5xl">
              {status === 'connected' ? '🤖' : 
               status === 'connecting' ? '📞' : '👤'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
