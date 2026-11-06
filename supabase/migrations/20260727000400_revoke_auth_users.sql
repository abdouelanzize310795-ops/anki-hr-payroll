-- auth.users holds password hashes and recovery tokens: app users must not
-- read it (only SECURITY DEFINER functions, which run as the owner).
revoke all on auth.users from authenticated, anon;
