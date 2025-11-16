import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Flame, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface StreakData {
  current_streak: number;
  longest_streak: number;
  last_study_date: string;
}

export const StudyStreakWidget = () => {
  const [streakData, setStreakData] = useState<StreakData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStreakData();
  }, []);

  const loadStreakData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('study_streaks')
      .select('*')
      .eq('user_id', user.id)
      .single();

    setStreakData(data);
    setLoading(false);
  };

  if (loading) return null;

  const isActiveToday = streakData?.last_study_date === new Date().toISOString().split('T')[0];

  return (
    <Card className="bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-950 dark:to-red-950">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Flame className={`w-5 h-5 ${isActiveToday ? 'text-orange-500' : 'text-muted-foreground'}`} />
          Study Streak
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-4xl font-bold text-orange-600 dark:text-orange-400">
              {streakData?.current_streak || 0}
            </div>
            <div className="text-sm text-muted-foreground">days in a row</div>
          </div>
          <div className="text-right">
            <Badge variant="secondary" className="mb-2">
              <Trophy className="w-3 h-3 mr-1" />
              Best: {streakData?.longest_streak || 0} days
            </Badge>
            {!isActiveToday && (
              <div className="text-xs text-orange-600 dark:text-orange-400 font-medium">
                Study today to continue!
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
