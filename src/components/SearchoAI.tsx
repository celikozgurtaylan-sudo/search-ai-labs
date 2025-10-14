import React, { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Mic, MicOff, Volume2, VolumeX, PhoneOff, SkipForward } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { AudioTranscriber } from '@/utils/AudioTranscriber';
import { interviewService, InterviewQuestion, InterviewProgress } from '@/services/interviewService';
import TurkishPreambleDisplay from './TurkishPreambleDisplay';
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
  const { toast } = useToast();
  
  // State management
  const [isListening, setIsListening] = useState(false);
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
  const [questionsInitialized, setQuestionsInitialized] = useState(false);
  const [isWaitingForAnswer, setIsWaitingForAnswer] = useState(false);
  const [userTranscript, setUserTranscript] = useState<string>('');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isReviewingTranscript, setIsReviewingTranscript] = useState(false);
  const [editableTranscript, setEditableTranscript] = useState('');

  // Preamble state
  const [isPreamblePhase, setIsPreamblePhase] = useState(true);
  const [showTurkishPreamble, setShowTurkishPreamble] = useState(true);

  // Video recording
  const [isRecordingVideo, setIsRecordingVideo] = useState(false);
  const videoRecorderRef = useRef<MediaRecorder | null>(null);
  const videoChunksRef = useRef<Blob[]>([]);
  const audioTranscriberRef = useRef<AudioTranscriber | null>(null);
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
      console.error('Missing required data');
      return;
    }
    try {
      console.log('🎯 Initializing interview questions...');
      await interviewService.initializeQuestions(projectContext.projectId, projectContext.sessionId, projectContext.discussionGuide);
      setQuestionsInitialized(true);
      console.log('✅ Questions initialized successfully');
      toast({
        title: "Görüşme Başlıyor",
        description: "Karşılama ve tanıtım ile başlıyoruz..."
      });
    } catch (error) {
      console.error('❌ Failed to initialize questions:', error);
      toast({
        title: "Hata",
        description: "Görüşme soruları başlatılamadı",
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
    setShowTurkishPreamble(false);
    await getNextQuestion();
    toast({
      title: "Sorulara Geçiliyor",
      description: "Şimdi yapılandırılmış görüşme sorularına başlıyoruz."
    });
  }, []);
  const getNextQuestion = useCallback(async () => {
    if (!projectContext?.sessionId) return;
    
    setUserTranscript('');
    setIsTranscribing(false);
    
    try {
      console.log('🎯 Getting next question...');
      const data = await interviewService.getNextQuestion(projectContext.sessionId);
      setCurrentQuestion(data.nextQuestion);
      setInterviewProgress(data.progress);
      setIsWaitingForAnswer(false);
      
      if (data.progress.isComplete) {
        console.log('🎉 Interview completed!');
        if (isRecordingVideo) {
          await stopVideoRecording();
        }
        toast({
          title: "Görüşme Tamamlandı!",
          description: "Tüm sorular yanıtlandı"
        });
        
        if (projectContext.projectId) {
          setTimeout(async () => {
            try {
              await interviewService.analyzeInterview(projectContext.sessionId!, projectContext.projectId!);
              toast({
                title: "Analiz Tamamlandı"
              });
            } catch (error) {
              console.error('Analysis failed:', error);
            }
          }, 2000);
        }
      } else if (data.nextQuestion && audioStreamRef.current) {
        await startVideoRecording(audioStreamRef.current);
      }
    } catch (error) {
      console.error('❌ Failed to get next question:', error);
      toast({
        title: "Hata",
        description: "Sonraki soru alınamadı",
        variant: "destructive"
      });
    }
  }, [projectContext, isRecordingVideo, stopVideoRecording, startVideoRecording]);
  const saveResponse = useCallback(async (transcription: string) => {
    if (!projectContext?.sessionId || !currentQuestion) {
      throw new Error('Session or question not available');
    }
    
    try {
      console.log('💾 saveResponse called for question:', currentQuestion.id);
      let videoUrl = null;
      let videoDuration = null;

      if (isRecordingVideo) {
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
        isComplete: true,
        videoUrl,
        videoDuration,
        metadata: {
          timestamp: new Date().toISOString(),
          questionText: currentQuestion.question_text
        }
      });
      
      console.log('✅ Response saved to database');
    } catch (error) {
      console.error('❌ Failed to save response:', error);
      throw error; // Re-throw so caller knows it failed
    }
  }, [projectContext, currentQuestion, isRecordingVideo, stopVideoRecording, uploadVideo]);

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

  // Start listening for user response
  const startListening = async () => {
    if (audioTranscriberRef.current) {
      audioTranscriberRef.current.stop();
    }

    setUserTranscript('');
    setIsTranscribing(true);
    setIsListening(true);

    // Start video recording if we have a stream
    if (audioStreamRef.current) {
      await startVideoRecording(audioStreamRef.current);
    }

    const transcriber = new AudioTranscriber();
    
    transcriber.onTranscriptionUpdate = (text: string) => {
      setUserTranscript(text);
    };

    transcriber.onComplete = async (finalText: string) => {
      console.log('Transcription complete:', finalText);
      setUserTranscript(finalText);
      setEditableTranscript(finalText);
      setIsTranscribing(false);
      setIsListening(false);
      setIsWaitingForAnswer(false);
      setIsReviewingTranscript(true);
      // Don't auto-save - wait for user confirmation
    };

    transcriber.onError = (error: string) => {
      console.error('Transcription error:', error);
      setIsTranscribing(false);
      setIsListening(false);
      toast({
        title: "Hata",
        description: "Ses kaydı başarısız",
        variant: "destructive"
      });
    };

    audioTranscriberRef.current = transcriber;
    await transcriber.start();
  };

  const toggleMicrophone = () => {
    if (isListening) {
      setIsListening(false);
      if (audioTranscriberRef.current) {
        audioTranscriberRef.current.stop();
        audioTranscriberRef.current = null;
      }
    } else {
      startListening();
    }
  };

  // Confirm and save the edited transcription
  const confirmAndSaveResponse = async () => {
    if (!editableTranscript.trim()) {
      toast({
        title: "Hata",
        description: "Yanıt boş olamaz",
        variant: "destructive"
      });
      return;
    }

    try {
      console.log('💾 Saving response:', editableTranscript.substring(0, 50) + '...');
      setIsReviewingTranscript(false);
      
      // Save the response and wait for it to complete
      await saveResponse(editableTranscript);
      console.log('✅ Response saved successfully');
      
      // Clear the transcripts
      setUserTranscript('');
      setEditableTranscript('');
      
      // Wait a moment before getting next question
      await new Promise(resolve => setTimeout(resolve, 500));
      
      console.log('📥 Fetching next question...');
      await getNextQuestion();
      console.log('✅ Next question loaded');
      
    } catch (error) {
      console.error('❌ Error in confirmAndSaveResponse:', error);
      // Reset review state so user can try again
      setIsReviewingTranscript(true);
      toast({
        title: "Hata",
        description: "Yanıt kaydedilemedi. Lütfen tekrar deneyin.",
        variant: "destructive"
      });
    }
  };

  // Re-record the answer
  const reRecordAnswer = () => {
    setIsReviewingTranscript(false);
    setUserTranscript('');
    setEditableTranscript('');
    setIsWaitingForAnswer(true);
    // User can click microphone button to start again
  };

  // Skip the current question
  const skipQuestion = async () => {
    try {
      setIsReviewingTranscript(false);
      setUserTranscript('');
      setEditableTranscript('');
      
      toast({
        title: "Soru Atlandı",
        description: "Sonraki soruya geçiliyor..."
      });
      
      // Move to next question without saving
      setTimeout(async () => {
        await getNextQuestion();
      }, 500);
    } catch (error) {
      console.error('Error skipping question:', error);
    }
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
    return <TurkishPreambleDisplay projectContext={projectContext} onComplete={startActualQuestions} onSkip={startActualQuestions} />;
  }
  return <div className="h-full flex flex-col bg-background">
      {showTurkishPreamble && isPreamblePhase && <TurkishPreambleDisplay projectContext={projectContext} onComplete={startActualQuestions} onSkip={startActualQuestions} />}

      {!showTurkishPreamble && <>
          {/* Main Content Area */}
          <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
            <div className="w-full max-w-4xl space-y-8">
                {/* Progress Indicator */}
                <div className="text-center">
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-muted text-sm">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    Soru {interviewProgress.completed + 1} / {interviewProgress.total}
                  </div>
                </div>

                {/* Current Question Card */}
                {currentQuestion && !isPreamblePhase && <div className="space-y-6">
                    {/* Avatar Display */}
                    <div className="flex justify-center">
                      <AvatarSpeaker 
                        questionText={currentQuestion.question_text} 
                        onSpeakingStart={() => {
                          setIsWaitingForAnswer(false);
                        }} 
                        onSpeakingComplete={async () => {
                          setIsWaitingForAnswer(true);
                          // Get audio stream for video recording
                          if (!audioStreamRef.current) {
                            try {
                              audioStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
                            } catch (error) {
                              console.error('Failed to get audio stream:', error);
                            }
                          }
                          // Automatically start listening after avatar finishes
                          await startListening();
                        }} 
                      />
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
                      </div>
                      
                      {/* Live Recording Section - Always Visible */}
                      <div className="mt-6 min-h-[120px]">
                        {isTranscribing ? (
                          <div className="bg-gradient-to-r from-red-50 to-pink-50 dark:from-red-950/30 dark:to-pink-950/30 rounded-2xl p-6 border-2 border-red-300 dark:border-red-700 shadow-lg">
                            <div className="flex items-center gap-3 mb-3">
                              <div className="relative">
                                <div className="w-4 h-4 bg-red-500 rounded-full animate-pulse"></div>
                                <div className="absolute inset-0 w-4 h-4 bg-red-500 rounded-full animate-ping"></div>
                              </div>
                              <span className="text-sm font-bold text-red-700 dark:text-red-300 uppercase tracking-wide">
                                🎙️ KAYIT YAPILIYOR
                              </span>
                            </div>
                            <div className="bg-white/80 dark:bg-black/40 rounded-xl p-4 min-h-[60px]">
                              <p className="text-lg font-medium text-gray-900 dark:text-gray-100 leading-relaxed">
                                {userTranscript || 'Konuşmanız yazıya dönüştürülüyor...'}
                              </p>
                            </div>
                          </div>
                        ) : isReviewingTranscript ? (
                          <div className="bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-950/30 dark:to-amber-950/30 rounded-2xl p-6 border-2 border-yellow-400 dark:border-yellow-600 shadow-lg">
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-sm font-bold text-yellow-800 dark:text-yellow-300 uppercase tracking-wide">
                                ✏️ YANITI KONTROL EDİN
                              </span>
                              <span className="text-xs text-yellow-700 dark:text-yellow-400">
                                Düzenleyebilir veya kaydedebilirsiniz
                              </span>
                            </div>
                            
                            {/* Editable Textarea */}
                            <Textarea
                              value={editableTranscript}
                              onChange={(e) => setEditableTranscript(e.target.value)}
                              className="w-full min-h-[100px] text-lg font-medium leading-relaxed resize-none"
                              placeholder="Yanıtınızı buraya yazın..."
                            />
                            
                            {/* Action Buttons */}
                            <div className="flex gap-3 mt-4">
                              <Button
                                onClick={confirmAndSaveResponse}
                                className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                                size="lg"
                              >
                                ✓ Onayla ve Kaydet
                              </Button>
                              <Button
                                onClick={reRecordAnswer}
                                variant="outline"
                                size="lg"
                              >
                                🎙️ Tekrar Kaydet
                              </Button>
                              <Button
                                onClick={skipQuestion}
                                variant="outline"
                                size="lg"
                              >
                                ⏭️ Atla
                              </Button>
                            </div>
                          </div>
                        ) : userTranscript ? (
                          <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 rounded-2xl p-6 border-2 border-green-300 dark:border-green-700 shadow-lg">
                            <div className="flex items-center gap-2 mb-3">
                              <span className="text-sm font-bold text-green-700 dark:text-green-300 uppercase tracking-wide">
                                ✓ YANIT ALINDI
                              </span>
                            </div>
                            <div className="bg-white/80 dark:bg-black/40 rounded-xl p-4">
                              <p className="text-lg font-medium text-gray-900 dark:text-gray-100 leading-relaxed">
                                "{userTranscript}"
                              </p>
                            </div>
                          </div>
                        ) : isWaitingForAnswer ? (
                          <div className="bg-gradient-to-r from-gray-50 to-slate-50 dark:from-gray-900/30 dark:to-slate-900/30 rounded-2xl p-6 border-2 border-dashed border-gray-300 dark:border-gray-700">
                            <div className="flex flex-col items-center justify-center gap-3 min-h-[80px]">
                              <Mic className="h-8 w-8 text-gray-400 dark:text-gray-600 animate-pulse" />
                              <p className="text-base text-gray-600 dark:text-gray-400 font-medium text-center">
                                Lütfen yanıtınızı sesli olarak verin...
                              </p>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>}

              </div>
          </div>

          {/* Footer Controls Bar */}
          <div className="border-t border-border bg-card/50 backdrop-blur-sm">
            <div className="max-w-4xl mx-auto px-6 py-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Button 
                  onClick={toggleMicrophone} 
                  variant={isListening ? "default" : "outline"} 
                  size="lg" 
                  className={`gap-2 ${isListening ? 'ring-2 ring-green-500 ring-offset-2' : ''}`}
                  disabled={isReviewingTranscript}
                >
                  {isListening ? (
                    <>
                      <Mic className="h-5 w-5" />
                      <span className="hidden sm:inline">Kaydediliyor</span>
                    </>
                  ) : (
                    <>
                      <MicOff className="h-5 w-5" />
                      <span className="hidden sm:inline">Mikrofon</span>
                    </>
                  )}
                </Button>
                
                {/* Skip Question Button - Always available when there's a question */}
                {currentQuestion && (
                  <Button 
                    onClick={skipQuestion} 
                    variant="ghost" 
                    size="lg" 
                    className="gap-2 text-muted-foreground hover:text-foreground"
                  >
                    <SkipForward className="h-5 w-5" />
                    <span className="hidden sm:inline">Soruyu Atla</span>
                  </Button>
                )}
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
              <div>Listening: {isListening ? '✅' : '❌'}</div>
              <div>Transcribing: {isTranscribing ? '✅' : '❌'}</div>
            </div>}
        </>}
    </div>;
};
export default SearchoAI;