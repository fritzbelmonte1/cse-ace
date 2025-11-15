import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Mic, MicOff, Volume2, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { VoiceConversation } from '@/utils/VoiceConversation';

interface VoiceAssistantProps {
  conversationId?: string;
  onClose?: () => void;
}

type ConversationMode = 'idle' | 'connecting' | 'listening' | 'speaking' | 'thinking';

export const VoiceAssistant = ({ conversationId, onClose }: VoiceAssistantProps) => {
  const [mode, setMode] = useState<ConversationMode>('idle');
  const [transcript, setTranscript] = useState<string>('');
  const conversationRef = useRef<VoiceConversation | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    return () => {
      conversationRef.current?.endSession();
    };
  }, []);

  const startConversation = async () => {
    try {
      setMode('connecting');
      
      // Request microphone permission first
      await navigator.mediaDevices.getUserMedia({ audio: true });

      conversationRef.current = new VoiceConversation({
        onConnect: () => {
          console.log('Voice conversation connected');
          setMode('listening');
          toast({
            title: "Voice Assistant Ready",
            description: "You can start speaking now",
          });
        },
        onDisconnect: () => {
          console.log('Voice conversation disconnected');
          setMode('idle');
        },
        onMessage: (message) => {
          console.log('Message received:', message.type);
          
          if (message.type === 'user_transcript') {
            setTranscript(message.text || '');
            setMode('speaking');
          } else if (message.type === 'agent_response') {
            setMode('thinking');
          } else if (message.type === 'audio') {
            setMode('listening');
          }
        },
        onError: (error) => {
          console.error('Voice conversation error:', error);
          toast({
            title: "Connection Error",
            description: error.message,
            variant: "destructive",
          });
          setMode('idle');
        },
        onModeChange: (modeChange) => {
          if (modeChange.mode === 'listening') {
            setMode('listening');
          } else if (modeChange.mode === 'speaking') {
            setMode('speaking');
          }
        }
      });

      await conversationRef.current.startSession(conversationId);
    } catch (error) {
      console.error('Error starting conversation:', error);
      toast({
        title: "Failed to Start",
        description: error instanceof Error ? error.message : 'Could not access microphone',
        variant: "destructive",
      });
      setMode('idle');
    }
  };

  const endConversation = () => {
    conversationRef.current?.endSession();
    setMode('idle');
    setTranscript('');
    onClose?.();
  };

  const getModeDisplay = () => {
    switch (mode) {
      case 'connecting':
        return { icon: Loader2, text: 'Connecting...', color: 'text-muted-foreground' };
      case 'listening':
        return { icon: Mic, text: 'Listening...', color: 'text-green-500' };
      case 'speaking':
        return { icon: Volume2, text: 'You are speaking', color: 'text-blue-500' };
      case 'thinking':
        return { icon: Loader2, text: 'Assistant is thinking...', color: 'text-yellow-500' };
      default:
        return { icon: MicOff, text: 'Voice Assistant', color: 'text-muted-foreground' };
    }
  };

  const display = getModeDisplay();
  const Icon = display.icon;
  const isActive = mode !== 'idle';

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`${isActive && mode === 'listening' ? 'animate-pulse' : ''}`}>
            <Icon className={`h-6 w-6 ${display.color} ${mode === 'connecting' || mode === 'thinking' ? 'animate-spin' : ''}`} />
          </div>
          <div>
            <h3 className="font-semibold">Voice Assistant</h3>
            <p className={`text-sm ${display.color}`}>{display.text}</p>
          </div>
        </div>

        {!isActive ? (
          <Button onClick={startConversation} className="gap-2">
            <Mic className="h-4 w-4" />
            Start Voice Chat
          </Button>
        ) : (
          <Button onClick={endConversation} variant="destructive" className="gap-2">
            <MicOff className="h-4 w-4" />
            End Session
          </Button>
        )}
      </div>

      {transcript && (
        <div className="mt-4 p-4 bg-muted rounded-lg">
          <p className="text-sm text-muted-foreground mb-1">You said:</p>
          <p className="text-sm">{transcript}</p>
        </div>
      )}

      {isActive && (
        <div className="text-xs text-muted-foreground">
          <p>💡 Speak naturally and the AI assistant will respond with voice</p>
          <p>💡 The assistant can help with study questions, explanations, and practice</p>
        </div>
      )}
    </Card>
  );
};
