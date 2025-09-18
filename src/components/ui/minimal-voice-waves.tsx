import React, { useEffect, useRef, useState } from 'react';

interface MinimalVoiceWavesProps {
  isListening: boolean;
  audioStream?: MediaStream | null;
  className?: string;
  userSpeakingLevel?: number;
}

const MinimalVoiceWaves: React.FC<MinimalVoiceWavesProps> = ({
  isListening,
  audioStream,
  className = "",
  userSpeakingLevel = 0
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

  // Generate simple animated wave bars with better user feedback
  const renderWaves = () => {
    const bars = 5;
    const waves = [];
    
    for (let i = 0; i < bars; i++) {
      let height = 2; // base height
      let colorClass = 'bg-white/30'; // default color
      
      if (isListening) {
        // Use either userSpeakingLevel or calculated amplitude
        const level = userSpeakingLevel > 0 ? userSpeakingLevel / 100 : amplitude;
        
        if (level > 0.05) {
          // User is actively speaking
          height = 4 + (level * 20) + (Math.sin(Date.now() * 0.02 + i) * 3);
          colorClass = 'bg-blue-400'; // Blue when user is speaking
        } else {
          // Listening but no speech detected
          height = 2 + Math.sin(Date.now() * 0.01 + i) * 2;
          colorClass = 'bg-green-400/60'; // Green when listening
        }
      } else {
        // Not listening - minimal bars
        height = 2;
        colorClass = 'bg-white/20';
      }
      
      waves.push(
        <div
          key={i}
          className={`rounded-full transition-all duration-150 ${colorClass}`}
          style={{
            width: '3px',
            height: `${Math.max(height, 2)}px`,
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