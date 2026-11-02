import defaults from "../config/public-deployment.json";
type PublicEnvironment = {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  NEXT_PUBLIC_SITE_URL?: string;
};
// These are deliberately browser-public settings. No service-role/API tokens belong here.
export function publicDeploymentEnvironment(env: PublicEnvironment) {
  return {
    NEXT_PUBLIC_SUPABASE_URL:
      env.NEXT_PUBLIC_SUPABASE_URL || defaults.supabaseUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      defaults.supabasePublishableKey,
    NEXT_PUBLIC_SITE_URL: env.NEXT_PUBLIC_SITE_URL || defaults.siteUrl,
  };
}
