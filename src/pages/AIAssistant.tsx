import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, Send, BookOpen, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ChatMessage } from "@/components/ChatMessage";
import { TypingIndicator } from "@/components/TypingIndicator";

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
          const convId = conversations[0].id;
          setConversationId(convId);

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
        } else {
          // Create new conversation
          const { data: newConv } = await supabase
            .from('chat_conversations')
            .insert({ user_id: user.id })
            .select()
            .single();

          if (newConv) {
            setConversationId(newConv.id);
          }
        }
      } catch (error) {
        console.error('Error initializing conversation:', error);
      } finally {
        setIsLoadingHistory(false);
      }
    };

    initConversation();
  }, []);

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
    <div className="flex flex-col h-screen bg-gradient-to-br from-background via-background to-muted">
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-primary" />
            <div>
              <h1 className="font-bold text-xl">AI Study Assistant</h1>
              <p className="text-sm text-muted-foreground">Ask questions about CSE materials</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 container max-w-4xl mx-auto px-4 py-6">
        <ScrollArea className="h-full pr-4">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <Card className="max-w-md">
                <CardHeader>
                  <CardTitle>Welcome to AI Assistant!</CardTitle>
                  <CardDescription>
                    Ask me anything about the Civil Service Exam materials. I'll search through the uploaded documents to help you.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <p>Example questions:</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>What are the main topics in vocabulary?</li>
                      <li>Explain analogy questions</li>
                      <li>How to prepare for numerical ability?</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="space-y-4 pb-4">
              {messages.map((message, index) => (
                <div key={index} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                  <Card className={`max-w-[80%] ${message.role === "user" ? "bg-primary text-primary-foreground" : ""}`}>
                    <CardContent className="p-4">
                      <p className="whitespace-pre-wrap">{message.content}</p>
                      {message.sources && message.sources.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-border/50">
                          <p className="text-sm font-medium mb-2">Sources:</p>
                          <div className="space-y-2">
                            {message.sources.map((source: any, idx: number) => (
                              <div key={idx} className="text-xs bg-muted/50 p-2 rounded">
                                <p className="font-medium">{source.document} - {source.module}</p>
                                <p className="text-muted-foreground mt-1">{source.text}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
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
  );
};

export default AIAssistant;