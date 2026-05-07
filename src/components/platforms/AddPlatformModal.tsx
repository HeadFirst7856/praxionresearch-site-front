import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  createPlatform,
  listPlatformTypes,
  searchTopstepAccounts,
  type AccountSummary,
  type CreatePlatformPayload,
  type PlatformTypeSchema,
} from "@/api/platforms";
import { PasswordField } from "@/components/auth/PasswordField";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type AddPlatformModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
};

function formatMoney(n: number | null): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function typeBadgeClass(t: string): string {
  if (t === "funded") return "border-amber-400/40 text-amber-200";
  if (t === "combine") return "border-sky-400/40 text-sky-100";
  if (t === "practice") return "border-emerald-400/35 text-emerald-100";
  if (t === "express") return "border-violet-400/40 text-violet-100";
  return "border-white/15 text-slate-300";
}

export function AddPlatformModal({ open, onOpenChange, onCreated }: AddPlatformModalProps) {
  const [types, setTypes] = useState<PlatformTypeSchema[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(false);
  const [selectedType, setSelectedType] = useState<string>("");
  const [label, setLabel] = useState("");
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchedAccounts, setSearchedAccounts] = useState<AccountSummary[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<number[]>([]);

  const selectedSchema = useMemo(() => types.find((t) => t.type === selectedType), [types, selectedType]);
  const isTopstep = selectedType === "topstep";

  const handleDrawerOpenChange = (next: boolean) => {
    if (!next) {
      setLabel("");
      setSearchedAccounts([]);
      setSelectedAccountIds([]);
      setSearching(false);
    }
    onOpenChange(next);
  };

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoadingTypes(true);
      try {
        const list = await listPlatformTypes();
        if (cancelled) return;
        setTypes(list);
        const first = list[0]?.type ?? "";
        setSelectedType((prev) => (prev && list.some((t) => t.type === prev) ? prev : first));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load platform types");
      } finally {
        if (!cancelled) setLoadingTypes(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!selectedSchema) {
      setCredentials({});
      return;
    }
    const next: Record<string, string> = {};
    for (const f of selectedSchema.fields) {
      next[f.name] = "";
    }
    setCredentials(next);
    setSearchedAccounts([]);
    setSelectedAccountIds([]);
  }, [selectedSchema]);

  const onSearchAccounts = async () => {
    const userName = (credentials.user_name ?? "").trim();
    const apiKey = (credentials.api_key ?? "").trim();
    if (!userName || !apiKey) {
      toast.error("Enter username and API key first.");
      return;
    }
    setSearching(true);
    try {
      const list = await searchTopstepAccounts({ user_name: userName, api_key: apiKey });
      setSearchedAccounts(list);
      setSelectedAccountIds((prev) => prev.filter((pid) => list.some((a) => a.id === pid)));
      if (list.length === 0) {
        toast.info("No active accounts returned for this key.");
      } else {
        toast.success(`Found ${list.length} account(s). Select which to link.`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Search failed");
    } finally {
      setSearching(false);
    }
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedType) {
      toast.error("Select a platform.");
      return;
    }
    if (isTopstep && selectedAccountIds.length === 0) {
      toast.error("Search for accounts and select at least one.");
      return;
    }
    setSubmitting(true);
    try {
      const payload: CreatePlatformPayload = {
        platform_type: selectedType,
        label: label.trim(),
        credentials,
      };
      if (isTopstep) {
        payload.selected_account_ids = selectedAccountIds;
      }
      await createPlatform(payload);
      toast.success("Platform connected.");
      handleDrawerOpenChange(false);
      onCreated();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Request failed";
      if (msg.includes("422")) {
        toast.error("Invalid credentials or account selection.");
      } else if (msg.includes("409")) {
        toast.error("A connection with this label already exists.");
      } else if (msg.includes("400")) {
        toast.error("Check the form — e.g. select at least one Topstep account.");
      } else {
        toast.error(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const connectDisabled =
    submitting || loadingTypes || !selectedType || (isTopstep && (selectedAccountIds.length === 0 || searchedAccounts.length === 0));

  return (
    <Drawer direction="right" open={open} onOpenChange={handleDrawerOpenChange}>
      <DrawerContent className="data-[vaul-drawer-direction=right]:sm:max-w-lg">
        <DrawerHeader className="border-b border-white/5 text-left">
          <DrawerTitle className="font-semibold tracking-tight text-sky-100">Add platform</DrawerTitle>
          <DrawerDescription className="text-slate-400">
            Connect a funded evaluation account provider. Credentials are stored encrypted on the server.
          </DrawerDescription>
        </DrawerHeader>
        <form onSubmit={onSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {loadingTypes ? (
              <div className="space-y-2">
                <div className="h-9 animate-pulse rounded-md bg-white/5" />
                <div className="h-9 animate-pulse rounded-md bg-white/5" />
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <label htmlFor="platform-type" className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                    Platform
                  </label>
                  <Select
                    value={selectedType || null}
                    onValueChange={(v: unknown) => setSelectedType(typeof v === "string" ? v : "")}
                    disabled={submitting || types.length === 0}
                  >
                    <SelectTrigger id="platform-type" aria-label="Platform">
                      <SelectValue placeholder="Select platform" />
                    </SelectTrigger>
                    <SelectContent positionerClassName="z-[110]">
                      {types.map((t) => (
                        <SelectItem key={t.type} value={t.type}>
                          {t.display_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label htmlFor="platform-label" className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                    Label
                  </label>
                  <Input
                    id="platform-label"
                    value={label}
                    onChange={(ev) => setLabel(ev.target.value)}
                    placeholder="e.g. main, combine #2"
                    disabled={submitting}
                    autoComplete="off"
                  />
                </div>
                {selectedSchema?.fields.map((field) =>
                  field.secret ? (
                    <PasswordField
                      key={field.name}
                      id={`cred-${field.name}`}
                      name={field.name}
                      label={field.label}
                      placeholder={field.label}
                      autoComplete="off"
                      value={credentials[field.name] ?? ""}
                      onChange={(v) => setCredentials((c) => ({ ...c, [field.name]: v }))}
                      disabled={submitting}
                    />
                  ) : (
                    <div key={field.name} className="space-y-2">
                      <label htmlFor={`cred-${field.name}`} className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                        {field.label}
                      </label>
                      <Input
                        id={`cred-${field.name}`}
                        name={field.name}
                        value={credentials[field.name] ?? ""}
                        onChange={(ev) => setCredentials((c) => ({ ...c, [field.name]: ev.target.value }))}
                        disabled={submitting}
                        autoComplete="username"
                      />
                    </div>
                  ),
                )}
                {isTopstep ? (
                  <div className="space-y-3 border-t border-white/5 pt-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="border-white/15"
                        disabled={submitting || searching}
                        onClick={() => void onSearchAccounts()}
                      >
                        {searching ? "Searching…" : "Search accounts"}
                      </Button>
                    </div>
                    {searchedAccounts.length > 0 ? (
                      <ul className="max-h-64 space-y-2 overflow-y-auto rounded-md border border-white/10 p-2">
                        {searchedAccounts.map((acct) => (
                          <li key={acct.id}>
                            <label
                              className={cn(
                                "flex cursor-pointer items-start gap-3 rounded-md border border-transparent p-2 hover:bg-white/5",
                                selectedAccountIds.includes(acct.id) && "border-sky-500/30 bg-sky-500/10",
                              )}
                            >
                              <Checkbox
                                className="mt-1"
                                checked={selectedAccountIds.includes(acct.id)}
                                onCheckedChange={(checked) =>
                                  setSelectedAccountIds((prev) =>
                                    checked
                                      ? prev.includes(acct.id)
                                        ? prev
                                        : [...prev, acct.id]
                                      : prev.filter((x) => x !== acct.id),
                                  )
                                }
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-mono text-xs text-slate-400">#{acct.id}</span>
                                  <span className="truncate font-medium text-slate-100">{acct.name}</span>
                                  <Badge variant="outline" className={cn("text-[10px] uppercase", typeBadgeClass(acct.inferred_type))}>
                                    {acct.inferred_type}
                                  </Badge>
                                </div>
                                <div className="mt-1 text-xs text-slate-400">Balance {formatMoney(acct.balance)}</div>
                              </div>
                            </label>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
              </>
            )}
          </div>
          <DrawerFooter className="border-t border-white/5">
            <Button
              type="submit"
              disabled={connectDisabled}
              className="w-full rounded-md bg-sky-500/25 text-sky-50 hover:bg-sky-500/35"
            >
              {submitting ? "Connecting…" : "Connect"}
            </Button>
            <DrawerClose asChild>
              <Button type="button" variant="ghost" className="w-full" disabled={submitting}>
                Cancel
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
