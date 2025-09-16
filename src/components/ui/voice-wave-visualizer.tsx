import React, { useEffect, useRef, useState } from 'react';

interface VoiceWaveVisualizerProps {
  isListening: boolean;
  audioStream?: MediaStream | null;
  className?: string;
}

const VoiceWaveVisualizer: React.FC<VoiceWaveVisualizerProps> = ({
  isListening,
  audioStream,
  className = ""
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);

  useEffect(() => {
    if (audioStream && isListening) {
      setupAudioAnalyzer();
    } else {
      cleanupAnalyzer();
    }

    return () => cleanupAnalyzer();
  }, [audioStream, isListening]);

  const setupAudioAnalyzer = () => {
    if (!audioStream) return;

    try {
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(audioStream);
      const analyser = audioContext.createAnalyser();
      
      analyser.fftSize = 256;
      source.connect(analyser);
      
      analyserRef.current = analyser;
      dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
      
      drawWaveform();
    } catch (error) {
      console.error('Error setting up audio analyzer:', error);
    }
  };

  const cleanupAnalyzer = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    analyserRef.current = null;
    dataArrayRef.current = null;
  };

  const drawWaveform = () => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    const dataArray = dataArrayRef.current;

    if (!canvas || !analyser || !dataArray) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    analyser.getByteFrequencyData(dataArray);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Create gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, 'rgba(102, 126, 234, 0.8)');
    gradient.addColorStop(0.5, 'rgba(118, 75, 162, 0.6)');
    gradient.addColorStop(1, 'rgba(240, 147, 251, 0.4)');

    const barCount = 32;
    const barWidth = canvas.width / barCount;
    
    for (let i = 0; i < barCount; i++) {
      const barHeight = (dataArray[i] / 255) * canvas.height * 0.8;
      const x = i * barWidth;
      const y = canvas.height - barHeight;

      ctx.fillStyle = gradient;
      ctx.fillRect(x + 1, y, barWidth - 2, barHeight);
      
      // Add glow effect
      ctx.shadowColor = 'rgba(102, 126, 234, 0.5)';
      ctx.shadowBlur = 4;
      ctx.fillRect(x + 1, y, barWidth - 2, barHeight);
      ctx.shadowBlur = 0;
    }

    animationRef.current = requestAnimationFrame(drawWaveform);
  };

  // Generate static wave pattern when not listening
  const generateStaticWave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, 'rgba(102, 126, 234, 0.3)');
    gradient.addColorStop(0.5, 'rgba(118, 75, 162, 0.2)');
    gradient.addColorStop(1, 'rgba(240, 147, 251, 0.1)');

    const barCount = 32;
    const barWidth = canvas.width / barCount;
    
    for (let i = 0; i < barCount; i++) {
      const barHeight = Math.random() * 20 + 5;
      const x = i * barWidth;
      const y = canvas.height - barHeight;

      ctx.fillStyle = gradient;
      ctx.fillRect(x + 1, y, barWidth - 2, barHeight);
    }
  };

  useEffect(() => {
    if (!isListening) {
      generateStaticWave();
    }
  }, [isListening]);

  return (
    <canvas
      ref={canvasRef}
      width={300}
      height={60}
      className={`${className}`}
    />
  );
};

export default VoiceWaveVisualizer;