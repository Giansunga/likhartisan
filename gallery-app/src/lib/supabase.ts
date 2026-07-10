import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://wlnknpbjkcmxwxtuspeh.supabase.co';
const supabaseAnonKey = 'sb_publishable_-UfwYUTNrc-TmoCkD5VV5Q_BjIMJdgD';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
