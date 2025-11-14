import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const useAchievements = () => {
  const checkAchievements = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/check-achievements`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const result = await response.json();

      if (result.newAchievements && result.newAchievements.length > 0) {
        result.newAchievements.forEach((achievement: any) => {
          toast.success(`Achievement Unlocked: ${achievement.name}`, {
            description: achievement.description,
            duration: 5000,
          });
        });
      }
    } catch (error) {
      console.error('Error checking achievements:', error);
    }
  };

  useEffect(() => {
    // Check achievements on mount
    checkAchievements();
  }, []);

  return { checkAchievements };
};
