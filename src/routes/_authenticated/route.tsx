import { createFileRoute, Outlet, redirect, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  Menu,
  FileText,
  ListTodo,
  LogOut,
  MessageCircle,
  Brain,
  ClipboardList,
  Plug,
} from "lucide-react";
import { hasBrowserSupabaseConfig, supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";
import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const navItems = [
  { to: "/home", label: "Tasks", icon: ListTodo },
  { to: "/", label: "Planning Desk", icon: ClipboardList },
  { to: "/documents", label: "KnowledgeBase", icon: Brain },
  { to: "/chat", label: "Chat", icon: MessageCircle },
  { to: "/permissions", label: "Integrations", icon: Plug },
  { to: "/documentation", label: "Documentation", icon: FileText },
] as const;

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    if (!hasBrowserSupabaseConfig) throw redirect({ to: "/auth" });
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/auth" });
    }
    return { user: data.user };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  return (
    <div className="min-h-screen overflow-x-hidden">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          {/* <Link
            to="/home"
            className="min-w-0 font-display text-lg font-semibold tracking-tight sm:text-xl"
          >
            TaskBase
          </Link> */}
          <div className="flex items-center gap-2">
            <Link
              to="/home"
              className="min-w-0 font-display text-lg font-semibold tracking-tight sm:text-xl"
            >
              TaskBase
            </Link>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground"
                  aria-label="Implementation note"
                >
                  <Info className="h-4 w-4" />
                </Button>
              </PopoverTrigger>

              <PopoverContent align="start" className="w-md max-w-[calc(100vw-2rem)] text-sm">
                <h4 className="mb-2 font-semibold">AI services</h4>
                <p>
                  TaskBase uses Mozilla Otari for AI generation. Source search runs in your database
                  and uses no AI credits.
                </p>
              </PopoverContent>
            </Popover>
          </div>

          <nav className="ml-2 hidden items-center gap-1 text-sm md:flex">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className="flex items-center gap-1.5 rounded-md px-3 py-1.5 hover:bg-secondary"
                  activeProps={{
                    className: "flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5",
                  }}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto hidden md:block">
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="mr-1 h-4 w-4" />
              Sign out
            </Button>
          </div>

          <div className="ml-auto md:hidden">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Open navigation">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[min(19rem,calc(100vw-1rem))]">
                <SheetHeader className="text-left">
                  <SheetTitle>TaskBase</SheetTitle>
                </SheetHeader>

                <div className="mt-6 space-y-2">
                  {navItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <SheetClose asChild key={item.to}>
                        <Link
                          to={item.to}
                          onClick={() => setOpen(false)}
                          className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-secondary"
                          activeProps={{
                            className:
                              "flex items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-2 text-sm",
                          }}
                        >
                          <Icon className="h-4 w-4" />
                          {item.label}
                        </Link>
                      </SheetClose>
                    );
                  })}
                </div>

                <div className="mt-6 border-t border-border pt-4">
                  <Button variant="outline" className="w-full" onClick={signOut}>
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign out
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
