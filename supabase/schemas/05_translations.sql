CREATE TABLE public.translation_cache (
  key TEXT PRIMARY KEY,
  context TEXT NOT NULL,
  target_locale TEXT NOT NULL CHECK (target_locale IN ('en-US', 'zh-CN')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'translated', 'unchanged', 'failed')),
  result TEXT,
  model TEXT,
  generated_at TIMESTAMPTZ,
  claim_token UUID,
  lease_until TIMESTAMPTZ,
  retry_after TIMESTAMPTZ,
  CHECK (
    (status IN ('translated', 'unchanged') AND result IS NOT NULL AND generated_at IS NOT NULL)
    OR (status IN ('pending', 'failed') AND result IS NULL)
  )
);

ALTER TABLE public.translation_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.translation_cache FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.translation_cache TO service_role;

-- A conflicting insert locks the row before testing lease/cooldown eligibility.
CREATE FUNCTION public.claim_translation(p_key TEXT, p_context TEXT, p_target_locale TEXT, p_token UUID)
RETURNS SETOF public.translation_cache
LANGUAGE sql
SET search_path = ''
AS $$
  INSERT INTO public.translation_cache AS existing
    (key, context, target_locale, status, claim_token, lease_until)
  VALUES (p_key, p_context, p_target_locale, 'pending', p_token, clock_timestamp() + INTERVAL '120 seconds')
  ON CONFLICT (key) DO UPDATE SET
    status = 'pending', claim_token = p_token,
    lease_until = clock_timestamp() + INTERVAL '120 seconds', retry_after = NULL
  WHERE (existing.status = 'pending' AND existing.lease_until <= clock_timestamp())
     OR (existing.status = 'failed' AND existing.retry_after <= clock_timestamp())
  RETURNING existing.*;
$$;

CREATE FUNCTION public.finish_translation(p_key TEXT, p_token UUID, p_status TEXT, p_result TEXT, p_model TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF p_status NOT IN ('translated', 'unchanged', 'failed') THEN
    RAISE EXCEPTION 'Invalid translation outcome';
  END IF;
  UPDATE public.translation_cache SET
    status = p_status,
    result = CASE WHEN p_status = 'failed' THEN NULL ELSE p_result END,
    model = p_model,
    generated_at = CASE WHEN p_status = 'failed' THEN NULL ELSE clock_timestamp() END,
    retry_after = CASE WHEN p_status = 'failed' THEN clock_timestamp() + INTERVAL '30 seconds' ELSE NULL END,
    claim_token = NULL, lease_until = NULL
  WHERE key = p_key AND claim_token = p_token AND status = 'pending'
    AND lease_until > clock_timestamp();
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_translation(TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_translation(TEXT, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_translation(TEXT, TEXT, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_translation(TEXT, UUID, TEXT, TEXT, TEXT) TO service_role;
