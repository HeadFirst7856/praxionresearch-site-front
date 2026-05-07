import { Menu } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { isSignupEnabled } from "@/lib/features";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";

const publicLinks = [{ to: "/", label: "Home" }];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const { isAuthenticated, name, logout } = useAuth();
  const signupEnabled = isSignupEnabled();
  const navLinks = isAuthenticated ? [...publicLinks, { to: "/simulations", label: "Simulations" }] : publicLinks;

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-[#060d18]/80 backdrop-blur-xl">
      <div className="page-container flex h-18 items-center justify-between">
        <Link to="/" className="text-sm font-semibold tracking-[0.2em] text-foreground">
          PRAXION RESEARCH
        </Link>

        <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={location.pathname === link.to ? "text-foreground" : "hover:text-foreground"}
            >
              {link.label}
            </Link>
          ))}
          {isAuthenticated ? (
            <>
              <span className="text-xs uppercase tracking-[0.12em] text-slate-400">{name}</span>
              <Button type="button" variant="outline" size="sm" onClick={logout}>
                Logout
              </Button>
            </>
          ) : (
            <>
              <Link to="/login" className={location.pathname === "/login" ? "text-foreground" : "hover:text-foreground"}>
                Login
              </Link>
              {signupEnabled ? (
                <Link to="/signup" className={location.pathname === "/signup" ? "text-foreground" : "hover:text-foreground"}>
                  Sign up
                </Link>
              ) : null}
            </>
          )}
        </nav>

        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerTrigger asChild className="md:hidden">
            <Button variant="ghost" size="icon" aria-label="Open menu">
              <Menu className="size-5" />
            </Button>
          </DrawerTrigger>
          <DrawerContent className="border-border bg-popover text-popover-foreground">
            <DrawerHeader>
              <DrawerTitle className="text-left tracking-[0.14em]">PRAXION MENU</DrawerTitle>
            </DrawerHeader>
            <div className="flex flex-col gap-1 px-4 pb-8">
              {navLinks.map((link) => (
                <DrawerClose asChild key={link.to}>
                  <Link
                    to={link.to}
                    className="rounded-md border border-transparent px-3 py-2 text-sm text-muted-foreground hover:border-border hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                </DrawerClose>
              ))}
              {isAuthenticated ? (
                <Button type="button" variant="outline" size="sm" onClick={logout} className="mt-2">
                  Logout
                </Button>
              ) : (
                <>
                  <DrawerClose asChild>
                    <Link
                      to="/login"
                      className="rounded-md border border-transparent px-3 py-2 text-sm text-muted-foreground hover:border-border hover:text-foreground"
                    >
                      Login
                    </Link>
                  </DrawerClose>
                  {signupEnabled ? (
                    <DrawerClose asChild>
                      <Link
                        to="/signup"
                        className="rounded-md border border-transparent px-3 py-2 text-sm text-muted-foreground hover:border-border hover:text-foreground"
                      >
                        Sign up
                      </Link>
                    </DrawerClose>
                  ) : null}
                </>
              )}
            </div>
          </DrawerContent>
        </Drawer>
      </div>
    </header>
  );
}
