DO $$
DECLARE
  target_ids uuid[] := ARRAY['daa686f7-3603-40da-9bf0-c16b7921e374','7513e5d6-934c-4e74-86f5-a549757068c7','c74520db-33a3-4b49-bb4a-a156f31b537f']::uuid[];
  before_rows jsonb;
  after_rows jsonb;
  before_items jsonb;
  after_items jsonb;
  changed_count integer;
BEGIN
  PERFORM e.id FROM public.evaluations e WHERE e.id=ANY(target_ids) FOR UPDATE;
  IF (SELECT count(*) FROM public.evaluations e JOIN public.staff s ON s.id=e.staff_id JOIN public.locations l ON l.id=e.location_id JOIN public.practice_groups g ON g.id=l.group_id WHERE e.id=ANY(target_ids) AND e.evaluator_id='e2950c03-7e4c-41e4-b026-4cb54f6b9e35' AND e.location_id='e949aff6-d44e-4760-adf9-3a0b4045115f' AND g.name='Big Apple Pediatric Dentistry' AND g.organization_id='a1ca0000-0000-0000-0000-000000000001' AND s.organization_id=g.organization_id AND e.role_id=2 AND e.type='Quarterly' AND e.program_year=2026 AND e.quarter='Q4' AND e.status='submitted')<>3 THEN
    RAISE EXCEPTION 'Expected exactly three submitted Ariyana Big Apple RDA Q4 2026 evaluations';
  END IF;
  IF EXISTS (SELECT 1 FROM public.evaluations e JOIN public.evaluations other ON other.staff_id=e.staff_id AND other.program_year=e.program_year AND other.type=e.type AND other.quarter='Q3' AND other.id<>e.id WHERE e.id=ANY(target_ids)) THEN
    RAISE EXCEPTION 'A target staff member already has a Q3 evaluation';
  END IF;
  SELECT jsonb_agg(to_jsonb(e)-'quarter'-'updated_at' ORDER BY e.id) INTO before_rows FROM public.evaluations e WHERE e.id=ANY(target_ids);
  SELECT jsonb_agg(to_jsonb(i) ORDER BY to_jsonb(i)::text) INTO before_items FROM public.evaluation_items i WHERE i.evaluation_id=ANY(target_ids);
  UPDATE public.evaluations SET quarter='Q3' WHERE id=ANY(target_ids) AND quarter='Q4' AND program_year=2026;
  GET DIAGNOSTICS changed_count=ROW_COUNT;
  IF changed_count<>3 OR (SELECT count(*) FROM public.evaluations WHERE id=ANY(target_ids) AND quarter='Q3' AND program_year=2026)<>3 THEN
    RAISE EXCEPTION 'Quarter correction did not update all three evaluations';
  END IF;
  SELECT jsonb_agg(to_jsonb(e)-'quarter'-'updated_at' ORDER BY e.id) INTO after_rows FROM public.evaluations e WHERE e.id=ANY(target_ids);
  SELECT jsonb_agg(to_jsonb(i) ORDER BY to_jsonb(i)::text) INTO after_items FROM public.evaluation_items i WHERE i.evaluation_id=ANY(target_ids);
  IF before_rows IS DISTINCT FROM after_rows OR before_items IS DISTINCT FROM after_items THEN
    RAISE EXCEPTION 'Unexpected change to evaluation content or release metadata';
  END IF;
END $$;