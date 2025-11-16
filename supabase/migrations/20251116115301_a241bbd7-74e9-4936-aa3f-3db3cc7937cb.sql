-- Add study consistency tracking
CREATE TABLE IF NOT EXISTS study_streaks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  current_streak INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,
  last_study_date DATE,
  study_dates JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

-- RLS policies for study_streaks
ALTER TABLE study_streaks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own streaks"
  ON study_streaks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own streaks"
  ON study_streaks FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own streaks"
  ON study_streaks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Performance index
CREATE INDEX idx_flashcard_reviews_user_date 
  ON flashcard_reviews(user_id, reviewed_at DESC);

-- Function to update streak after each review
CREATE OR REPLACE FUNCTION update_study_streak()
RETURNS TRIGGER AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
  v_yesterday DATE := CURRENT_DATE - INTERVAL '1 day';
  v_last_study_date DATE;
  v_current_streak INTEGER;
  v_longest_streak INTEGER;
  v_study_dates JSONB;
BEGIN
  -- Get or create streak record
  SELECT last_study_date, current_streak, longest_streak, study_dates
  INTO v_last_study_date, v_current_streak, v_longest_streak, v_study_dates
  FROM study_streaks
  WHERE user_id = NEW.user_id;

  -- Initialize if no record exists
  IF NOT FOUND THEN
    INSERT INTO study_streaks (user_id, current_streak, longest_streak, last_study_date, study_dates)
    VALUES (NEW.user_id, 1, 1, v_today, jsonb_build_array(v_today));
    RETURN NEW;
  END IF;

  -- Only update once per day
  IF v_last_study_date = v_today THEN
    RETURN NEW;
  END IF;

  -- Calculate new streak
  IF v_last_study_date = v_yesterday THEN
    v_current_streak := v_current_streak + 1;
  ELSIF v_last_study_date < v_yesterday THEN
    v_current_streak := 1;
  END IF;

  -- Update longest streak
  IF v_current_streak > v_longest_streak THEN
    v_longest_streak := v_current_streak;
  END IF;

  -- Add today to study_dates (keep last 365 days)
  v_study_dates := v_study_dates || jsonb_build_array(v_today);
  IF jsonb_array_length(v_study_dates) > 365 THEN
    v_study_dates := v_study_dates - 0;
  END IF;

  -- Update streak record
  UPDATE study_streaks
  SET current_streak = v_current_streak,
      longest_streak = v_longest_streak,
      last_study_date = v_today,
      study_dates = v_study_dates,
      updated_at = now()
  WHERE user_id = NEW.user_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update streak after each flashcard review
CREATE TRIGGER update_streak_after_review
  AFTER INSERT ON flashcard_reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_study_streak();