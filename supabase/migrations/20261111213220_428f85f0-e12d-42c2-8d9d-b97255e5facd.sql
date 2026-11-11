DO $$
DECLARE
  target_ids uuid[] := ARRAY['106d021c-9c50-49ef-b032-e950377e40b8'::uuid, '357be0c4-bec4-438c-86c6-a9ebc797a5c0'::uuid];
BEGIN
  IF (SELECT count(*) FROM public.staff WHERE id = ANY(target_ids) AND organization_id = 'a1ca0000-0000-0000-0000-000000000001' AND role_id = 3 AND is_office_manager = true) <> 2 THEN
    RAISE EXCEPTION 'Expected both Michigan Office Managers in Alcan; no changes applied';
  END IF;
  IF (SELECT count(DISTINCT staff_id) FROM public.coach_scopes WHERE staff_id = ANY(target_ids) AND scope_type = 'org' AND scope_id = '63afe4ce-07a4-413a-820a-8be70a162809') <> 2 THEN
    RAISE EXCEPTION 'Expected existing Michigan scope for both staff; no changes applied';
  END IF;
  IF (SELECT count(*) FROM public.user_capabilities WHERE staff_id = ANY(target_ids)) <> 2 THEN
    RAISE EXCEPTION 'Expected existing capabilities for both staff; no changes applied';
  END IF;

  UPDATE public.staff
  SET is_coach = true, is_participant = true, home_route = '/coach', roles_updated_at = now(), updated_at = now()
  WHERE id = ANY(target_ids) AND organization_id = 'a1ca0000-0000-0000-0000-000000000001';

  UPDATE public.user_capabilities
  SET is_participant = true, can_view_submissions = true, can_submit_evals = true, can_review_evals = false, updated_at = now()
  WHERE staff_id = ANY(target_ids);

  IF (SELECT count(*) FROM public.staff s JOIN public.user_capabilities c ON c.staff_id = s.id
      WHERE s.id = ANY(target_ids) AND s.organization_id = 'a1ca0000-0000-0000-0000-000000000001'
        AND s.is_coach = true AND s.is_participant = true AND s.role_id = 3 AND s.is_office_manager = true
        AND s.home_route = '/coach' AND c.is_participant = true AND c.can_view_submissions = true
        AND c.can_submit_evals = true AND c.can_review_evals = false
        AND c.is_org_admin = false AND c.is_platform_admin = false) <> 2 THEN
    RAISE EXCEPTION 'Coach + Participant permission verification failed';
  END IF;
END $$;