DO $$
DECLARE
  target_staff uuid := 'e0a0a993-7933-421f-aca7-1c0d7d4df943';
  target_org uuid := 'a1ca0000-0000-0000-0000-000000000001';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.staff WHERE id = target_staff AND organization_id = target_org) THEN
    RAISE EXCEPTION 'Hadassa organization verification failed';
  END IF;
  IF (SELECT count(*) FROM public.locations l JOIN public.practice_groups pg ON pg.id=l.group_id WHERE l.id IN ('0f073fbc-99b6-4648-93c8-2f2103f42ac8'::uuid,'6d4831b6-d46d-4e6e-a6a2-292847d89c4d'::uuid) AND pg.organization_id=target_org) <> 2 THEN
    RAISE EXCEPTION 'Location organization verification failed';
  END IF;
  INSERT INTO public.coach_scopes (staff_id,scope_type,scope_id)
  SELECT target_staff,'location',l.id
  FROM public.locations l
  WHERE l.id IN ('0f073fbc-99b6-4648-93c8-2f2103f42ac8'::uuid,'6d4831b6-d46d-4e6e-a6a2-292847d89c4d'::uuid)
    AND NOT EXISTS (SELECT 1 FROM public.coach_scopes c WHERE c.staff_id=target_staff AND c.scope_type='location' AND c.scope_id=l.id);
  IF (SELECT count(DISTINCT scope_id) FROM public.coach_scopes WHERE staff_id=target_staff AND scope_type='location' AND scope_id IN ('0f073fbc-99b6-4648-93c8-2f2103f42ac8'::uuid,'6d4831b6-d46d-4e6e-a6a2-292847d89c4d'::uuid)) <> 2 THEN
    RAISE EXCEPTION 'Both location connections must exist';
  END IF;
END $$;