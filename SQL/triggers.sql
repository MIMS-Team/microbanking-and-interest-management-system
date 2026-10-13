-- Create the unified trigger function to delete OTPs according to criteria

CREATE FUNCTION public.trg_auto_cleanup_otps()
RETURNS TRIGGER 
LANGUAGE plpgsql
AS $$
BEGIN
    --cleanup queue
    DELETE FROM public.otpe 
    WHERE is_success = TRUE 
       OR expires_at < CURRENT_TIMESTAMP;

    RETURN NULL; -- Tells PostgreSQL the insert is complete and safe
END;
$$;

-- Bind the cleanup trigger to happen after an OTP is generated
CREATE TRIGGER tgr_otpe_insert_cleanup
AFTER INSERT ON public.otpe
FOR EACH STATEMENT
EXECUTE FUNCTION public.trg_auto_cleanup_otps();