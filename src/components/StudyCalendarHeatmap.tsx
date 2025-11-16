import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format, subDays } from "date-fns";

export const StudyCalendarHeatmap = () => {
  const [studyDates, setStudyDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStudyHistory();
  }, []);

  const loadStudyHistory = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const oneYearAgo = subDays(new Date(), 365).toISOString();
    const { data } = await supabase
      .from('flashcard_reviews')
      .select('reviewed_at')
      .eq('user_id', user.id)
      .gte('reviewed_at', oneYearAgo);

    const dates = data?.map(r => r.reviewed_at.split('T')[0]) || [];
    const uniqueDates = [...new Set(dates)];
    setStudyDates(uniqueDates);
    setLoading(false);
  };

  const getIntensity = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return studyDates.includes(dateStr) ? 'active' : 'inactive';
  };

  const generateCalendar = () => {
    const weeks = [];
    const today = new Date();
    
    for (let w = 51; w >= 0; w--) {
      const weekDays = [];
      for (let d = 0; d < 7; d++) {
        const date = subDays(today, w * 7 + (6 - d));
        weekDays.push(date);
      }
      weeks.push(weekDays);
    }
    return weeks;
  };

  if (loading) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Study Consistency</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-1 overflow-x-auto pb-2">
          {generateCalendar().map((week, weekIndex) => (
            <div key={weekIndex} className="flex flex-col gap-1">
              {week.map((date, dayIndex) => {
                const intensity = getIntensity(date);
                const dateStr = format(date, 'yyyy-MM-dd');
                const isToday = format(new Date(), 'yyyy-MM-dd') === dateStr;
                
                return (
                  <TooltipProvider key={dayIndex}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          className={`w-3 h-3 rounded-sm ${
                            intensity === 'active'
                              ? 'bg-green-500'
                              : 'bg-muted'
                          } ${isToday ? 'ring-2 ring-primary' : ''}`}
                        />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{format(date, 'MMM d, yyyy')}</p>
                        <p className="text-xs text-muted-foreground">
                          {intensity === 'active' ? 'Studied' : 'No activity'}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                );
              })}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
          <span>Less</span>
          <div className="flex gap-1">
            <div className="w-3 h-3 bg-muted rounded-sm" />
            <div className="w-3 h-3 bg-green-500 rounded-sm" />
          </div>
          <span>More</span>
        </div>
      </CardContent>
    </Card>
  );
};
