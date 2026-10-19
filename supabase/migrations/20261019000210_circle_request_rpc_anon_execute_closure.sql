-- Supabase can grant anon EXECUTE directly through default function privileges.
-- Revoking PUBLIC alone leaves that direct grant intact across replacements.
-- Preserve the existing authenticated and service_role grants and RPC behavior.
revoke execute on function public.request_friendship(text) from public, anon;
