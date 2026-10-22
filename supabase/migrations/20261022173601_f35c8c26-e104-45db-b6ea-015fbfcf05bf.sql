DROP POLICY IF EXISTS "Coaches can upsert own templates" ON public.coaching_agenda_templates;
CREATE POLICY "Coaches can upsert own templates" ON public.coaching_agenda_templates
FOR INSERT TO authenticated
WITH CHECK (staff_id IN (
  SELECT s.id FROM public.staff s
  WHERE s.user_id = auth.uid()
    AND (s.is_clinical_director = true OR s.is_coach = true OR s.is_super_admin = true
         OR EXISTS (SELECT 1 FROM public.doctor_coach_assignments a WHERE a.coach_staff_id = s.id))
));