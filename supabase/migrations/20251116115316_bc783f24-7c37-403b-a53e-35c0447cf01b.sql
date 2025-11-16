-- Fix security: Add search path to update_study_streak function
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;