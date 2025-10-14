import React, { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Mic, MicOff, Volume2, VolumeX, PhoneOff, Play, Pause, SkipForward } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { AudioRecorder, AudioQueue } from '@/utils/AudioRecorder';
import { interviewService, InterviewQuestion, InterviewProgress } from '@/services/interviewService';
import TurkishPreambleDisplay from './TurkishPreambleDisplay';
import MinimalVoiceWaves from './ui/minimal-voice-waves';
import { AvatarSpeaker } from './AvatarSpeaker';
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
const SearchoAI = ({
  isActive,
  projectContext,
  onSessionEnd
}: SearchoAIProps) => {
  const {
    toast
  } = useToast();
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
  const [interviewProgress, setInterviewProgress] = useState<InterviewProgress>({
    completed: 0,
    total: 0,
    isComplete: false,
    percentage: 0
  });
  const [currentResponse, setCurrentResponse] = useState<string>('');
  const [isQuestionComplete, setIsQuestionComplete] = useState(false);
  const [questionsInitialized, setQuestionsInitialized] = useState(false);
  const [isWaitingForAnswer, setIsWaitingForAnswer] = useState(false);
  const [userTranscript, setUserTranscript] = useState<string>('');
  const [isTranscribing, setIsTranscribing] = useState(false);

  // Preamble state
  const [isPreamblePhase, setIsPreamblePhase] = useState(true);
  const [preambleComplete, setPreambleComplete] = useState(false);
  const [showTurkishPreamble, setShowTurkishPreamble] = useState(true);

  // Visual sentence state
  const [sentences, setSentences] = useState<string[]>([]);
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const [isRecordingVideo, setIsRecordingVideo] = useState(false);
  const videoRecorderRef = useRef<MediaRecorder | null>(null);
  const videoChunksRef = useRef<Blob[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioRecorderRef = useRef<AudioRecorder | null>(null);
  const audioQueueRef = useRef<any | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);

  // Initialize questions when session starts
  useEffect(() => {
    if (isActive && projectContext?.sessionId && projectContext?.projectId && projectContext?.discussionGuide && !questionsInitialized) {
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
      await interviewService.initializeQuestions(projectContext.projectId, projectContext.sessionId, projectContext.discussionGuide);
      setQuestionsInitialized(true);

      // Don't get the first question yet - wait for preamble to complete
      console.log('✅ Questions initialized successfully. Starting with preamble...');
      toast({
        title: "Görüşme Başlıyor",
        description: "Karşılama ve tanıtım ile başlıyoruz..."
      });
    } catch (error) {
      console.error('❌ Failed to initialize questions:', error);
      const errorMessage = error instanceof Error ? error.message : 'Bilinmeyen hata';
      setAudioError(`Görüşme soruları başlatılamadı: ${errorMessage}`);
      toast({
        title: "Hata",
        description: "Görüşme soruları başlatılamadı. Lütfen sayfayı yenileyin.",
        variant: "destructive"
      });
    }
  };

  // Video recording functions
  const startVideoRecording = useCallback(async (videoStream: MediaStream) => {
    if (!videoStream) return;
    try {
      const mediaRecorder = new MediaRecorder(videoStream, {
        mimeType: 'video/webm;codecs=vp8,opus',
        videoBitsPerSecond: 2500000
      });
      videoChunksRef.current = [];
      mediaRecorder.ondataavailable = event => {
        if (event.data.size > 0) {
          videoChunksRef.current.push(event.data);
        }
      };
      mediaRecorder.start(1000);
      videoRecorderRef.current = mediaRecorder;
      setIsRecordingVideo(true);
      console.log('📹 Video recording started');
    } catch (error) {
      console.error('Failed to start video recording:', error);
    }
  }, []);
  const stopVideoRecording = useCallback((): Promise<Blob | null> => {
    return new Promise(resolve => {
      if (!videoRecorderRef.current || videoRecorderRef.current.state === 'inactive') {
        resolve(null);
        return;
      }
      videoRecorderRef.current.onstop = () => {
        const videoBlob = new Blob(videoChunksRef.current, {
          type: 'video/webm'
        });
        console.log('📹 Video recording stopped, size:', videoBlob.size);
        setIsRecordingVideo(false);
        resolve(videoBlob);
      };
      videoRecorderRef.current.stop();
    });
  }, []);
  const uploadVideo = useCallback(async (videoBlob: Blob, sessionId: string, questionId: string): Promise<{
    url: string;
    duration: number;
  } | null> => {
    try {
      const fileName = `${sessionId}/${questionId}_${Date.now()}.webm`;
      const {
        data,
        error
      } = await supabase.storage.from('interview-videos').upload(fileName, videoBlob, {
        contentType: 'video/webm',
        upsert: false
      });
      if (error) throw error;
      const {
        data: {
          publicUrl
        }
      } = supabase.storage.from('interview-videos').getPublicUrl(fileName);

      // Calculate video duration (approximate based on size)
      const duration = Math.floor(videoBlob.size / 2500000 * 8000);
      console.log('✅ Video uploaded:', publicUrl);
      return {
        url: publicUrl,
        duration
      };
    } catch (error) {
      console.error('Failed to upload video:', error);
      return null;
    }
  }, []);

  // Function to transition from preamble to questions
  const startActualQuestions = useCallback(async () => {
    console.log('Transitioning from preamble to questions...');
    setIsPreamblePhase(false);
    setPreambleComplete(true);
    setShowTurkishPreamble(false); // Hide preamble display

    // Now get the first actual question
    await getNextQuestion();
    toast({
      title: "Sorulara Geçiliyor",
      description: "Şimdi yapılandırılmış görüşme sorularına başlıyoruz."
    });
  }, []);
  const getNextQuestion = useCallback(async () => {
    if (!projectContext?.sessionId) {
      console.error('❌ Cannot get next question: Missing sessionId');
      return;
    }
    
    // Clear transcript state when moving to next question
    setUserTranscript('');
    setCurrentResponse('');
    setIsTranscribing(false);
    
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

        // Stop any ongoing video recording
        if (isRecordingVideo) {
          await stopVideoRecording();
        }
        toast({
          title: "Görüşme Tamamlandı!",
          description: "Tüm sorular yanıtlandı. Analiz başlatılıyor..."
        });
        // Trigger analysis
        if (projectContext.projectId) {
          setTimeout(async () => {
            try {
              await interviewService.analyzeInterview(projectContext.sessionId!, projectContext.projectId!);
              toast({
                title: "Analiz Tamamlandı",
                description: "Görüşme yanıtları başarıyla analiz edildi!"
              });
            } catch (error) {
              console.error('Failed to analyze interview:', error);
              toast({
                title: "Analiz Hatası",
                description: "Görüşme yanıtları analiz edilemedi",
                variant: "destructive"
              });
            }
          }, 2000);
        }
      } else if (data.nextQuestion) {
        // Start video recording for new question
        if (audioStreamRef.current) {
          await startVideoRecording(audioStreamRef.current);
        }
      }
    } catch (error) {
      console.error('❌ Failed to get next question:', error);
      const errorMessage = error instanceof Error ? error.message : 'Bilinmeyen hata';
      setAudioError(`Sonraki soru alınamadı: ${errorMessage}`);
      toast({
        title: "Hata",
        description: "Sonraki soru alınamadı. Görüşme devam edemiyor.",
        variant: "destructive"
      });
    }
  }, [projectContext, isRecordingVideo, stopVideoRecording, startVideoRecording]);
  const analyzeInterview = async () => {
    if (!projectContext?.sessionId || !projectContext?.projectId) return;
    try {
      await interviewService.analyzeInterview(projectContext.sessionId, projectContext.projectId);
      toast({
        title: "Analiz Tamamlandı",
        description: "Görüşme yanıtları başarıyla analiz edildi!"
      });
    } catch (error) {
      console.error('Failed to analyze interview:', error);
      toast({
        title: "Analiz Hatası",
        description: "Görüşme yanıtları analiz edilemedi",
        variant: "destructive"
      });
    }
  };
  const saveResponse = useCallback(async (transcription: string, isComplete: boolean = false) => {
    if (!projectContext?.sessionId || !currentQuestion) return;
    try {
      let videoUrl = null;
      let videoDuration = null;

      // If question is complete, stop video recording and upload
      if (isComplete && isRecordingVideo) {
        const videoBlob = await stopVideoRecording();
        if (videoBlob && projectContext.sessionId) {
          const uploadResult = await uploadVideo(videoBlob, projectContext.sessionId, currentQuestion.id);
          if (uploadResult) {
            videoUrl = uploadResult.url;
            videoDuration = uploadResult.duration;
          }
        }
      }
      await interviewService.saveResponse(projectContext.sessionId, {
        questionId: currentQuestion.id,
        participantId: projectContext.participantId,
        transcription,
        responseText: transcription,
        isComplete,
        videoUrl,
        videoDuration,
        metadata: {
          timestamp: new Date().toISOString(),
          questionText: currentQuestion.question_text
        }
      });
      if (isComplete) {
        setIsQuestionComplete(true);
        setTimeout(() => {
          getNextQuestion();
        }, 2000);
      }
    } catch (error) {
      console.error('Failed to save response:', error);
    }
  }, [projectContext, currentQuestion, isRecordingVideo, getNextQuestion, stopVideoRecording, uploadVideo]);

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
          audioContextRef.current = new AudioContext({
            sampleRate: 24000
          });

          // Add click handler to resume AudioContext on user interaction
          const resumeAudioContext = async () => {
            if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
              await audioContextRef.current.resume();
              console.log('AudioContext resumed on user interaction');
            }
          };
          document.addEventListener('click', resumeAudioContext, {
            once: true
          });
          document.addEventListener('touchstart', resumeAudioContext, {
            once: true
          });
          if (audioContextRef.current.state === 'suspended') {
            await audioContextRef.current.resume();
            console.log('AudioContext resumed');
          }

          // Initialize AudioQueue
          audioQueueRef.current = new AudioQueue(audioContextRef.current);

          // Check microphone permissions
          try {
            const permissionStatus = await navigator.permissions.query({
              name: 'microphone' as PermissionName
            });
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
              audioStreamRef.current = await navigator.mediaDevices.getUserMedia({
                audio: true
              });
              console.log('Audio recording started');
            } catch (error) {
              console.error('Error starting audio recording:', error);
              setAudioError('Mikrofon başlatılamadı');
            }
          }
        };
        wsRef.current.onmessage = event => {
          const data = JSON.parse(event.data);
          handleSearchoMessage(data);
        };
        wsRef.current.onerror = error => {
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
        await navigator.mediaDevices.getUserMedia({
          audio: true
        });
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
        setIsTranscribing(true);
        setUserTranscript(''); // Clear previous transcript
        break;
      case 'input_audio_buffer.speech_stopped':
        console.log('Speech stopped detected');
        setIsListening(false);
        // Don't save here - wait for transcription to complete
        break;
      case 'conversation.item.input_audio_transcription.completed':
        console.log('User transcription completed:', data.transcript);
        const transcript = data.transcript || '';
        setCurrentResponse(transcript);
        setUserTranscript(transcript);
        setIsTranscribing(false);
        
        // NOW save the response with the completed transcription
        if (transcript.trim()) {
          await saveResponse(transcript, false);
        }
        break;
      case 'conversation.item.input_audio_transcription.delta':
        console.log('Transcription delta:', data.delta);
        setUserTranscript(prev => prev + (data.delta || ''));
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
              tools: [{
                type: "function",
                name: "save_response",
                description: "Save the participant's response to the current question. Call this after getting a complete answer.",
                parameters: {
                  type: "object",
                  properties: {
                    response: {
                      type: "string",
                      description: "The participant's complete response"
                    },
                    isComplete: {
                      type: "boolean",
                      description: "Whether this completes the current question"
                    }
                  },
                  required: ["response", "isComplete"]
                }
              }],
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
    console.log('🔇 Mute button clicked - Current state:', {
      isMuted,
      wsConnected: wsRef.current?.readyState === WebSocket.OPEN
    });
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

  // Split text into sentences
  const splitIntoSentences = (text: string): string[] => {
    return text.split(/([.!?]+\s+)/).reduce((acc, curr, i, arr) => {
      if (i % 2 === 0 && curr.trim()) {
        acc.push(curr + (arr[i + 1] || '').trim());
      }
      return acc;
    }, [] as string[]).filter(s => s.length > 0);
  };

  // Initialize sentences when question changes
  useEffect(() => {
    if (!currentQuestion?.question_text || isPreamblePhase) {
      setSentences([]);
      return;
    }
    const splitSentences = splitIntoSentences(currentQuestion.question_text);
    setSentences(splitSentences);
    setCurrentSentenceIndex(0);
    setIsAutoPlaying(true);
  }, [currentQuestion?.question_text, isPreamblePhase]);

  // Auto-advance through sentences
  useEffect(() => {
    if (!isAutoPlaying || sentences.length === 0) return;
    const interval = setInterval(() => {
      setCurrentSentenceIndex(prev => {
        if (prev < sentences.length - 1) {
          return prev + 1;
        } else {
          setIsAutoPlaying(false);
          return prev;
        }
      });
    }, 3000); // 3 seconds per sentence

    return () => clearInterval(interval);
  }, [sentences, isAutoPlaying]);
  const togglePlayPause = () => {
    setIsAutoPlaying(prev => !prev);
  };
  const skipSentence = () => {
    if (currentSentenceIndex < sentences.length - 1) {
      setCurrentSentenceIndex(prev => prev + 1);
    } else {
      setIsAutoPlaying(false);
    }
  };
  if (!isActive) return null;

  // Show Turkish preamble if in preamble phase
  if (showTurkishPreamble && isPreamblePhase) {
    return <TurkishPreambleDisplay projectContext={projectContext} onComplete={startActualQuestions} onSkip={startActualQuestions} />;
  }
  return <div className="h-full flex flex-col bg-background">
      {showTurkishPreamble && isPreamblePhase && <TurkishPreambleDisplay projectContext={projectContext} onComplete={startActualQuestions} onSkip={startActualQuestions} />}

      {!showTurkishPreamble && <>
          {/* Main Content Area */}
          <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
            {isInitializing ? <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                <p className="text-muted-foreground">Görüşme başlatılıyor...</p>
              </div> : <div className="w-full max-w-4xl space-y-8">
                {/* Progress Indicator */}
                <div className="text-center">
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-muted text-sm">
                    <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                    Soru {interviewProgress.completed + 1} / {interviewProgress.total}
                  </div>
                </div>

                {/* Current Question Card */}
                {currentQuestion && !isPreamblePhase && <div className="space-y-6">
                    {/* Avatar Display */}
                    <div className="flex justify-center">
                      <AvatarSpeaker questionText={currentQuestion.question_text} onSpeakingStart={() => {
                setIsSpeaking(true);
                setIsWaitingForAnswer(false);
              }} onSpeakingComplete={() => {
                setIsSpeaking(false);
                setIsWaitingForAnswer(true);
                // Start video recording when avatar finishes speaking
                if (audioStreamRef.current) {
                  startVideoRecording(audioStreamRef.current);
                }
              }} />
                    </div>

                    {/* Progress Bar */}
                    <div className="bg-card rounded-xl p-6 shadow border">
                      <div className="mb-4">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm font-semibold text-primary uppercase tracking-wide">
                            Soru {interviewProgress.completed + 1} / {interviewProgress.total}
                          </span>
                          <span className="text-sm font-medium text-muted-foreground">
                            {Math.round(interviewProgress.percentage)}% Tamamlandı
                          </span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-primary transition-all duration-500 ease-out" style={{
                    width: `${interviewProgress.percentage}%`
                  }} />
                        </div>
                      </div>
                      
                      {/* Question Section Badge */}
                      {currentQuestion.section && <span className="inline-block px-3 py-1 text-xs font-medium text-primary bg-primary/10 rounded-full">
                          {currentQuestion.section}
                        </span>}
                      
                      {/* Question Text */}
                      <div className="space-y-2">
                        <h3 className="text-xl font-semibold text-foreground leading-relaxed">
                          {currentQuestion.question_text}
                        </h3>
                        
                        {/* Visual Controls & Progress */}
                        {sentences.length > 0 && <div className="flex items-center gap-3 pt-2">
                            <div className="flex items-center gap-2">
                              <Button onClick={togglePlayPause} variant="outline" size="sm" className="gap-2">
                                {isAutoPlaying ? <>
                                    <Pause className="h-3 w-3" />
                                    Duraklat
                                  </> : <>
                                    <Play className="h-3 w-3" />
                                    Devam Et
                                  </>}
                              </Button>
                              
                              {sentences.length > 1 && <Button onClick={skipSentence} variant="ghost" size="sm" className="gap-2" disabled={currentSentenceIndex >= sentences.length - 1}>
                                  <SkipForward className="h-3 w-3" />
                                  İleri
                                </Button>}
                            </div>
                            
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>
                                Cümle {currentSentenceIndex + 1} / {sentences.length}
                              </span>
                            </div>
                          </div>}
                      </div>
                      
                      {isWaitingForAnswer && (
                        isTranscribing ? (
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                            <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
                              {userTranscript || 'Dinleniyor...'}
                            </p>
                          </div>
                        ) : userTranscript ? (
                          <p className="text-sm font-medium text-green-600 dark:text-green-400">
                            "{userTranscript}"
                          </p>
                        ) : (
                          <p className="text-sm text-muted-foreground italic">
                            Lütfen yanıtınızı sesli olarak verin...
                          </p>
                        )
                      )}
                    </div>
                  </div>}

                {/* AI Transcript */}
                {aiTranscript && <div className="bg-muted/50 rounded-xl p-6 border border-border/50">
                    <p className="text-foreground leading-relaxed text-center">
                      {aiTranscript}
                    </p>
                  </div>}


                {/* Audio Waveform Visualizer */}
                <div className="flex flex-col items-center gap-4 py-8">
                  <MinimalVoiceWaves isListening={isListening} audioStream={audioStreamRef.current} userSpeakingLevel={userSpeakingLevel} className="max-w-2xl" />
                  
                </div>

                {/* Error Message */}
                {audioError}
              </div>}
          </div>

          {/* Footer Controls Bar */}
          <div className="border-t border-border bg-card/50 backdrop-blur-sm">
            <div className="max-w-4xl mx-auto px-6 py-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Button onClick={toggleMicrophone} variant={microphoneEnabled ? "default" : "outline"} size="lg" className="gap-2" disabled={!isConnected}>
                  {microphoneEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
                </Button>

                <Button onClick={toggleMute} variant={isMuted ? "outline" : "secondary"} size="lg" className="gap-2">
                  {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                </Button>
              </div>

              <div className="text-sm text-muted-foreground font-mono">
                {getSessionDuration()}
              </div>

              <Button onClick={() => onSessionEnd?.()} variant="destructive" size="lg" className="gap-2">
                <PhoneOff className="h-5 w-5" />
                Oturumu Bitir
              </Button>
            </div>
          </div>

          {/* Debug Info */}
          {import.meta.env.DEV && <div className="bg-slate-900 text-white p-4 text-xs font-mono">
              <div>Connected: {isConnected ? '✅' : '❌'}</div>
              <div>Listening: {isListening ? '✅' : '❌'}</div>
              <div>Speaking: {isSpeaking ? '✅' : '❌'}</div>
              <div>Mic: {microphoneEnabled ? '✅' : '❌'}</div>
            </div>}
        </>}
    </div>;
};
export default SearchoAI;