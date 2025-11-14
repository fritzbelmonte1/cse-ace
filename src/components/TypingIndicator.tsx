import { Card } from "@/components/ui/card";
import { Bot } from "lucide-react";
import { cn } from "@/lib/utils";

export const TypingIndicator = () => {
  return (
    <div className="flex gap-3 mb-4 animate-in slide-in-from-bottom-2 fade-in duration-300">
      <div className="flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-full bg-muted">
        <Bot className="h-4 w-4" />
      </div>

      <Card className="p-4 bg-card border-border">
        <div className="flex items-center gap-1">
          <div className="flex gap-1">
            <div
              className={cn(
                "h-2 w-2 rounded-full bg-muted-foreground/60",
                "animate-bounce [animation-delay:-0.3s]"
              )}
            />
            <div
              className={cn(
                "h-2 w-2 rounded-full bg-muted-foreground/60",
                "animate-bounce [animation-delay:-0.15s]"
              )}
            />
            <div className="h-2 w-2 rounded-full bg-muted-foreground/60 animate-bounce" />
          </div>
          <span className="ml-2 text-sm text-muted-foreground">AI is thinking...</span>
        </div>
      </Card>
    </div>
  );
};
