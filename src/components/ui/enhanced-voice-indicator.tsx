import React from 'react';
import { Mic, MicOff } from 'lucide-react';

interface EnhancedVoiceIndicatorProps {
  isListening: boolean;
  isSpeaking: boolean;
  userSpeakingLevel: number;
  microphoneEnabled: boolean;
  className?: string;
}

const EnhancedVoiceIndicator: React.FC<EnhancedVoiceIndicatorProps> = ({
  isListening,
  isSpeaking,
  userSpeakingLevel,
  microphoneEnabled,
  className = ""
}) => {
  // Generate dynamic audio bars based on speaking level
  const renderAudioBars = () => {
    const bars = 5;
    const waves = [];
    
    for (let i = 0; i < bars; i++) {
      let height = 4; // base height
      
      if (microphoneEnabled && isListening && userSpeakingLevel > 5) {
        // User is speaking - show real audio level
        const normalizedLevel = Math.min(userSpeakingLevel / 50, 1);
        height = 4 + (normalizedLevel * 20) + (Math.sin(Date.now() * 0.01 + i) * 3);
      } else if (isSpeaking) {
        // AI is speaking - show animated bars
        height = 4 + Math.sin(Date.now() * 0.02 + i) * 8;
      }
      
      waves.push(
        <div
          key={i}
          className={`rounded-full transition-all duration-150 ${
            isListening && userSpeakingLevel > 5 
              ? 'bg-blue-400' 
              : isSpeaking 
                ? 'bg-green-400' 
                : microphoneEnabled 
                  ? 'bg-white/40' 
                  : 'bg-red-400/60'
          }`}
          style={{
            width: '3px',
            height: `${Math.max(height, 4)}px`,
            minHeight: '4px'
          }}
        />
      );
    }
    
    return waves;
  };

  // Status text based on current state
  const getStatusText = () => {
    if (!microphoneEnabled) return 'Mikrofon kapalı';
    if (isListening && userSpeakingLevel > 5) return 'Konuşuyorsunuz...';
    if (isSpeaking) return 'AI konuşuyor...';
    if (isListening) return 'Dinliyor...';
    return 'Bekliyor...';
  };

  const getStatusColor = () => {
    if (!microphoneEnabled) return 'text-red-400';
    if (isListening && userSpeakingLevel > 5) return 'text-blue-400';
    if (isSpeaking) return 'text-green-400';
    return 'text-white/70';
  };

  return (
    <div className={`flex flex-col items-center space-y-3 ${className}`}>
      {/* Audio Visualization */}
      <div className="flex items-center justify-center space-x-1 h-12 px-4 py-2 bg-black/20 rounded-lg backdrop-blur-sm">
        {microphoneEnabled ? (
          <Mic className={`w-4 h-4 mr-2 ${isListening ? 'text-blue-400' : 'text-white/70'}`} />
        ) : (
          <MicOff className="w-4 h-4 mr-2 text-red-400" />
        )}
        {renderAudioBars()}
      </div>
      
      {/* Status Text */}
      <div className={`text-xs font-medium ${getStatusColor()} transition-colors duration-200`}>
        {getStatusText()}
      </div>
    </div>
  );
};

export default EnhancedVoiceIndicator;