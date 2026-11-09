import { createFileRoute, Link, Outlet, useMatchRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { hasBrowserSupabaseConfig, supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { googleImportScopes, useGoogleOAuth } from "@/hooks/use-google-oauth";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in - TaskBase" }] }),
  component: AuthRoute,
});

function AuthRoute() {
  const matchRoute = useMatchRoute();
  return matchRoute({ to: "/auth/callback" }) ? <Outlet /> : <AuthPage />;
}

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const { local, googleAvailable } = useGoogleOAuth();

  async function google(connectImports = false) {
    setPending(true);
    try {
      sessionStorage.removeItem("taskbase-google-connect");
      sessionStorage.removeItem("taskbase-google-focus-task");
      sessionStorage.removeItem("taskbase-google-calendar-draft");
      if (connectImports) sessionStorage.setItem("taskbase-google-sign-in-imports", "true");
      else sessionStorage.removeItem("taskbase-google-sign-in-imports");
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin + "/auth/callback",
          ...(connectImports
            ? {
                scopes: googleImportScopes,
                queryParams: { include_granted_scopes: "true", prompt: "select_account" },
              }
            : {}),
        },
      });
      if (error) throw error;
    } catch (error) {
      sessionStorage.removeItem("taskbase-google-sign-in-imports");
      toast.error(error instanceof Error ? error.message : "Could not start Google sign-in.");
      setPending(false);
    }
  }

  async function emailAuth(create = false) {
    setPending(true);
    try {
      const { data, error } = create
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (data.session) await navigate({ to: "/home" });
      else toast.info("Check your email to confirm your account.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not sign in.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-4 py-12">
      <div className="card-soft w-full space-y-4 p-6 sm:p-8">
        <Link to="/" className="text-sm underline">
          Back to Planning Desk
        </Link>
        <h1 className="text-3xl font-semibold">Sign in to TaskBase</h1>
        <p className="text-sm text-muted-foreground">
          Upload sources, chat with your workspace, and save tasks to your board.
        </p>
        {!hasBrowserSupabaseConfig ? (
          <p role="status" className="rounded-lg border p-3 text-sm text-muted-foreground">
            Sign-in needs a configured Supabase workspace. The Planning Desk example is available
            from the home page.
          </p>
        ) : (
          <>
            {googleAvailable && (
              <>
                <Button
                  onClick={() => void google()}
                  disabled={pending}
                  variant="outline"
                  className="w-full"
                >
                  Continue with Google
                </Button>
                <Button
                  onClick={() => void google(true)}
                  disabled={pending}
                  variant="outline"
                  className="w-full"
                >
                  Sign in and connect Gmail + Calendar
                </Button>
              </>
            )}
            {local && (
              <p className="text-sm text-muted-foreground">
                Local workspace. Email sign-in uses an account for this device.
              </p>
            )}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void emailAuth();
              }}
              className="space-y-3"
            >
              <label className="block text-sm">
                Email
                <Input
                  autoComplete="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </label>
              <label className="block text-sm">
                Password
                <Input
                  autoComplete="current-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </label>
              <Button type="submit" disabled={pending} className="w-full">
                Sign in with email
              </Button>
              {local && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending || !email || password.length < 8}
                  className="w-full"
                  onClick={(event) => {
                    const form = event.currentTarget.form;
                    if (form?.reportValidity()) void emailAuth(true);
                  }}
                >
                  Create local account
                </Button>
              )}
            </form>
          </>
        )}
      </div>
    </main>
  );
}
