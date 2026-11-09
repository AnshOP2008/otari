import { useQuery } from "@tanstack/react-query";
import { browserSupabaseKey, browserSupabaseUrl } from "@/integrations/supabase/client";

const supabaseUrl = browserSupabaseUrl;
const publishableKey = browserSupabaseKey;
const local = /^http:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(supabaseUrl);
export const googleImportScopes =
  "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/gmail.readonly";

export function useGoogleOAuth() {
  const settings = useQuery({
    queryKey: ["local-google-oauth", supabaseUrl],
    enabled: local && Boolean(publishableKey),
    staleTime: 30_000,
    retry: false,
    queryFn: async ({ signal }) => {
      const response = await fetch(supabaseUrl.replace(/\/$/, "") + "/auth/v1/settings", {
        headers: { apikey: publishableKey },
        signal,
      });
      if (!response.ok) throw new Error("Could not check the Google provider.");
      const config = await response.json();
      return config.external?.google === true;
    },
  });
  return { local, googleAvailable: !local || settings.data === true };
}
