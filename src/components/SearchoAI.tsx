import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react';

interface SearchoAIProps {
  isActive: boolean;
  projectContext?: {
    title?: string;
    description?: string;
    studyType?: string;
  };
  onSessionEnd?: () => void;
}

const SearchoAI = ({ isActive, projectContext, onSessionEnd }: SearchoAIProps) => {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Initialize audio context
  useEffect(() => {
    if (isActive && !audioContextRef.current) {
      audioContextRef.current = new AudioContext({ sampleRate: 24000 });
    }
  }, [isActive]);

  // WebSocket connection for OpenAI Realtime API
  useEffect(() => {
    if (!isActive) return;

    const connectToSearcho = async () => {
      try {
        // Connect to our edge function that handles OpenAI Realtime API
        const wsUrl = `wss://gqdvwmwueaqyqepwyifk.functions.supabase.co/functions/v1/searcho-realtime`;
        wsRef.current = new WebSocket(wsUrl);

        wsRef.current.onopen = () => {
          console.log('Connected to Searcho AI');
          setIsConnected(true);
          
          // Send initial context
          if (wsRef.current && projectContext) {
            wsRef.current.send(JSON.stringify({
              type: 'session.update',
              session: {
                instructions: `Sen Searcho, Türkçe konuşan bir UX araştırma asistanısın. 
                Bu araştırma "${projectContext.title}" projesi hakkında. 
                Proje açıklaması: ${projectContext.description}
                Araştırma tipi: ${projectContext.studyType}
                
                Görevin:
                1. Katılımcıyla samimi bir şekilde tanış
                2. Proje hakkında sorular sor
                3. Kullanıcı deneyimi üzerine derinlemesine konuş
                4. Yapıcı geri bildirim topla
                
                Türkçe, samimi ve profesyonel bir tonda konuş.`
              }
            }));
          }
        };

        wsRef.current.onmessage = (event) => {
          const data = JSON.parse(event.data);
          handleSearchoMessage(data);
        };

        wsRef.current.onerror = (error) => {
          console.error('WebSocket error:', error);
          setIsConnected(false);
        };

        wsRef.current.onclose = () => {
          console.log('Disconnected from Searcho AI');
          setIsConnected(false);
        };

      } catch (error) {
        console.error('Failed to connect to Searcho:', error);
      }
    };

    connectToSearcho();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [isActive, projectContext]);

  const handleSearchoMessage = (data: any) => {
    switch (data.type) {
      case 'response.audio.delta':
        setIsSpeaking(true);
        // Handle audio playback here
        break;
      case 'response.audio.done':
        setIsSpeaking(false);
        break;
      case 'input_audio_buffer.speech_started':
        setIsListening(true);
        break;
      case 'input_audio_buffer.speech_stopped':
        setIsListening(false);
        break;
    }
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
    if (wsRef.current) {
      wsRef.current.send(JSON.stringify({
        type: 'input_audio_buffer.clear'
      }));
    }
  };

  if (!isActive) return null;

  return (
    <div className="flex flex-col items-center justify-center h-full bg-gradient-to-b from-surface to-canvas">
      {/* Searcho AI Gradient Circle */}
      <div className="relative">
        {/* Main gradient circle */}
        <div 
          className={`
            w-48 h-48 rounded-full relative overflow-hidden transition-all duration-500 ease-in-out
            ${isSpeaking ? 'scale-110 shadow-2xl' : 'scale-100 shadow-xl'}
          `}
          style={{
            background: `
              radial-gradient(circle at 30% 30%, #667eea 0%, #764ba2 45%, #f093fb 100%),
              linear-gradient(135deg, rgba(102, 126, 234, 0.8) 0%, rgba(118, 75, 162, 0.9) 50%, rgba(240, 147, 251, 0.8) 100%)
            `
          }}
        >
          {/* Inner glow effect */}
          <div 
            className={`
              absolute inset-4 rounded-full transition-all duration-300
              ${isSpeaking ? 'animate-pulse' : ''}
            `}
            style={{
              background: 'radial-gradient(circle, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0.1) 70%, transparent 100%)'
            }}
          />
          
          {/* Speaking animation waves */}
          {isSpeaking && (
            <>
              <div className="absolute inset-0 rounded-full border-2 border-white/30 animate-ping" />
              <div className="absolute inset-2 rounded-full border-2 border-white/20 animate-ping animation-delay-75" />
              <div className="absolute inset-4 rounded-full border-2 border-white/10 animate-ping animation-delay-150" />
            </>
          )}

          {/* Searcho logo/icon in center */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-white font-bold text-2xl tracking-wider">
              SEARCHO
            </div>
          </div>
        </div>

        {/* Connection status indicator */}
        <div className={`
          absolute -top-2 -right-2 w-6 h-6 rounded-full border-2 border-white
          ${isConnected ? 'bg-green-500' : 'bg-red-500'}
        `} />
      </div>

      {/* Status Text */}
      <div className="mt-8 text-center">
        <h3 className="text-xl font-semibold text-text-primary mb-2">
          {isConnected ? 'Searcho AI Hazır' : 'Bağlanıyor...'}
        </h3>
        <p className="text-text-secondary text-sm">
          {isListening && 'Dinliyor...'}
          {isSpeaking && 'Konuşuyor...'}
          {!isListening && !isSpeaking && isConnected && 'Sizi dinliyorum, konuşmaya başlayabilirsiniz'}
          {!isConnected && 'Searcho AI ile bağlantı kuruluyor...'}
        </p>
      </div>

      {/* Audio Controls */}
      <div className="mt-8 flex items-center space-x-4">
        <Button
          variant="outline"
          size="lg"
          onClick={toggleMute}
          className={`
            ${isMuted ? 'bg-red-50 border-red-200 text-red-600' : 'bg-white'}
          `}
        >
          {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          {isMuted ? 'Sessize Alınmış' : 'Mikrofon Açık'}
        </Button>

        {onSessionEnd && (
          <Button
            variant="destructive"
            size="lg"
            onClick={onSessionEnd}
          >
            Görüşmeyi Bitir
          </Button>
        )}
      </div>

      {/* Debug info (only in development) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="mt-4 text-xs text-text-muted space-y-1">
          <div>Connected: {isConnected ? 'Yes' : 'No'}</div>
          <div>Listening: {isListening ? 'Yes' : 'No'}</div>
          <div>Speaking: {isSpeaking ? 'Yes' : 'No'}</div>
          <div>Muted: {isMuted ? 'Yes' : 'No'}</div>
        </div>
      )}
    </div>
  );
};

export default SearchoAI;