import React, { useEffect, useRef, useState } from 'react';

interface MinimalVoiceWavesProps {
  isListening: boolean;
  audioStream?: MediaStream | null;
  className?: string;
}

const MinimalVoiceWaves: React.FC<MinimalVoiceWavesProps> = ({
  isListening,
  audioStream,
  className = ""
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const [amplitude, setAmplitude] = useState(0);

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
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      
      analyserRef.current = analyser;
      dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
      
      analyzeAudio();
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

  const analyzeAudio = () => {
    const analyser = analyserRef.current;
    const dataArray = dataArrayRef.current;

    if (!analyser || !dataArray) return;

    analyser.getByteFrequencyData(dataArray);
    
    // Calculate average amplitude from frequency data
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }
    const avgAmplitude = sum / dataArray.length / 255;
    setAmplitude(avgAmplitude);

    animationRef.current = requestAnimationFrame(analyzeAudio);
  };

  // Generate simple animated wave bars
  const renderWaves = () => {
    const bars = 5;
    const waves = [];
    
    for (let i = 0; i < bars; i++) {
      const baseHeight = isListening ? Math.max(amplitude * 40, 4) : 2;
      const variation = isListening ? Math.sin(Date.now() * 0.01 + i) * amplitude * 10 : 0;
      const height = Math.max(baseHeight + variation, 2);
      
      waves.push(
        <div
          key={i}
          className="bg-white/60 rounded-full transition-all duration-75"
          style={{
            width: '3px',
            height: `${height}px`,
            minHeight: '2px'
          }}
        />
      );
    }
    
    return waves;
  };

  return (
    <div className={`flex items-center justify-center space-x-1 h-10 ${className}`}>
      {renderWaves()}
    </div>
  );
};

export default MinimalVoiceWaves;