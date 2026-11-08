import { useQuery } from "@tanstack/react-query";

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL || import.meta.env.VITE_SUPABASE_PROJECT_URL || "";
const publishableKey =
  import.meta.env.VITE_SUPABASE_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
const local = /^http:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(supabaseUrl);

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
