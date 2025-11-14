import { 
  Award, Trophy, Medal, Crown, Star, Sparkles, Zap, 
  MessageSquare, MessageCircle, MessagesSquare, Send, 
  SendHorizonal, TrendingUp, Target, LucideIcon 
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Achievement {
  id: string;
  code: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  requirement_value: number;
}

interface AchievementBadgeProps {
  achievement: Achievement;
  earned?: boolean;
  earnedAt?: string;
  size?: "sm" | "md" | "lg";
  showDetails?: boolean;
}

const iconMap: Record<string, LucideIcon> = {
  Award, Trophy, Medal, Crown, Star, Sparkles, Zap,
  MessageSquare, MessageCircle, MessagesSquare, Send,
  SendHorizonal, TrendingUp, Target
};

const categoryColors = {
  practice: "from-blue-500/20 to-blue-600/20 border-blue-500/30",
  ai: "from-purple-500/20 to-purple-600/20 border-purple-500/30",
  performance: "from-amber-500/20 to-amber-600/20 border-amber-500/30",
};

const categoryIconColors = {
  practice: "text-blue-500",
  ai: "text-purple-500",
  performance: "text-amber-500",
};

export const AchievementBadge = ({ 
  achievement, 
  earned = false, 
  earnedAt,
  size = "md",
  showDetails = true
}: AchievementBadgeProps) => {
  const Icon = iconMap[achievement.icon] || Award;
  
  const sizeClasses = {
    sm: "h-16 w-16 p-3",
    md: "h-20 w-20 p-4",
    lg: "h-24 w-24 p-5"
  };

  const iconSizeClasses = {
    sm: "h-6 w-6",
    md: "h-8 w-8",
    lg: "h-10 w-10"
  };

  return (
    <div className={cn(
      "group relative flex flex-col items-center gap-2 transition-all",
      earned ? "cursor-pointer hover:scale-105" : "opacity-50"
    )}>
      {/* Badge Circle */}
      <div className={cn(
        "rounded-full border-2 bg-gradient-to-br backdrop-blur-sm transition-all",
        sizeClasses[size],
        earned 
          ? categoryColors[achievement.category as keyof typeof categoryColors]
          : "from-muted/20 to-muted/10 border-muted",
        earned && "shadow-lg group-hover:shadow-xl"
      )}>
        <Icon className={cn(
          "h-full w-full transition-colors",
          earned 
            ? categoryIconColors[achievement.category as keyof typeof categoryIconColors]
            : "text-muted-foreground"
        )} />
      </div>

      {/* Badge Info */}
      {showDetails && (
        <div className="text-center max-w-[120px]">
          <p className={cn(
            "font-semibold text-sm leading-tight",
            earned ? "text-foreground" : "text-muted-foreground"
          )}>
            {achievement.name}
          </p>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
            {achievement.description}
          </p>
          {earned && earnedAt && (
            <p className="text-xs text-muted-foreground mt-1">
              {new Date(earnedAt).toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric',
                year: 'numeric'
              })}
            </p>
          )}
        </div>
      )}

      {/* Locked Overlay */}
      {!earned && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="absolute inset-0 bg-background/30 backdrop-blur-[1px] rounded-full" />
        </div>
      )}

      {/* New Badge Indicator */}
      {earned && earnedAt && (
        <div className="absolute -top-1 -right-1">
          <div className="h-3 w-3 rounded-full bg-primary animate-pulse" />
        </div>
      )}
    </div>
  );
};
