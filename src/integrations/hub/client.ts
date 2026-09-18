import { supabase } from "@/integrations/supabase/client";
export const hubSupabase = supabase;
export const HUB_URL = "http://127.0.0.1:3301/__resonance_hub__";
export const SYNC_VISION_APP_KEY = "sync_vision" as const;
