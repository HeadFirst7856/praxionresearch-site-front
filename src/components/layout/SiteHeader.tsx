import { Menu } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";

const navLinks = [
  { to: "/", label: "Home" },
  { to: "/platform", label: "Platform" },
  { to: "/dashboard", label: "Dashboard" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

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
          <a href="mailto:enri@praxionresearch.com" className="hover:text-foreground">
            Contact
          </a>
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
              <a
                href="mailto:enri@praxionresearch.com"
                className="rounded-md border border-transparent px-3 py-2 text-sm text-muted-foreground hover:border-border hover:text-foreground"
              >
                Contact
              </a>
            </div>
          </DrawerContent>
        </Drawer>
      </div>
    </header>
  );
}
