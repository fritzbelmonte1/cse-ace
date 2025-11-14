import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ArrowLeft, Send, BookOpen, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ChatMessage } from "@/components/ChatMessage";
import { TypingIndicator } from "@/components/TypingIndicator";
import { ConversationSidebar } from "@/components/ConversationSidebar";

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: any[];
}

const AIAssistant = () => {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load or create conversation on mount
  useEffect(() => {
    const initConversation = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Try to get the most recent conversation
        const { data: conversations } = await supabase
          .from('chat_conversations')
          .select('id')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false })
          .limit(1);

        if (conversations && conversations.length > 0) {
          await loadConversation(conversations[0].id);
        } else {
          await createNewConversation();
        }
      } catch (error) {
        console.error('Error initializing conversation:', error);
      } finally {
        setIsLoadingHistory(false);
      }
    };

    initConversation();
  }, []);

  const loadConversation = async (convId: string) => {
    try {
      setConversationId(convId);
      setMessages([]);
      setIsLoadingHistory(true);

      // Load message history
      const { data: messageHistory } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('conversation_id', convId)
        .order('created_at', { ascending: true });

      if (messageHistory) {
        setMessages(messageHistory.map(msg => ({
          role: msg.role as "user" | "assistant",
          content: msg.content,
          sources: msg.sources ? (Array.isArray(msg.sources) ? msg.sources : []) : undefined
        })));
      }
    } catch (error) {
      console.error('Error loading conversation:', error);
      toast.error("Failed to load conversation");
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const createNewConversation = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: newConv } = await supabase
        .from('chat_conversations')
        .insert({ user_id: user.id, title: 'New Conversation' })
        .select()
        .single();

      if (newConv) {
        setConversationId(newConv.id);
        setMessages([]);
      }
    } catch (error) {
      console.error('Error creating conversation:', error);
      toast.error("Failed to create conversation");
    }
  };

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const saveMessage = async (role: "user" | "assistant", content: string, sources?: any[]) => {
    if (!conversationId) return;

    try {
      await supabase
        .from('chat_messages')
        .insert({
          conversation_id: conversationId,
          role,
          content,
          sources: sources || null
        });

      // Update conversation's updated_at
      await supabase
        .from('chat_conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', conversationId);

      // Check achievements after sending a message
      if (role === 'user') {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            fetch(
              `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/check-achievements`,
              {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${session.access_token}`,
                  'Content-Type': 'application/json',
                },
              }
            ).catch(err => console.error('Error checking achievements:', err));
          }
        } catch (error) {
          console.error('Error checking achievements:', error);
        }
      }
    } catch (error) {
      console.error('Error saving message:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!input.trim() || !conversationId) return;

    const userMessage = input.trim();
    setInput("");
    
    const newUserMessage = { role: "user" as const, content: userMessage };
    setMessages(prev => [...prev, newUserMessage]);
    setLoading(true);

    // Save user message
    await saveMessage("user", userMessage);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/rag-query`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ query: userMessage }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Query failed');
      }

      const assistantMessage = {
        role: "assistant" as const,
        content: result.answer,
        sources: result.sources
      };

      setMessages(prev => [...prev, assistantMessage]);
      
      // Save assistant message
      await saveMessage("assistant", result.answer, result.sources);
      
      toast.success("Answer received!");
    } catch (error: any) {
      console.error('Query error:', error);
      toast.error(error.message || "Failed to get answer");
      
      const errorMessage = {
        role: "assistant" as const,
        content: "Sorry, I encountered an error. Please try again."
      };
      
      setMessages(prev => [...prev, errorMessage]);
      await saveMessage("assistant", errorMessage.content);
    } finally {
      setLoading(false);
    }
  };

  if (isLoadingHistory) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-background via-background to-muted">
        <div className="text-center">
          <Sparkles className="h-8 w-8 animate-spin text-primary mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Loading conversation...</p>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <ConversationSidebar
          currentConversationId={conversationId}
          onConversationSelect={loadConversation}
          onNewConversation={createNewConversation}
        />

        <div className="flex flex-col flex-1 h-screen bg-gradient-to-br from-background via-background to-muted">
          {/* Header */}
          <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 shadow-sm">
            <div className="container mx-auto px-4 py-4 flex items-center gap-4">
              <SidebarTrigger />
              <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <BookOpen className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h1 className="font-bold text-xl">AI Study Assistant</h1>
                  <p className="text-xs text-muted-foreground">Ask questions about CSE materials</p>
                </div>
              </div>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 container max-w-4xl mx-auto px-4 py-6 overflow-hidden">
            <ScrollArea className="h-full pr-4" ref={scrollAreaRef}>
              {messages.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <Card className="max-w-md shadow-lg border-primary/20">
                    <CardHeader className="space-y-3">
                      <div className="mx-auto p-3 bg-primary/10 rounded-full w-fit">
                        <Sparkles className="h-6 w-6 text-primary" />
                      </div>
                      <CardTitle className="text-center">Welcome to AI Assistant!</CardTitle>
                      <CardDescription className="text-center">
                        Ask me anything about the Civil Service Exam materials. I'll search through the uploaded documents to help you.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3 text-sm">
                        <p className="font-medium text-muted-foreground">Example questions:</p>
                        <div className="space-y-2">
                          {[
                            "What are the main topics in vocabulary?",
                            "Explain analogy questions",
                            "How to prepare for numerical ability?"
                          ].map((example, i) => (
                            <div
                              key={i}
                              className="p-3 bg-muted rounded-lg hover:bg-muted/80 transition-colors cursor-pointer"
                              onClick={() => setInput(example)}
                            >
                              <p className="text-foreground">{example}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <div className="space-y-1 pb-4">
                  {messages.map((message, index) => (
                    <ChatMessage
                      key={index}
                      role={message.role}
                      content={message.content}
                      sources={message.sources}
                      isLatest={index === messages.length - 1}
                    />
                  ))}
                  {loading && <TypingIndicator />}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </ScrollArea>
          </div>

          {/* Input Area */}
          <div className="border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 shadow-lg">
            <div className="container max-w-4xl mx-auto px-4 py-4">
              <form onSubmit={handleSubmit} className="flex gap-3">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask a question about CSE materials..."
                  disabled={loading}
                  className="flex-1 h-12 text-base shadow-sm"
                />
                <Button 
                  type="submit" 
                  disabled={loading || !input.trim()}
                  size="lg"
                  className="px-6 shadow-sm"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </form>
              <p className="text-xs text-muted-foreground text-center mt-2">
                AI responses are based on uploaded study materials
              </p>
            </div>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default AIAssistant;
