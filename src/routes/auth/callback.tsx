import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { verifyGoogleTokenScopes } from "@/lib/google-permissions";

export const Route = createFileRoute("/auth/callback")({
  component: OAuthCallback,
});

function OAuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;

    const handleSession = async (session: any) => {
      if (!session || !active) return;
      
      const token = session.provider_token;
      if (token) {
        console.log("[OAuth Callback] Verifying Google token scopes...");
        const valid = await verifyGoogleTokenScopes(token);
        if (!valid) {
          console.warn("[OAuth Callback] Scope check failed! Signing out and redirecting to auth...");
          await supabase.auth.signOut();
          if (typeof localStorage !== "undefined") {
            localStorage.setItem("google_permission_error", "true");
          }
          window.location.href = "/auth?error=permissions_required";
          return;
        }
      }

      console.log("[OAuth Callback] Verification passed. Redirecting to home.");
      navigate({ to: "/home" });
    };

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED") && session) {
        handleSession(session);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        handleSession(session);
      }
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [navigate]);

  return null;
}
