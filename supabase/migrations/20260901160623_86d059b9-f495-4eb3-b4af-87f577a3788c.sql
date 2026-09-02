REVOKE EXECUTE ON FUNCTION public.match_policy_chunks(vector, int) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.keyword_policy_chunks(text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_policy_chunks(vector, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.keyword_policy_chunks(text, int) TO service_role;