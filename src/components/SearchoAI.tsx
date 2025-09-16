import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { AudioRecorder, encodeAudioForAPI, AudioQueue } from '../utils/AudioRecorder';

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
  const audioRecorderRef = useRef<AudioRecorder | null>(null);
  const audioQueueRef = useRef<AudioQueue | null>(null);

  // Initialize audio context and queue
  useEffect(() => {
    if (isActive && !audioContextRef.current) {
      audioContextRef.current = new AudioContext({ sampleRate: 24000 });
      audioQueueRef.current = new AudioQueue(audioContextRef.current);
    }
    
    return () => {
      if (audioRecorderRef.current) {
        audioRecorderRef.current.stop();
        audioRecorderRef.current = null;
      }
    };
  }, [isActive]);

  // WebSocket connection with audio recording
  useEffect(() => {
    if (!isActive) return;

    const connectToSearcho = async () => {
      try {
        // Connect to our edge function that handles OpenAI Realtime API
        const wsUrl = `wss://gqdvwmwueaqyqepwyifk.functions.supabase.co/functions/v1/searcho-realtime`;
        wsRef.current = new WebSocket(wsUrl);

        wsRef.current.onopen = async () => {
          console.log('Connected to Searcho AI');
          setIsConnected(true);
          
          // Initialize audio recording
          if (audioContextRef.current && !audioRecorderRef.current) {
            try {
              audioRecorderRef.current = new AudioRecorder((audioData: Float32Array) => {
                if (wsRef.current?.readyState === WebSocket.OPEN && !isMuted) {
                  const encodedAudio = encodeAudioForAPI(audioData);
                  wsRef.current.send(JSON.stringify({
                    type: 'input_audio_buffer.append',
                    audio: encodedAudio
                  }));
                }
              });

              await audioRecorderRef.current.start();
              console.log('Audio recording started');
            } catch (error) {
              console.error('Error starting audio recording:', error);
            }
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
      if (audioRecorderRef.current) {
        audioRecorderRef.current.stop();
        audioRecorderRef.current = null;
      }
    };
  }, [isActive, isMuted]);

  const handleSearchoMessage = async (data: any) => {
    console.log('Received message from Searcho:', data);
    
    switch (data.type) {
      case 'response.audio.delta':
        if (data.delta && audioQueueRef.current) {
          // Convert base64 to Uint8Array and play audio
          const binaryString = atob(data.delta);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          await audioQueueRef.current.addToQueue(bytes);
        }
        setIsSpeaking(true);
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
      case 'session.created':
        console.log('Session created, sending session update');
        // Send session configuration after session is created
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: "session.update",
            session: {
              modalities: ["text", "audio"],
              instructions: `Sen Searcho, Türkçe konuşan bir UX araştırma asistanısın. ${projectContext?.studyType || 'Kullanıcı deneyimi'} araştırması yapıyorsun. Samimi ve profesyonel bir şekilde kullanıcılarla konuş. 
              
              Bu araştırma "${projectContext?.title || 'Bilinmeyen proje'}" projesi hakkında. 
              Proje açıklaması: ${projectContext?.description || 'Açıklama yok'}
              
              Görevin:
              1. Katılımcıyla samimi bir şekilde tanış
              2. Proje hakkında sorular sor
              3. Kullanıcı deneyimi üzerine derinlemesine konuş
              4. Yapıcı geri bildirim topla
              
              Türkçe, samimi ve profesyonel bir tonda konuş.`,
              voice: "alloy",
              input_audio_format: "pcm16",
              output_audio_format: "pcm16",
              input_audio_transcription: {
                model: "whisper-1"
              },
              turn_detection: {
                type: "server_vad",
                threshold: 0.5,
                prefix_padding_ms: 300,
                silence_duration_ms: 1000
              },
              temperature: 0.8,
              max_response_output_tokens: "inf"
            }
          }));
        }
        break;
      case 'error':
        console.error('Searcho error:', data.message);
        break;
    }
  };

  const toggleMute = () => {
    const newMutedState = !isMuted;
    setIsMuted(newMutedState);
    
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      if (newMutedState) {
        // Clear audio buffer when muting
        wsRef.current.send(JSON.stringify({
          type: 'input_audio_buffer.clear'
        }));
      }
    }
    
    console.log(`Audio ${newMutedState ? 'muted' : 'unmuted'}`);
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