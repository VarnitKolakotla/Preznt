-- 1. Restrict profile visibility
DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;
CREATE POLICY "Users view own profile; professors view all"
ON public.profiles FOR SELECT TO authenticated
USING (
  auth.uid() = id
  OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'professor')
);

-- 2. Replace has_role() calls in policies with inline role lookups
DROP POLICY IF EXISTS "Professors can create own sessions" ON public.prof_sessions;
CREATE POLICY "Professors can create own sessions"
ON public.prof_sessions FOR INSERT TO authenticated
WITH CHECK (
  professor_id = auth.uid()
  AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'professor')
);

DROP POLICY IF EXISTS "Students view own attendance" ON public.attendance_records;
CREATE POLICY "Students view own attendance"
ON public.attendance_records FOR SELECT TO authenticated
USING (
  student_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'professor')
);

DROP POLICY IF EXISTS "Students insert own attendance" ON public.attendance_records;
CREATE POLICY "Students insert own attendance"
ON public.attendance_records FOR INSERT TO authenticated
WITH CHECK (
  student_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'professor')
);

DROP POLICY IF EXISTS "Professors manage attendance updates" ON public.attendance_records;
CREATE POLICY "Professors manage attendance updates"
ON public.attendance_records FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'professor'))
WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'professor'));

DROP POLICY IF EXISTS "Professors manage attendance deletes" ON public.attendance_records;
CREATE POLICY "Professors manage attendance deletes"
ON public.attendance_records FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'professor'));

DROP POLICY IF EXISTS "Students view own late requests; professors view all" ON public.late_requests;
CREATE POLICY "Students view own late requests; professors view all"
ON public.late_requests FOR SELECT TO authenticated
USING (
  student_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'professor')
);

DROP POLICY IF EXISTS "Professors approve/deny late requests" ON public.late_requests;
CREATE POLICY "Professors approve/deny late requests"
ON public.late_requests FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'professor'))
WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'professor'));

DROP POLICY IF EXISTS "Students view own reenroll; professors view all" ON public.reenroll_requests;
CREATE POLICY "Students view own reenroll; professors view all"
ON public.reenroll_requests FOR SELECT TO authenticated
USING (
  student_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'professor')
);

DROP POLICY IF EXISTS "Professors approve/deny reenroll" ON public.reenroll_requests;
CREATE POLICY "Professors approve/deny reenroll"
ON public.reenroll_requests FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'professor'))
WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'professor'));

-- 3. Signed-in users can no longer execute the SECURITY DEFINER helper
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM authenticated, anon, public;