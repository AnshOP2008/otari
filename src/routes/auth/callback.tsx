import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { hasBrowserSupabaseConfig, supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth/callback")({
  component: OAuthCallback,
});

function OAuthCallback() {
  const navigate = useNavigate();
  const [returnToIntegrations, setReturnToIntegrations] = useState<{ focusTask?: string }>();
  const [message, setMessage] = useState(
    hasBrowserSupabaseConfig
      ? "Completing Google sign-in…"
      : "Sign-in needs a configured Supabase workspace.",
  );
  useEffect(() => {
    if (!hasBrowserSupabaseConfig) return;
    let active = true;
    const pending = sessionStorage.getItem("taskbase-google-connect");
    const focusTask = sessionStorage.getItem("taskbase-google-focus-task");

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      sessionStorage.removeItem("taskbase-google-connect");
      sessionStorage.removeItem("taskbase-google-focus-task");
      const params = new URLSearchParams(location.hash.slice(1) || location.search);
      if (error || params.has("error") || !data.session) {
        if (pending && data.session?.user.id === pending) {
          setReturnToIntegrations({ focusTask: focusTask ?? undefined });
        } else {
          sessionStorage.removeItem("taskbase-google-calendar-draft");
        }
        setMessage(
          params.get("error_description") ||
            error?.message ||
            (pending ? "Google permission was not granted." : "Google sign-in did not complete."),
        );
        return;
      }
      if (pending && data.session.user.id !== pending) {
        sessionStorage.removeItem("taskbase-google-calendar-draft");
        void supabase.auth.signOut();
        setMessage("Use the same Google account that owns this TaskBase workspace.");
        return;
      }
      if (pending) {
        void navigate({
          to: "/permissions",
          search: { focusTask: focusTask ?? undefined },
          hash: focusTask ? "calendar-export" : undefined,
          replace: true,
        });
      } else {
        sessionStorage.removeItem("taskbase-google-calendar-draft");
        void navigate({ to: "/home", replace: true });
      }
    });
    return () => {
      active = false;
    };
  }, [navigate]);
  return (
    <main className="mx-auto max-w-lg p-8">
      <p role="status">{message}</p>
      {returnToIntegrations ? (
        <Link
          to="/permissions"
          search={returnToIntegrations}
          hash={returnToIntegrations.focusTask ? "calendar-export" : undefined}
          replace
          className="underline"
        >
          Back to Integrations
        </Link>
      ) : (
        <Link to="/auth" className="underline">
          Back to sign in
        </Link>
      )}
    </main>
  );
}
