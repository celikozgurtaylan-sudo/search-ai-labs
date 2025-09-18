import React, { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Mic, MicOff, Video, PhoneOff, CheckCircle2, Circle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import MinimalVoiceWaves from '@/components/ui/minimal-voice-waves';
import EnhancedVoiceIndicator from '@/components/ui/enhanced-voice-indicator';
import { useToast } from '@/components/ui/use-toast';
import { AudioRecorder, AudioQueue } from '@/utils/AudioRecorder';
import { interviewService, InterviewQuestion, InterviewProgress } from '@/services/interviewService';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import TurkishPreambleDisplay from './TurkishPreambleDisplay';

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
  const [microphoneEnabled, setMicrophoneEnabled] = useState(false);
  const [microphonePermissionGranted, setMicrophonePermissionGranted] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [userSpeakingLevel, setUserSpeakingLevel] = useState(0);
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
  
  // Preamble state
  const [isPreamblePhase, setIsPreamblePhase] = useState(true);
  const [preambleComplete, setPreambleComplete] = useState(false);
  const [showTurkishPreamble, setShowTurkishPreamble] = useState(true);

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
      console.error('Missing required data for interview initialization:', {
        sessionId: projectContext?.sessionId,
        projectId: projectContext?.projectId,
        hasDiscussionGuide: !!projectContext?.discussionGuide
      });
      setAudioError('Görüşme verisi eksik - session veya proje bilgileri bulunamadı');
      return;
    }

    try {
      console.log('🎯 Initializing interview questions...', {
        sessionId: projectContext.sessionId,
        projectId: projectContext.projectId,
        discussionGuide: projectContext.discussionGuide
      });
      
      await interviewService.initializeQuestions(
        projectContext.projectId,
        projectContext.sessionId,
        projectContext.discussionGuide
      );
      setQuestionsInitialized(true);
      
      // Don't get the first question yet - wait for preamble to complete
      console.log('✅ Questions initialized successfully. Starting with preamble...');
      
      toast({
        title: "Görüşme Başlıyor",
        description: "Karşılama ve tanıtım ile başlıyoruz...",
      });
    } catch (error) {
      console.error('❌ Failed to initialize questions:', error);
      const errorMessage = error instanceof Error ? error.message : 'Bilinmeyen hata';
      setAudioError(`Görüşme soruları başlatılamadı: ${errorMessage}`);
      toast({
        title: "Hata",
        description: "Görüşme soruları başlatılamadı. Lütfen sayfayı yenileyin.",
        variant: "destructive",
      });
    }
  };

  // Function to transition from preamble to questions
  const startActualQuestions = useCallback(async () => {
    console.log('Transitioning from preamble to questions...');
    setIsPreamblePhase(false);
    setPreambleComplete(true);
    
    // Now get the first actual question
    await getNextQuestion();
    
    toast({
      title: "Sorulara Geçiliyor",
      description: "Şimdi yapılandırılmış görüşme sorularına başlıyoruz.",
    });
  }, []);

  const getNextQuestion = useCallback(async () => {
    if (!projectContext?.sessionId) {
      console.error('❌ Cannot get next question: Missing sessionId');
      return;
    }

    try {
      console.log('🎯 Getting next question for session:', projectContext.sessionId);
      const data = await interviewService.getNextQuestion(projectContext.sessionId);
      
      console.log('📝 Next question data:', data);
      setCurrentQuestion(data.nextQuestion);
      setInterviewProgress(data.progress);
      setIsQuestionComplete(false);
      setCurrentResponse('');
      setIsWaitingForAnswer(false);

      if (data.progress.isComplete) {
        console.log('🎉 Interview completed! Starting analysis...');
        toast({
          title: "Görüşme Tamamlandı!",
          description: "Tüm sorular yanıtlandı. Analiz başlatılıyor...",
        });
        // Trigger analysis
        if (projectContext.projectId) {
          setTimeout(async () => {
            try {
              await interviewService.analyzeInterview(projectContext.sessionId!, projectContext.projectId!);
              toast({
                title: "Analiz Tamamlandı",
                description: "Görüşme yanıtları başarıyla analiz edildi!",
              });
            } catch (error) {
              console.error('Failed to analyze interview:', error);
              toast({
                title: "Analiz Hatası",
                description: "Görüşme yanıtları analiz edilemedi",
                variant: "destructive",
              });
            }
          }, 2000);
        }
      }
    } catch (error) {
      console.error('❌ Failed to get next question:', error);
      const errorMessage = error instanceof Error ? error.message : 'Bilinmeyen hata';
      setAudioError(`Sonraki soru alınamadı: ${errorMessage}`);
      toast({
        title: "Hata",
        description: "Sonraki soru alınamadı. Görüşme devam edemiyor.",
        variant: "destructive",
      });
    }
  }, [projectContext]); // Remove analyzeInterview dependency

  const analyzeInterview = async () => {
    if (!projectContext?.sessionId || !projectContext?.projectId) return;

    try {
      await interviewService.analyzeInterview(projectContext.sessionId, projectContext.projectId);
      toast({
        title: "Analiz Tamamlandı",
        description: "Görüşme yanıtları başarıyla analiz edildi!",
      });
    } catch (error) {
      console.error('Failed to analyze interview:', error);
      toast({
        title: "Analiz Hatası",
        description: "Görüşme yanıtları analiz edilemedi",
        variant: "destructive",
      });
    }
  };

  const saveResponse = useCallback(async (transcription: string, isComplete: boolean = false) => {
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
  }, [projectContext, currentQuestion]);

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
          // Create AudioContext first
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
          
          // Initialize AudioQueue
          audioQueueRef.current = new AudioQueue(audioContextRef.current);
          
          // Check microphone permissions
          try {
            const permissionStatus = await navigator.permissions.query({ name: 'microphone' as PermissionName });
            setMicrophonePermissionGranted(permissionStatus.state === 'granted');
          } catch (error) {
            console.log('Permission query not supported, will request on first use');
          }
          
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
          console.log('🔗 Connected to Searcho AI');
          setIsConnected(true);
          setAudioError(null); // Clear any previous errors
          
          // Only initialize audio recording if microphone is enabled
          if (audioContextRef.current && !audioRecorderRef.current && microphoneEnabled) {
            try {
              audioRecorderRef.current = new AudioRecorder((audioData: Float32Array) => {
                // Calculate speaking level for visualization
                let sum = 0;
                for (let i = 0; i < audioData.length; i++) {
                  sum += Math.abs(audioData[i]);
                }
                const avgLevel = sum / audioData.length;
                setUserSpeakingLevel(avgLevel * 100);
                
                if (wsRef.current?.readyState === WebSocket.OPEN && !isMuted) {
                  // Send audio to WebSocket
                  const encodedAudio = btoa(String.fromCharCode(...new Uint8Array(audioData.buffer)));
                  wsRef.current.send(JSON.stringify({
                    type: 'input_audio_buffer.append',
                    audio: encodedAudio
                  }));
                }
              });

              await audioRecorderRef.current.start();
              audioStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
              console.log('Audio recording started');
            } catch (error) {
              console.error('Error starting audio recording:', error);
              setAudioError('Mikrofon başlatılamadı');
            }
          }
        };

        wsRef.current.onmessage = (event) => {
          const data = JSON.parse(event.data);
          handleSearchoMessage(data);
        };

        wsRef.current.onerror = (error) => {
          console.error('❌ WebSocket error:', error);
          setIsConnected(false);
          setAudioError('Bağlantı hatası - AI servisi ile iletişim kurulamadı');
        };

        wsRef.current.onclose = () => {
          console.log('❌ Disconnected from Searcho AI');
          setIsConnected(false);
          if (isActive) {
            setAudioError('Bağlantı kesildi - AI servisi ile iletişim kayboldu');
          }
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
  }, [isActive, isMuted, microphoneEnabled]);

  const toggleMicrophone = async () => {
    if (microphoneEnabled) {
      // Turn off microphone
      if (audioRecorderRef.current) {
        audioRecorderRef.current.stop();
        audioRecorderRef.current = null;
      }
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(track => track.stop());
        audioStreamRef.current = null;
      }
      setMicrophoneEnabled(false);
      setUserSpeakingLevel(0);
    } else {
      // Turn on microphone
      try {
        // Request permission first
        await navigator.mediaDevices.getUserMedia({ audio: true });
        setMicrophonePermissionGranted(true);
        setMicrophoneEnabled(true);
        // Audio recording will be initialized in the WebSocket useEffect
      } catch (error) {
        console.error('Microphone permission denied:', error);
        setMicrophonePermissionGranted(false);
        setAudioError('Mikrofon izni reddedildi');
      }
    }
  };

  const handleSearchoMessage = useCallback(async (data: any) => {
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
          const config = {
            event_id: "configure_session",
            type: "session.update",
            session: {
              modalities: ["text", "audio"],
              instructions: `You are SEARCHO, a professional UX research interviewer conducting a structured interview.

QUESTION PHASE INSTRUCTIONS:
- You are now in the structured question phase of the interview
- Ask the questions provided systematically and wait for complete responses
- Follow up naturally to get deeper insights
- Keep responses focused and relevant to UX research
- Use the save_response function after getting a complete answer to each question
- Move through questions at an appropriate pace

Current question context: ${currentQuestion?.question_text || 'No current question'}`,
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
              tools: [
                {
                  type: "function", 
                  name: "save_response",
                  description: "Save the participant's response to the current question. Call this after getting a complete answer.",
                  parameters: {
                    type: "object",
                    properties: {
                      response: { type: "string", description: "The participant's complete response" },
                      isComplete: { type: "boolean", description: "Whether this completes the current question" }
                    },
                    required: ["response", "isComplete"]
                  }
                }
              ],
              tool_choice: "auto",
              temperature: 0.8,
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
        const errorMessage = data.error?.message || data.message || 'API error occurred';
        console.log('Setting audio error to:', errorMessage);
        setAudioError(errorMessage);
        break;
      case 'response.function_call_arguments.done':
        console.log('Function call completed:', data);
        const functionName = data.name;
        
        if (functionName === 'save_response') {
          const args = JSON.parse(data.arguments);
          console.log('Saving response:', args);
          await saveResponse(args.response, args.isComplete);
        } else if (functionName === 'start_questions') {
          console.log('Starting structured questions phase');
          await startActualQuestions();
        }
        break;
      default:
        console.log('Unhandled message type:', data.type);
    }
  }, [isPreamblePhase, currentQuestion, projectContext]); // Add dependencies

  const toggleMute = () => {
    console.log('🔇 Mute button clicked - Current state:', { isMuted, wsConnected: wsRef.current?.readyState === WebSocket.OPEN });
    const newMutedState = !isMuted;
    setIsMuted(newMutedState);
    
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      if (newMutedState) {
        // Clear audio buffer when muting
        wsRef.current.send(JSON.stringify({
          type: 'input_audio_buffer.clear'
        }));
        console.log('🔇 Audio buffer cleared due to mute');
      }
      console.log('🔇 Mute state changed via WebSocket:', newMutedState ? 'muted' : 'unmuted');
    } else {
      console.warn('🔇 WebSocket not available for mute command');
    }
    
    console.log(`🔇 Audio ${newMutedState ? 'muted' : 'unmuted'}`);
  };

  const getSessionDuration = () => {
    if (!sessionStartTime) return '00:00';
    const duration = Math.floor((currentTime.getTime() - sessionStartTime.getTime()) / 1000);
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  if (!isActive) return null;

  // Show Turkish preamble if in preamble phase
  if (showTurkishPreamble && isPreamblePhase) {
    return (
      <TurkishPreambleDisplay 
        projectContext={projectContext}
        onComplete={startActualQuestions}
        onSkip={startActualQuestions}
      />
    );
  }

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-surface to-canvas overflow-hidden">
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
      <div className="flex-1 flex flex-col items-center justify-start pt-8 px-6 min-h-0">
        {/* Error Display */}
        {audioError && (
          <div className="absolute top-8 left-1/2 transform -translate-x-1/2 bg-red-500/20 backdrop-blur-md border border-red-400/50 rounded-lg px-4 py-2 text-red-200 text-sm z-10 cursor-pointer"
               onClick={() => setAudioError(null)}>
            Audio Error: {audioError}
            <span className="ml-2 text-xs opacity-75">(click to dismiss)</span>
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
                    (isPreamblePhase ? 
                      'Starting with welcome and introduction...' : 
                      (isListening ? 'Listening...' : 'Ready for questions')
                    ) : 
                    'Connecting...'
                  }
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Question Display - Only show during question phase */}
        {!isPreamblePhase && currentQuestion && (
          <div className="w-full max-w-2xl mb-6">
            <div className="bg-blue-500/10 backdrop-blur-sm rounded-lg p-4 border border-blue-400/30">
              <div className="text-sm font-medium text-blue-300 mb-2">Current Question</div>
              <div className="text-white text-base">
                {currentQuestion.question_text}
              </div>
            </div>
          </div>
        )}

        {/* Preamble Phase Indicator */}
        {isPreamblePhase && (
          <div className="w-full max-w-2xl mb-6">
            <div className="bg-green-500/10 backdrop-blur-sm rounded-lg p-4 border border-green-400/30 text-center">
              <div className="text-sm font-medium text-green-300 mb-2">Welcome Phase</div>
              <div className="text-white/80 text-sm">
                SEARCHO will start with a warm welcome and introduction before moving to structured questions
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Controls Bar - Fixed position and always visible */}
      <div className="bg-white/5 backdrop-blur-sm border-t border-white/10 p-4 mt-auto">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          {/* Session Timer */}
          <div className="flex items-center space-x-4">
            <div className="text-white/80 text-sm">
              <span className="font-medium">{getSessionDuration()}</span>
            </div>
          </div>

          {/* Voice Wave Visualizer - Replace with Enhanced Voice Indicator */}
          <div className="flex-1 flex justify-center px-4 sm:px-8">
            <EnhancedVoiceIndicator 
              isListening={isListening}
              isSpeaking={isSpeaking}
              userSpeakingLevel={userSpeakingLevel}
              microphoneEnabled={microphoneEnabled}
              className="opacity-90"
            />
          </div>

          {/* Audio/Video Controls - Enhanced for better accessibility */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            {/* Microphone Toggle */}
            <Button
              variant="outline"
              size="lg"
              onClick={toggleMicrophone}
              className={`
                ${microphoneEnabled 
                  ? 'bg-green-500/30 border-green-400 text-green-300 hover:bg-green-500/40' 
                  : 'bg-red-500/30 border-red-400 text-red-300 hover:bg-red-500/40'
                }
                min-w-[90px] h-12 font-medium transition-all duration-200 z-50
                focus:ring-2 focus:ring-brand-primary/50 focus:ring-offset-2 focus:ring-offset-transparent
                border-2
              `}
            >
              {microphoneEnabled ? <Mic className="w-4 h-4 mr-2" /> : <MicOff className="w-4 h-4 mr-2" />}
              {microphoneEnabled ? 'Mikrofon Aç' : 'Mikrofon Kapat'}
            </Button>
            
            {/* Mute Toggle - Only show if microphone is enabled */}
            {microphoneEnabled && (
              <Button
                variant="outline"
                size="lg"
                onClick={toggleMute}
                disabled={!microphoneEnabled}
                className={`
                  ${isMuted 
                    ? 'bg-orange-500/30 border-orange-400 text-orange-300 hover:bg-orange-500/40' 
                    : 'bg-surface border-border-light text-text-primary hover:bg-surface-hover'
                  }
                  min-w-[90px] h-12 font-medium transition-all duration-200 z-50
                  focus:ring-2 focus:ring-brand-primary/50 focus:ring-offset-2 focus:ring-offset-transparent
                  border-2
                `}
              >
                {isMuted ? <MicOff className="w-4 h-4 mr-2" /> : <Mic className="w-4 h-4 mr-2" />}
                {isMuted ? 'Sesi Aç' : 'Sustur'}
              </Button>
            )}
            
            {/* End Session Button */}
            <Button
              variant="destructive"
              size="lg"
              onClick={() => onSessionEnd?.()}
              className="min-w-[100px] h-12 font-medium bg-red-600 hover:bg-red-700 text-white border-red-500 border-2 transition-all duration-200"
            >
              <PhoneOff className="w-4 h-4 mr-2" />
              Görüşme Bitir
            </Button>
          </div>
        </div>

        {/* Permission/Error Messages */}
        {(!microphonePermissionGranted || audioError) && (
          <div className="mt-4 p-3 bg-red-500/20 border border-red-400/50 rounded-lg text-center">
            <p className="text-red-300 text-sm">
              {audioError || 'Mikrofon izni gerekli. Lütfen tarayıcınızdan mikrofon erişimine izin verin.'}
            </p>
            {!microphonePermissionGranted && !audioError && (
              <Button
                variant="outline"
                size="sm"
                onClick={toggleMicrophone}
                className="mt-2 text-red-300 border-red-400 hover:bg-red-500/20"
              >
                Mikrofon İzni Ver
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Debug Info - Development only */}
      {process.env.NODE_ENV === 'development' && (
        <div className="absolute bottom-4 right-4 bg-black/80 text-white p-3 rounded-lg text-xs font-mono space-y-1 max-w-xs">
          <div>Connected: {isConnected ? '✅' : '❌'}</div>
          <div>Listening: {isListening ? '✅' : '❌'}</div>
          <div>Speaking: {isSpeaking ? '✅' : '❌'}</div>
          <div>Muted: {isMuted ? '✅' : '❌'}</div>
          <div>Mic Enabled: {microphoneEnabled ? '✅' : '❌'}</div>
          <div>Speaking Level: {Math.round(userSpeakingLevel)}</div>
          <div>Preamble: {isPreamblePhase ? '✅' : '❌'}</div>
          <div>Questions Init: {questionsInitialized ? '✅' : '❌'}</div>
          <div>Question: {currentQuestion?.id?.substring(0, 8) || 'None'}</div>
          <div>Progress: {interviewProgress.completed}/{interviewProgress.total}</div>
        </div>
      )}
    </div>
  );
};

export default SearchoAI;