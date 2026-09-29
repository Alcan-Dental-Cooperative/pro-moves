-- notify-eval-release embeds locations!evaluations_location_id_fkey(...) to
-- resolve org branding, but that foreign key was never created, so PostgREST
-- rejects the query (400) and "your evaluation is ready" emails never send.
-- Verified 2026-09-29: all evaluations.location_id values are non-null and
-- point at existing locations, so the constraint validates cleanly.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'evaluations_location_id_fkey'
      AND conrelid = 'public.evaluations'::regclass
  ) THEN
    ALTER TABLE public.evaluations
      ADD CONSTRAINT evaluations_location_id_fkey
      FOREIGN KEY (location_id) REFERENCES public.locations(id);
  END IF;
END $$;

-- Make PostgREST pick up the new relationship immediately.
NOTIFY pgrst, 'reload schema';
