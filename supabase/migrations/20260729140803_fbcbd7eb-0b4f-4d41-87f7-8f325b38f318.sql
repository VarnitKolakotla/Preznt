ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS student_id TEXT,
  ADD COLUMN IF NOT EXISTS faculty_id TEXT,
  ADD COLUMN IF NOT EXISTS first_login_date TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.provision_verified_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _role public.app_role;
  _subjects TEXT[];
  _id_number TEXT;
BEGIN
  IF NEW.email_confirmed_at IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.email_confirmed_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF lower(split_part(NEW.email, '@', 2)) <> 'gcet.edu.in' THEN
    RETURN NEW;
  END IF;

  _role := COALESCE(NULLIF(NEW.raw_user_meta_data->>'role', ''), 'student')::public.app_role;
  _id_number := COALESCE(NEW.raw_user_meta_data->>'id_number', '');

  SELECT COALESCE(array_agg(value::text), '{}')
    INTO _subjects
    FROM jsonb_array_elements_text(
      COALESCE(NEW.raw_user_meta_data->'subjects', '[]'::jsonb)
    ) AS value;

  INSERT INTO public.profiles (id, name, email, id_number, subjects, student_id, faculty_id, first_login_date)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    _id_number,
    _subjects,
    CASE WHEN _role = 'student' THEN _id_number ELSE NULL END,
    CASE WHEN _role = 'professor' THEN _id_number ELSE NULL END,
    now()
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, _role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$function$;