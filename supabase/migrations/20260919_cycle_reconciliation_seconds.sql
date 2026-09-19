-- Persists exact seconds and replaces all derived rows for one owned cycle in
-- a single transaction. This function intentionally runs as the caller.
ALTER TABLE public.study_cycles
  ADD COLUMN IF NOT EXISTS current_item_progress_seconds integer NOT NULL DEFAULT 0;

ALTER TABLE public.study_cycle_sessions
  ADD COLUMN IF NOT EXISTS seconds_contributed integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extra_seconds integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.reconcile_study_cycle(
  p_cycle_id uuid,
  p_sessions jsonb,
  p_state jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.study_cycles
    WHERE id = p_cycle_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Ciclo não encontrado ou não pertence ao usuário';
  END IF;

  DELETE FROM public.study_cycle_sessions WHERE cycle_id = p_cycle_id;

  INSERT INTO public.study_cycle_sessions (
    cycle_id, cycle_item_id, study_history_id, discipline_id, round_number,
    seconds_contributed, extra_seconds, minutes_contributed, extra_minutes
  )
  SELECT
    p_cycle_id,
    row.cycle_item_id,
    row.study_history_id,
    row.discipline_id,
    row.round_number,
    row.seconds_contributed,
    row.extra_seconds,
    row.minutes_contributed,
    row.extra_minutes
  FROM jsonb_to_recordset(COALESCE(p_sessions, '[]'::jsonb)) AS row(
    cycle_id uuid,
    cycle_item_id uuid,
    study_history_id uuid,
    discipline_id uuid,
    round_number integer,
    seconds_contributed integer,
    extra_seconds integer,
    minutes_contributed integer,
    extra_minutes integer
  );

  UPDATE public.study_cycles
  SET
    current_item_index = COALESCE((p_state->>'current_item_index')::integer, 0),
    current_round = COALESCE((p_state->>'current_round')::integer, 1),
    total_rounds_done = COALESCE((p_state->>'total_rounds_done')::integer, 0),
    current_item_progress_seconds = COALESCE((p_state->>'current_item_progress_seconds')::integer, 0),
    current_item_progress_min = COALESCE((p_state->>'current_item_progress_min')::integer, 0),
    updated_at = timezone('utc', now())
  WHERE id = p_cycle_id AND user_id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.reconcile_study_cycle(uuid, jsonb, jsonb) TO authenticated;
