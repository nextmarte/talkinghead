'use client';

import { useEffect, useRef } from 'react';

interface AvatarProps {
  isSpeaking: boolean;
  isProcessing: boolean;
  status: 'idle' | 'connecting' | 'connected' | 'ended';
}

export default function Avatar({ isSpeaking, isProcessing, status }: AvatarProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | undefined>(undefined);

  // Animação de ondas de áudio
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

      // Círculos de onda quando falando
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

      // Avatar principal
      const gradient = ctx.createRadialGradient(
        centerX, centerY, 0,
        centerX, centerY, 70
      );

      if (status === 'connected') {
        gradient.addColorStop(0, '#3b82f6');
        gradient.addColorStop(1, '#8b5cf6');
      } else if (status === 'connecting') {
        gradient.addColorStop(0, '#f59e0b');
        gradient.addColorStop(1, '#ef4444');
      } else {
        gradient.addColorStop(0, '#64748b');
        gradient.addColorStop(1, '#475569');
      }

      ctx.beginPath();
      ctx.arc(centerX, centerY, 70, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();

      // Ícone no centro
      ctx.fillStyle = 'white';
      ctx.font = '48px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      if (status === 'connected') {
        ctx.fillText('🤖', centerX, centerY);
      } else if (status === 'connecting') {
        ctx.fillText('📞', centerX, centerY);
      } else {
        ctx.fillText('👤', centerX, centerY);
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isSpeaking, isProcessing, status]);

  return (
    <div className="relative">
      {/* Glow effect */}
      <div className={`
        absolute inset-0 rounded-full blur-xl transition-all duration-500
        ${isSpeaking ? 'bg-green-500/30' : 
          isProcessing ? 'bg-yellow-500/30' : 
          status === 'connected' ? 'bg-blue-500/20' : 'bg-transparent'}
      `} />
      
      {/* Canvas para animação */}
      <canvas 
        ref={canvasRef} 
        width={280} 
        height={280}
        className="relative z-10"
      />
    </div>
  );
}
