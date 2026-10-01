import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://bfwgarsrcyncbgovprkm.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_UsydTapKGsJWHmI9p58k4A_YoDZpHwn';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
