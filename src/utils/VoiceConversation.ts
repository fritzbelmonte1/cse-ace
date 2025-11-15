import { supabase } from "@/integrations/supabase/client";

interface ConversationConfig {
  first_message?: string;
  language?: string;
  max_duration_seconds?: number;
}

interface ConversationCallbacks {
  onConnect?: () => void;
  onDisconnect?: () => void;
  onMessage?: (message: any) => void;
  onError?: (error: Error) => void;
  onModeChange?: (mode: { mode: string }) => void;
}

export class VoiceConversation {
  private ws: WebSocket | null = null;
  private audio: HTMLAudioElement;
  private mediaRecorder: MediaRecorder | null = null;
  private audioContext: AudioContext | null = null;
  private isRecording = false;
  private callbacks: ConversationCallbacks;
  private voiceConversationId: string | null = null;
  private sessionStartTime: number | null = null;
  private userTranscriptBuffer: string = '';

  constructor(callbacks: ConversationCallbacks = {}) {
    this.callbacks = callbacks;
    this.audio = new Audio();
    this.audio.autoplay = true;
  }

  async startSession(conversationId?: string, context?: string) {
    try {
      console.log('[VoiceConversation] Starting session...');

      // Create voice conversation record in database
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: voiceConv } = await supabase
          .from('voice_conversations')
          .insert({
            user_id: user.id,
            title: 'Voice Chat Session',
            started_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (voiceConv) {
          this.voiceConversationId = voiceConv.id;
          this.sessionStartTime = Date.now();
        }
      }

      // Get signed URL from edge function
      const { data, error } = await supabase.functions.invoke('create-voice-session', {
        body: { conversationId, context }
      });

      if (error) throw error;

      if (!data?.signed_url) {
        throw new Error('No signed URL received');
      }

      console.log('[VoiceConversation] Got signed URL, connecting...');

      // Connect to ElevenLabs WebSocket
      this.ws = new WebSocket(data.signed_url);

      this.ws.onopen = async () => {
        console.log('[VoiceConversation] WebSocket connected');
        this.callbacks.onConnect?.();
        
        // Start recording user audio
        await this.startRecording();
      };

      this.ws.onmessage = async (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('[VoiceConversation] Message:', message.type);
          
          this.callbacks.onMessage?.(message);

          // Handle different message types
          if (message.type === 'audio') {
            this.playAudio(message.audio);
          } else if (message.type === 'interruption') {
            this.audio.pause();
            this.audio.currentTime = 0;
          } else if (message.type === 'agent_response') {
            // Agent finished speaking - save to database
            if (this.voiceConversationId && message.text) {
              await this.saveMessage('assistant', message.text);
            }
            this.callbacks.onModeChange?.({ mode: 'listening' });
          } else if (message.type === 'user_transcript') {
            // User is speaking
            this.userTranscriptBuffer = message.text || '';
            this.callbacks.onModeChange?.({ mode: 'speaking' });
          } else if (message.type === 'user_transcript_complete') {
            // User finished speaking - save to database
            if (this.voiceConversationId && message.text) {
              await this.saveMessage('user', message.text);
              this.userTranscriptBuffer = '';
            }
          }
        } catch (err) {
          console.error('[VoiceConversation] Error parsing message:', err);
        }
      };

      this.ws.onerror = (error) => {
        console.error('[VoiceConversation] WebSocket error:', error);
        this.callbacks.onError?.(new Error('WebSocket connection error'));
      };

      this.ws.onclose = async () => {
        console.log('[VoiceConversation] WebSocket closed');
        this.stopRecording();
        
        // Update conversation end time and duration
        if (this.voiceConversationId && this.sessionStartTime) {
          const duration = Math.floor((Date.now() - this.sessionStartTime) / 1000);
          await supabase
            .from('voice_conversations')
            .update({
              ended_at: new Date().toISOString(),
              duration_seconds: duration,
            })
            .eq('id', this.voiceConversationId);
        }
        
        this.callbacks.onDisconnect?.();
      };

    } catch (error) {
      console.error('[VoiceConversation] Error starting session:', error);
      this.callbacks.onError?.(error instanceof Error ? error : new Error('Failed to start session'));
      throw error;
    }
  }

  private async startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      this.audioContext = new AudioContext({ sampleRate: 16000 });
      const source = this.audioContext.createMediaStreamSource(stream);
      const processor = this.audioContext.createScriptProcessor(4096, 1, 1);

      processor.onaudioprocess = (e) => {
        if (this.ws?.readyState === WebSocket.OPEN && this.isRecording) {
          const inputData = e.inputBuffer.getChannelData(0);
          const pcmData = this.convertToPCM16(inputData);
          
          // Send audio to ElevenLabs
          this.ws.send(JSON.stringify({
            user_audio_chunk: Array.from(pcmData)
          }));
        }
      };

      source.connect(processor);
      processor.connect(this.audioContext.destination);

      this.isRecording = true;
      console.log('[VoiceConversation] Recording started');
    } catch (error) {
      console.error('[VoiceConversation] Error starting recording:', error);
      this.callbacks.onError?.(new Error('Could not access microphone'));
    }
  }

  private stopRecording() {
    this.isRecording = false;
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    console.log('[VoiceConversation] Recording stopped');
  }

  private convertToPCM16(float32Array: Float32Array): Int16Array {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return int16Array;
  }

  private playAudio(base64Audio: string) {
    try {
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: 'audio/mpeg' });
      const url = URL.createObjectURL(blob);
      
      this.audio.src = url;
      this.audio.play().catch(err => {
        console.error('[VoiceConversation] Audio play error:', err);
      });
    } catch (error) {
      console.error('[VoiceConversation] Error playing audio:', error);
    }
  }

  private async saveMessage(role: 'user' | 'assistant', content: string) {
    if (!this.voiceConversationId || !content.trim()) return;

    try {
      await supabase.from('voice_messages').insert({
        conversation_id: this.voiceConversationId,
        role,
        content: content.trim(),
        timestamp: new Date().toISOString(),
      });

      // Fetch current message count and increment
      const { data: conversation } = await supabase
        .from('voice_conversations')
        .select('message_count')
        .eq('id', this.voiceConversationId)
        .single();

      if (conversation) {
        await supabase
          .from('voice_conversations')
          .update({ message_count: (conversation.message_count || 0) + 1 })
          .eq('id', this.voiceConversationId);
      }
    } catch (error) {
      console.error('[VoiceConversation] Error saving message:', error);
    }
  }

  endSession() {
    console.log('[VoiceConversation] Ending session');
    this.stopRecording();
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    if (this.audio) {
      this.audio.pause();
      this.audio.src = '';
    }
  }
}
