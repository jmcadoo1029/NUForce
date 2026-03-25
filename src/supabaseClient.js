import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://swuuxzmgmldvvomsgmjf.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_bmrPY65INpUkea8VUX1Wag_T7Vrz9ZZ";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
