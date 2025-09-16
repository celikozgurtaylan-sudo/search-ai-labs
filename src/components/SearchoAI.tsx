import React, { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Mic, MicOff, Video, PhoneOff, CheckCircle2, Circle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import MinimalVoiceWaves from '@/components/ui/minimal-voice-waves';
import { useToast } from '@/components/ui/use-toast';
import { AudioRecorder } from '@/utils/AudioRecorder';
import { interviewService, InterviewQuestion, InterviewProgress } from '@/services/interviewService';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

interface SearchoAIProps {
  isActive: boolean;
  projectContext?: {
    description: string;
    discussionGuide?: any;
    template?: string;
    sessionId?: string;
    projectId?: string;
    participantId?: string;
  };
  onSessionEnd?: () => void;
}

const SearchoAI = ({ isActive, projectContext, onSessionEnd }: SearchoAIProps) => {
  const { toast } = useToast();
  
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [aiTranscript, setAiTranscript] = useState('');
  const [sessionStartTime, setSessionStartTime] = useState<Date | null>(null);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  
  // Interview-specific state
  const [currentQuestion, setCurrentQuestion] = useState<InterviewQuestion | null>(null);
  const [interviewProgress, setInterviewProgress] = useState<InterviewProgress>({ completed: 0, total: 0, isComplete: false, percentage: 0 });
  const [currentResponse, setCurrentResponse] = useState<string>('');
  const [isQuestionComplete, setIsQuestionComplete] = useState(false);
  const [questionsInitialized, setQuestionsInitialized] = useState(false);
  const [isWaitingForAnswer, setIsWaitingForAnswer] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioRecorderRef = useRef<AudioRecorder | null>(null);
  const audioQueueRef = useRef<any | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);

  // Initialize questions when session starts
  useEffect(() => {
    if (isActive && projectContext?.sessionId && projectContext?.projectId && 
        projectContext?.discussionGuide && !questionsInitialized) {
      initializeInterviewQuestions();
    }
  }, [isActive, projectContext, questionsInitialized]);

  const initializeInterviewQuestions = async () => {
    if (!projectContext?.sessionId || !projectContext?.projectId || !projectContext?.discussionGuide) {
      return;
    }

    try {
      console.log('Initializing interview questions...');
      await interviewService.initializeQuestions(
        projectContext.projectId,
        projectContext.sessionId,
        projectContext.discussionGuide
      );
      setQuestionsInitialized(true);
      
      // Get the first question
      await getNextQuestion();
      
      toast({
        title: "Interview Started",
        description: "Questions have been loaded. Ready to begin!",
      });
    } catch (error) {
      console.error('Failed to initialize questions:', error);
      toast({
        title: "Error",
        description: "Failed to initialize interview questions",
        variant: "destructive",
      });
    }
  };

  const getNextQuestion = async () => {
    if (!projectContext?.sessionId) return;

    try {
      const data = await interviewService.getNextQuestion(projectContext.sessionId);
      setCurrentQuestion(data.nextQuestion);
      setInterviewProgress(data.progress);
      setIsQuestionComplete(false);
      setCurrentResponse('');
      setIsWaitingForAnswer(false);

      if (data.progress.isComplete) {
        toast({
          title: "Interview Complete!",
          description: "All questions have been answered. Starting analysis...",
        });
        // Trigger analysis
        if (projectContext.projectId) {
          setTimeout(() => analyzeInterview(), 2000);
        }
      }
    } catch (error) {
      console.error('Failed to get next question:', error);
    }
  };

  const analyzeInterview = async () => {
    if (!projectContext?.sessionId || !projectContext?.projectId) return;

    try {
      await interviewService.analyzeInterview(projectContext.sessionId, projectContext.projectId);
      toast({
        title: "Analysis Complete",
        description: "Interview responses have been analyzed successfully!",
      });
    } catch (error) {
      console.error('Failed to analyze interview:', error);
      toast({
        title: "Analysis Error",
        description: "Failed to analyze interview responses",
        variant: "destructive",
      });
    }
  };

  const saveResponse = async (transcription: string, isComplete: boolean = false) => {
    if (!projectContext?.sessionId || !currentQuestion) return;

    try {
      await interviewService.saveResponse(projectContext.sessionId, {
        questionId: currentQuestion.id,
        participantId: projectContext.participantId,
        transcription,
        responseText: transcription,
        isComplete,
        metadata: {
          timestamp: new Date().toISOString(),
          questionText: currentQuestion.question_text
        }
      });

      if (isComplete) {
        setIsQuestionComplete(true);
        // Move to next question after a short delay
        setTimeout(() => {
          getNextQuestion();
        }, 2000);
      }
    } catch (error) {
      console.error('Failed to save response:', error);
    }
  };

  // Initialize session timer
  useEffect(() => {
    if (isActive && !sessionStartTime) {
      setSessionStartTime(new Date());
    }
    
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    
    return () => clearInterval(timer);
  }, [isActive, sessionStartTime]);

  // Initialize audio context and queue
  useEffect(() => {
    if (isActive && !audioContextRef.current) {
      setIsInitializing(true);
      setAudioError(null);
      
      const initAudio = async () => {
        try {
          // Request microphone permission
          await navigator.mediaDevices.getUserMedia({ audio: true });
          console.log('Microphone permission granted');
          
          // Create AudioContext and ensure it's resumed
          audioContextRef.current = new AudioContext({ sampleRate: 24000 });
          
          // Add click handler to resume AudioContext on user interaction
          const resumeAudioContext = async () => {
            if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
              await audioContextRef.current.resume();
              console.log('AudioContext resumed on user interaction');
            }
          };
          
          document.addEventListener('click', resumeAudioContext, { once: true });
          document.addEventListener('touchstart', resumeAudioContext, { once: true });
          
          if (audioContextRef.current.state === 'suspended') {
            await audioContextRef.current.resume();
            console.log('AudioContext resumed');
          }
          
          // Initialize AudioQueue (assuming it's available from AudioRecorder)
          audioQueueRef.current = { addToQueue: async () => {} }; // Placeholder
          console.log('Audio system initialized');
        } catch (error) {
          console.error('Audio initialization failed:', error);
          setAudioError(error instanceof Error ? error.message : 'Audio setup failed');
        } finally {
          setIsInitializing(false);
        }
      };
      
      initAudio();
    }
    
    return () => {
      if (audioRecorderRef.current) {
        audioRecorderRef.current.stop();
        audioRecorderRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
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
                  // Send audio to WebSocket (assuming encodeAudioForAPI exists)
                  const encodedAudio = btoa(String.fromCharCode(...new Uint8Array(audioData.buffer)));
                  wsRef.current.send(JSON.stringify({
                    type: 'input_audio_buffer.append',
                    audio: encodedAudio
                  }));
                }
              });

              await audioRecorderRef.current.start();
              
              // Get audio stream for visualization
              try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                audioStreamRef.current = stream;
              } catch (error) {
                console.error('Error getting audio stream for visualization:', error);
              }
              
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
    console.log('Received message type:', data.type, data);
    
    switch (data.type) {
      case 'response.output_audio.delta':
        console.log('Audio delta received, size:', data.delta?.length);
        if (data.delta && audioQueueRef.current) {
          try {
            // Convert base64 to Uint8Array and play audio
            const binaryString = atob(data.delta);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            console.log('Adding audio chunk to queue, size:', bytes.length);
            await audioQueueRef.current.addToQueue(bytes);
            setIsSpeaking(true);
          } catch (error) {
            console.error('Error processing audio delta:', error);
          }
        }
        break;
      case 'response.output_audio_transcript.delta':
        console.log('Transcript delta:', data.delta);
        // Accumulate AI transcript for display
        setAiTranscript(prev => prev + (data.delta || ''));
        break;
      case 'response.output_audio.done':
        console.log('Audio response finished');
        setIsSpeaking(false);
        setIsWaitingForAnswer(true);
        break;
      case 'response.done':
        console.log('Full response completed');
        setIsSpeaking(false);
        // Clear transcript for next response
        setTimeout(() => setAiTranscript(''), 2000);
        break;
      case 'input_audio_buffer.speech_started':
        console.log('Speech started detected');
        setIsListening(true);
        break;
      case 'input_audio_buffer.speech_stopped':
        console.log('Speech stopped detected');
        setIsListening(false);
        // Save the response when user stops speaking
        if (currentResponse) {
          saveResponse(currentResponse, true);
        }
        break;
      case 'conversation.item.input_audio_transcription.completed':
        console.log('User transcription completed:', data.transcript);
        setCurrentResponse(data.transcript);
        break;
      case 'session.created':
        console.log('Session created, sending configuration...');
        // Send session configuration after session is created
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          const questionPrompt = currentQuestion ? 
            `Current question: "${currentQuestion.question_text}". Ask this question and wait for the user's complete answer before proceeding.` : 
            'Start the interview by greeting the participant warmly.';

          const config = {
            type: "session.update",
            session: {
              modalities: ["text", "audio"],
              instructions: `You are Searcho, a professional UX research interviewer conducting a structured interview. 

Project: "${projectContext?.description || 'User research project'}"

Your role:
1. Ask questions ONE AT A TIME from the provided question list
2. Wait for complete answers before moving to the next question
3. Ask follow-up questions when needed for clarity
4. Be warm, professional, and encouraging
5. Speak clearly and at a moderate pace

${questionPrompt}

Conduct the interview in a conversational but structured manner. Make sure to get thorough responses to each question.`,
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
                silence_duration_ms: 1500
              },
              temperature: 0.7,
              max_response_output_tokens: "inf"
            }
          };
          wsRef.current.send(JSON.stringify(config));
          console.log('Session configuration sent');
        }
        break;
      case 'session.updated':
        console.log('Session updated successfully');
        break;
      case 'error':
        console.error('OpenAI error:', data);
        setAudioError(data.error?.message || 'API error occurred');
        break;
      default:
        console.log('Unhandled message type:', data.type);
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

  const getSessionDuration = () => {
    if (!sessionStartTime) return '00:00';
    const duration = Math.floor((currentTime.getTime() - sessionStartTime.getTime()) / 1000);
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  if (!isActive) return null;

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-surface to-canvas">
      {/* Interview Progress Header */}
      {questionsInitialized && (
        <div className="bg-white/5 backdrop-blur-sm border-b border-white/10 p-4">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-2">
              <div className="text-white/80 text-sm font-medium">
                Interview Progress
              </div>
              <Badge variant="secondary" className="bg-white/10 text-white">
                {interviewProgress.completed} / {interviewProgress.total}
              </Badge>
            </div>
            <Progress 
              value={interviewProgress.percentage} 
              className="h-2 bg-white/10"
            />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        {/* Error Display */}
        {audioError && (
          <div className="absolute top-8 left-1/2 transform -translate-x-1/2 bg-red-500/20 backdrop-blur-md border border-red-400/50 rounded-lg px-4 py-2 text-red-200 text-sm z-10">
            Audio Error: {audioError}
          </div>
        )}

        {/* Loading State */}
        {isInitializing && (
          <div className="absolute top-8 left-1/2 transform -translate-x-1/2 bg-blue-500/20 backdrop-blur-md border border-blue-400/50 rounded-lg px-4 py-2 text-blue-200 text-sm z-10">
            Initializing audio system...
          </div>
        )}

        {/* Current Question Display */}
        {currentQuestion && (
          <div className="w-full max-w-4xl mb-6">
            <Card className="bg-white/10 backdrop-blur-sm border-white/20 p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center">
                  <Badge variant="outline" className="mr-3 bg-primary/20 text-primary border-primary/30">
                    {currentQuestion.section}
                  </Badge>
                  <span className="text-white/60 text-sm">
                    Question {currentQuestion.question_order}
                  </span>
                </div>
                <div className="flex items-center">
                  {isQuestionComplete ? (
                    <CheckCircle2 className="w-5 h-5 text-green-400" />
                  ) : (
                    <Circle className="w-5 h-5 text-white/40" />
                  )}
                </div>
              </div>
              <div className="text-white text-lg leading-relaxed">
                {currentQuestion.question_text}
              </div>
              {isWaitingForAnswer && !isQuestionComplete && (
                <div className="mt-4 flex items-center text-yellow-400 text-sm">
                  <ArrowRight className="w-4 h-4 mr-2" />
                  Waiting for your response...
                </div>
              )}
            </Card>
          </div>
        )}

        {/* Searcho AI Gradient Circle */}
        <div className="relative mb-8">
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

        {/* AI Transcript Display */}
        <div className="w-full max-w-2xl mb-6">
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 min-h-[120px] border border-white/20">
            <div className="flex items-center mb-2">
              <div className="text-sm font-medium text-white/80">SEARCHO (Interviewer)</div>
              <div className={`ml-2 w-2 h-2 rounded-full ${isSpeaking ? 'bg-green-400 animate-pulse' : 'bg-gray-400'}`} />
            </div>
            <div className="text-white text-base leading-relaxed">
              {aiTranscript || (
                <span className="text-white/50 italic">
                  {isConnected ? 
                    (isListening ? 'Listening...' : 'Ready to start the interview') : 
                    'Connecting...'
                  }
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Controls Bar */}
      <div className="bg-white/5 backdrop-blur-sm border-t border-white/10 p-4">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          {/* Session Timer */}
          <div className="flex items-center space-x-4">
            <div className="text-white/80 text-sm">
              <span className="font-medium">{getSessionDuration()}</span>
            </div>
          </div>

          {/* Voice Wave Visualizer */}
          <div className="flex-1 flex justify-center px-8">
            <div className="bg-white/10 rounded-lg px-4 py-2 border border-white/20">
              <MinimalVoiceWaves 
                isListening={isListening} 
                audioStream={audioStreamRef.current}
                className="opacity-80"
              />
            </div>
          </div>

          {/* Audio/Video Controls */}
          <div className="flex items-center space-x-3">
            <Button
              variant="outline"
              size="sm"
              onClick={toggleMute}
              className={`
                ${isMuted 
                  ? 'bg-red-500/30 border-red-400 text-red-300 hover:bg-red-500/40' 
                  : 'bg-white/10 border-white/20 text-white hover:bg-white/20'
                }
                min-w-[80px] font-medium
              `}
            >
              {isMuted ? <MicOff className="w-4 h-4 mr-2" /> : <Mic className="w-4 h-4 mr-2" />}
              <span className="hidden sm:inline">
                {isMuted ? 'Unmute' : 'Mute'}
              </span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="bg-white/10 border-white/20 text-white hover:bg-white/20"
              title="Video options"
            >
              <Video className="w-4 h-4" />
            </Button>

            {onSessionEnd && (
              <Button
                variant="destructive"
                size="sm"
                onClick={onSessionEnd}
                className="bg-red-600 hover:bg-red-700 text-white min-w-[100px]"
              >
                End Session
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Debug info (only in development) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="absolute top-4 left-4 text-xs text-white/60 space-y-1 bg-black/20 p-2 rounded">
          <div>Connected: {isConnected ? 'Yes' : 'No'}</div>
          <div>Listening: {isListening ? 'Yes' : 'No'}</div>
          <div>Speaking: {isSpeaking ? 'Yes' : 'No'}</div>
          <div>Muted: {isMuted ? 'Yes' : 'No'}</div>
          <div>Questions Init: {questionsInitialized ? 'Yes' : 'No'}</div>
          <div>Current Q: {currentQuestion?.question_order || 'None'}</div>
        </div>
      )}
    </div>
  );
};

export default SearchoAI;