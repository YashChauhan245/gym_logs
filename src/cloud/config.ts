export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
export const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
export const cloudConfigured = Boolean(
  supabaseUrl &&
  supabasePublishableKey &&
  (supabasePublishableKey.startsWith('sb_publishable_') || supabasePublishableKey.startsWith('eyJ'))
);
