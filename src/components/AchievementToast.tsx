import { Award } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface Achievement {
  name: string;
  description: string;
}

interface AchievementToastProps {
  achievement: Achievement;
}

export const AchievementToast = ({ achievement }: AchievementToastProps) => {
  return (
    <Card className="border-primary/50 bg-gradient-to-r from-primary/10 to-primary/5">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/20 rounded-full">
            <Award className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-sm">Achievement Unlocked!</p>
            <p className="text-sm text-foreground">{achievement.name}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{achievement.description}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
