DROP POLICY IF EXISTS "Students insert own attendance" ON public.attendance_records;

CREATE POLICY "Professors insert attendance"
ON public.attendance_records
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'professor'::public.app_role
  )
);

CREATE POLICY "Students delete own pending reenroll"
ON public.reenroll_requests
FOR DELETE
TO authenticated
USING (
  (student_id = auth.uid() AND status = 'pending'::public.request_status)
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'professor'::public.app_role
  )
);