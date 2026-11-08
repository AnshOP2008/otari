import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { hasBrowserSupabaseConfig, supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth/callback")({
  component: OAuthCallback,
});

function OAuthCallback() {
  const navigate = useNavigate();
  const [message, setMessage] = useState(
    hasBrowserSupabaseConfig
      ? "Completing Google sign-in…"
      : "Sign-in needs a configured Supabase workspace.",
  );
  useEffect(() => {
    if (!hasBrowserSupabaseConfig) return;
    let active = true;
    const pending = sessionStorage.getItem("taskbase-google-connect");

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      sessionStorage.removeItem("taskbase-google-connect");
      const params = new URLSearchParams(location.hash.slice(1) || location.search);
      if (error || params.has("error") || !data.session) {
        setMessage(
          params.get("error_description") || error?.message || "Google sign-in did not complete.",
        );
        return;
      }
      if (pending && data.session.user.id !== pending) {
        void supabase.auth.signOut();
        setMessage("Use the same Google account that owns this TaskBase workspace.");
        return;
      }
      void navigate({ to: pending ? "/permissions" : "/home", replace: true });
    });
    return () => {
      active = false;
    };
  }, [navigate]);
  return (
    <main className="mx-auto max-w-lg p-8">
      <p role="status">{message}</p>
      <a href="/auth" className="underline">
        Back to sign in
      </a>
    </main>
  );
}
