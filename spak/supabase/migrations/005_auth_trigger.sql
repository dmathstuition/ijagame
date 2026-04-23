-- supabase/migrations/005_auth_trigger.sql
-- Auto-create profile when user signs up via Supabase Auth

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    -- Default to quiz_admin for manually created users; participants join without auth
    COALESCE((NEW.raw_user_meta_data->>'role')::app_role, 'quiz_admin')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger fires after every new user in auth.users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- FIRST SUPER ADMIN SETUP
-- ============================================================
-- After running migrations, create your first super admin via:
-- 1. Supabase Dashboard > Authentication > Users > Invite User
-- 2. Or via SQL:
--    SELECT supabase_auth.create_user('admin@infantjesus.edu.ng', 'your-password',
--      '{"full_name": "Super Admin", "role": "super_admin"}'::jsonb);
-- 3. Then update the profile:
--    UPDATE profiles SET role = 'super_admin' WHERE email = 'admin@infantjesus.edu.ng';
