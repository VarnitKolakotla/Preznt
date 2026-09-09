
-- ================================================================
-- Enums
-- ================================================================
CREATE TYPE public.app_role AS ENUM ('student', 'professor');
CREATE TYPE public.attendance_status AS ENUM ('Present', 'Late');
CREATE TYPE public.attendance_method AS ENUM ('face', 'qr', 'manual');
CREATE TYPE public.request_status AS ENUM ('pending', 'approved', 'denied');

-- ================================================================
-- Utility: updated_at trigger
-- ================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ================================================================
-- profiles
-- ================================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  id_number TEXT NOT NULL,
  subjects TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Any authenticated user can read profiles (name display, etc.)
CREATE POLICY "Authenticated users can view profiles"
  ON public.profiles FOR SELECT TO authenticated USING (true);

-- Users can update only their own profile
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- ================================================================
-- user_roles
-- ================================================================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Users can see their own roles
CREATE POLICY "Users can view own roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Security-definer helper for policies elsewhere (avoids recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  );
$$;

-- ================================================================
-- Signup: restrict to @gcet.edu.in and provision role on email verify
-- ================================================================

-- Block signups from other email domains at insert time
CREATE OR REPLACE FUNCTION public.enforce_college_domain()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email IS NULL OR lower(split_part(NEW.email, '@', 2)) <> 'gcet.edu.in' THEN
    RAISE EXCEPTION 'Only @gcet.edu.in college emails can sign up.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_enforce_domain
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.enforce_college_domain();

-- After email confirmation, create profile + role from signup metadata.
-- Metadata expected: full_name, id_number, role (student|professor), subjects (jsonb array)
CREATE OR REPLACE FUNCTION public.provision_verified_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _role public.app_role;
  _subjects TEXT[];
BEGIN
  IF NEW.email_confirmed_at IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only run when confirmation just happened, or on INSERT of an already-confirmed user
  IF TG_OP = 'UPDATE' AND OLD.email_confirmed_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Domain guard (defence in depth)
  IF lower(split_part(NEW.email, '@', 2)) <> 'gcet.edu.in' THEN
    RETURN NEW;
  END IF;

  _role := COALESCE(NULLIF(NEW.raw_user_meta_data->>'role', ''), 'student')::public.app_role;

  SELECT COALESCE(array_agg(value::text), '{}')
    INTO _subjects
    FROM jsonb_array_elements_text(
      COALESCE(NEW.raw_user_meta_data->'subjects', '[]'::jsonb)
    ) AS value;

  INSERT INTO public.profiles (id, name, email, id_number, subjects)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'id_number', ''),
    _subjects
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, _role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_provision
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.provision_verified_user();

CREATE TRIGGER on_auth_user_confirmed_provision
  AFTER UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW
  WHEN (OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL)
  EXECUTE FUNCTION public.provision_verified_user();

-- ================================================================
-- prof_sessions
-- ================================================================
CREATE TABLE public.prof_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  professor_name TEXT NOT NULL,
  subject TEXT NOT NULL,
  class_time TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  late_deadline TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prof_sessions TO authenticated;
GRANT ALL ON public.prof_sessions TO service_role;
ALTER TABLE public.prof_sessions ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER prof_sessions_set_updated_at BEFORE UPDATE ON public.prof_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Any signed-in user can view sessions (students need this)
CREATE POLICY "Authenticated can view sessions"
  ON public.prof_sessions FOR SELECT TO authenticated USING (true);

-- Only professors can create sessions, only for themselves
CREATE POLICY "Professors can create own sessions"
  ON public.prof_sessions FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'professor') AND professor_id = auth.uid()
  );

-- Only the owning professor can update/end their session
CREATE POLICY "Professors can update own sessions"
  ON public.prof_sessions FOR UPDATE TO authenticated
  USING (professor_id = auth.uid())
  WITH CHECK (professor_id = auth.uid());

CREATE POLICY "Professors can delete own sessions"
  ON public.prof_sessions FOR DELETE TO authenticated
  USING (professor_id = auth.uid());

-- ================================================================
-- attendance_records
-- ================================================================
CREATE TABLE public.attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES public.prof_sessions(id) ON DELETE SET NULL,
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  student_name TEXT NOT NULL,
  student_id_number TEXT NOT NULL,
  subject TEXT NOT NULL,
  status public.attendance_status NOT NULL,
  confidence NUMERIC NOT NULL DEFAULT 0,
  method public.attendance_method NOT NULL DEFAULT 'face',
  marked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  date DATE NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_records TO authenticated;
GRANT ALL ON public.attendance_records TO service_role;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

CREATE INDEX attendance_records_student_date_idx
  ON public.attendance_records (student_id, date);

-- Students can view own records; professors can view all
CREATE POLICY "Students view own attendance"
  ON public.attendance_records FOR SELECT TO authenticated
  USING (student_id = auth.uid() OR public.has_role(auth.uid(), 'professor'));

-- Students insert their own record; professor also may (for manual mark)
CREATE POLICY "Students insert own attendance"
  ON public.attendance_records FOR INSERT TO authenticated
  WITH CHECK (student_id = auth.uid() OR public.has_role(auth.uid(), 'professor'));

-- Only professors can update/delete
CREATE POLICY "Professors manage attendance updates"
  ON public.attendance_records FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'professor'))
  WITH CHECK (public.has_role(auth.uid(), 'professor'));

CREATE POLICY "Professors manage attendance deletes"
  ON public.attendance_records FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'professor'));

-- ================================================================
-- late_requests
-- ================================================================
CREATE TABLE public.late_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.prof_sessions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  student_name TEXT NOT NULL,
  student_id_number TEXT NOT NULL,
  subject TEXT NOT NULL,
  face_confidence NUMERIC NOT NULL DEFAULT 0,
  status public.request_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.late_requests TO authenticated;
GRANT ALL ON public.late_requests TO service_role;
ALTER TABLE public.late_requests ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER late_requests_set_updated_at BEFORE UPDATE ON public.late_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Students view own late requests; professors view all"
  ON public.late_requests FOR SELECT TO authenticated
  USING (student_id = auth.uid() OR public.has_role(auth.uid(), 'professor'));

CREATE POLICY "Students create own late requests"
  ON public.late_requests FOR INSERT TO authenticated
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "Professors approve/deny late requests"
  ON public.late_requests FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'professor'))
  WITH CHECK (public.has_role(auth.uid(), 'professor'));

-- ================================================================
-- reenroll_requests
-- ================================================================
CREATE TABLE public.reenroll_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  student_name TEXT NOT NULL,
  student_id_number TEXT NOT NULL,
  status public.request_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reenroll_requests TO authenticated;
GRANT ALL ON public.reenroll_requests TO service_role;
ALTER TABLE public.reenroll_requests ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER reenroll_requests_set_updated_at BEFORE UPDATE ON public.reenroll_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Students view own reenroll; professors view all"
  ON public.reenroll_requests FOR SELECT TO authenticated
  USING (student_id = auth.uid() OR public.has_role(auth.uid(), 'professor'));

CREATE POLICY "Students create own reenroll request"
  ON public.reenroll_requests FOR INSERT TO authenticated
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "Professors approve/deny reenroll"
  ON public.reenroll_requests FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'professor'))
  WITH CHECK (public.has_role(auth.uid(), 'professor'));

-- ================================================================
-- Realtime
-- ================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.prof_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_records;
ALTER PUBLICATION supabase_realtime ADD TABLE public.late_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.reenroll_requests;
