import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ShieldAlert } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in - TaskBase" },
      {
        name: "description",
        content: "TaskBase sign in page",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [showPermissionModal, setShowPermissionModal] = useState(false);

  useEffect(() => {
    // Check if redirected here due to missing permissions
    if (
      typeof window !== "undefined" &&
      (window.location.search.includes("permissions_required") ||
        localStorage.getItem("google_permission_error") === "true")
    ) {
      setShowPermissionModal(true);
    } else {
      supabase.auth.getUser().then(({ data }) => {
        if (data.user) {
          navigate({ to: "/home" });
        }
      });
    }
  }, [navigate]);

  const google = async () => {
    const callbackUrl = `${window.location.origin}/auth/callback`;
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callbackUrl,
        scopes:
          "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.events",
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });

    if (error) {
      toast.error(error.message);
      return;
    }

    if (data?.url) {
      window.location.assign(data.url);
      return;
    }

    navigate({ to: "/home" });
  };

  const handleGrantPermissionsOk = () => {
    setShowPermissionModal(false);
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem("google_permission_error");
    }
    if (typeof window !== "undefined") {
      window.history.replaceState({}, "", "/auth");
    }
    google();
  };

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="mx-auto flex min-h-[calc(100vh-6rem)] w-full max-w-md items-center">
        <div className="card-soft w-full p-6 sm:p-8">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight">TaskBase</h1>
            <p className="text-sm text-muted-foreground">
              AI-powered task management with an integrated knowledge base and intelligent chat.
            </p>
          </div>

          <Button
            onClick={google}
            variant="outline"
            className="mt-6 w-full flex items-center justify-center gap-2"
          >
            Continue with Google
          </Button>
        </div>
      </div>

      {/* Permissions Required Overlay Modal */}
      <Dialog open={showPermissionModal} onOpenChange={setShowPermissionModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="h-5 w-5" /> All Permissions Required
            </DialogTitle>
            <DialogDescription className="pt-3 text-sm text-foreground space-y-2">
              <p>
                To use TaskBase, you must grant <strong>all requested permissions</strong> for
                Google Calendar and Gmail when logging in.
              </p>
              <p className="text-xs text-muted-foreground">
                Without these permissions, TaskBase cannot fetch events, read emails, or push
                updated task dates back to your calendar.
              </p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 sm:justify-end">
            <Button onClick={handleGrantPermissionsOk} className="w-full sm:w-auto">
              OK, Grant Permissions
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
