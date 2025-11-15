import { Card } from "@/components/ui/card";
import { Bot, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { VoicePlayer } from "./VoicePlayer";

interface Source {
  document: string;
  module: string;
  text: string;
}

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  isLatest?: boolean;
}

export const ChatMessage = ({ role, content, sources, isLatest }: ChatMessageProps) => {
  const isUser = role === "user";

  return (
    <div
      className={cn(
        "flex gap-3 mb-4 animate-in slide-in-from-bottom-2 fade-in duration-300",
        isUser ? "flex-row-reverse" : "flex-row"
      )}
    >
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-full",
          isUser ? "bg-primary text-primary-foreground" : "bg-muted"
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>

      <div className={cn("flex flex-col gap-2 max-w-[80%]", isUser && "items-end")}>
        <Card
          className={cn(
            "p-4 transition-all hover:shadow-md",
            isUser
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-card border-border"
          )}
        >
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{content}</p>

          {sources && sources.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border/50">
              <p className="text-xs font-semibold mb-2 opacity-80">Sources:</p>
              <div className="space-y-2">
                {sources.map((source, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      "text-xs p-2 rounded-md",
                      isUser ? "bg-primary-foreground/10" : "bg-muted/50"
                    )}
                  >
                    <p className="font-medium">
                      {source.document} - {source.module}
                    </p>
                    <p className="mt-1 opacity-70 line-clamp-2">{source.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground px-2">
            {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
          {!isUser && content && <VoicePlayer text={content} />}
        </div>
      </div>
    </div>
  );
};
