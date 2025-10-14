import { useEffect, useRef, useState } from 'react';
import StreamingAvatar, { 
  StreamingEvents, 
  TaskType 
} from '@heygen/streaming-avatar';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface AvatarSpeakerProps {
  questionText: string;
  onSpeakingStart: () => void;
  onSpeakingComplete: () => void;
}

export const AvatarSpeaker = ({ 
  questionText, 
  onSpeakingStart, 
  onSpeakingComplete 
}: AvatarSpeakerProps) => {
  const [avatar, setAvatar] = useState<StreamingAvatar | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { toast } = useToast();

  // Get session token from edge function
  const getSessionToken = async () => {
    console.log('Fetching HeyGen session token...');
    const { data, error } = await supabase.functions.invoke('heygen-session');
    
    if (error) {
      console.error('Error fetching session token:', error);
      throw error;
    }
    
    console.log('Session token received');
    return data.data.access_token;
  };

  // Initialize avatar session
  useEffect(() => {
    const initAvatar = async () => {
      try {
        console.log('Initializing HeyGen avatar...');
        const token = await getSessionToken();
        
        const avatarInstance = new StreamingAvatar({
          token,
        });

        // Listen to events
        avatarInstance.on(StreamingEvents.STREAM_READY, (event) => {
          console.log('Avatar stream ready');
          setStream(event.detail);
          setIsInitializing(false);
        });

        avatarInstance.on(StreamingEvents.STREAM_DISCONNECTED, () => {
          console.log('Avatar disconnected');
        });

        avatarInstance.on(StreamingEvents.AVATAR_START_TALKING, () => {
          console.log('Avatar started talking');
          onSpeakingStart();
        });

        avatarInstance.on(StreamingEvents.AVATAR_STOP_TALKING, () => {
          console.log('Avatar stopped talking');
          onSpeakingComplete();
        });

        await avatarInstance.createStartAvatar({
          quality: 'low' as any,
          avatarName: 'default'
        });

        console.log('Avatar created successfully');
        setAvatar(avatarInstance);
      } catch (error) {
        console.error('Error initializing avatar:', error);
        setIsInitializing(false);
        toast({
          title: 'Avatar Hatası',
          description: 'Avatar başlatılamadı',
          variant: 'destructive',
        });
      }
    };

    initAvatar();

    return () => {
      console.log('Cleaning up avatar...');
      avatar?.stopAvatar();
    };
  }, []);

  // Display video stream
  useEffect(() => {
    if (stream && videoRef.current) {
      console.log('Setting video stream');
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  // Speak question when it changes
  useEffect(() => {
    if (avatar && questionText && !isInitializing) {
      console.log('Speaking question:', questionText);
      avatar.speak({
        text: questionText,
        task_type: TaskType.TALK,
      });
    }
  }, [questionText, avatar, isInitializing]);

  return (
    <div className="relative w-full max-w-2xl aspect-video bg-background/50 rounded-lg overflow-hidden border">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="w-full h-full object-cover"
      />
      {isInitializing && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80">
          <div className="flex flex-col items-center gap-2">
            <div className="animate-pulse text-foreground">Avatar yükleniyor...</div>
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          </div>
        </div>
      )}
    </div>
  );
};
