"use client";

import {
  AlertTriangle,
  BellRing,
  Check,
  Coffee,
  CreditCard,
  Minus,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  Settings2,
  ShoppingBag,
  Sparkles,
  Soup,
  Utensils,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { useTheme } from "@/components/theme-provider";
import {
  AlertBanner,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CountdownRing,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  EmptyState,
  IconButton,
  Input,
  PageHeader,
  QtyStepper,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SegmentedControl,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Skeleton,
  StatTile,
  StatusPill,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  ThemeToggle,
  toast,
} from "@/components/ui";
import type { TableState } from "@dinesense/core";

const STATES: TableState[] = [
  "free",
  "occupied",
  "needs_order",
  "ordered",
  "food_ready",
  "dining",
  "bill_requested",
  "needs_cleaning",
];

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function ThemePreview({ theme }: { theme: "light" | "dark" }) {
  return (
    <div
      data-theme={theme}
      style={{ colorScheme: theme }}
      className="rounded-card border border-border bg-background p-4 text-foreground"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {theme === "light" ? "Light theme" : "Dark theme"}
        </p>
        <Badge variant="brand">Preview</Badge>
      </div>
      <div className="mt-3 space-y-2">
        <StatusPill state="needs_order" size="sm" />
        <StatusPill state="food_ready" size="sm" />
        <StatusPill state="free" size="sm" />
      </div>
      <div className="mt-3 flex gap-2">
        <Button size="md">Primary</Button>
        <Button size="md" variant="secondary">
          Secondary
        </Button>
      </div>
      <div className="mt-3 rounded-control border border-border bg-card p-3">
        <p className="text-xs text-muted-foreground">Card surface</p>
        <p className="mt-1 text-base font-semibold">₹1,240</p>
      </div>
    </div>
  );
}

export function Gallery() {
  const { resolvedTheme } = useTheme();
  const [qty, setQty] = useState(2);
  const [size, setSize] = useState<"half" | "full">("half");
  const [view, setView] = useState<"summary" | "details">("summary");
  const [floor, setFloor] = useState("ground");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [note, setNote] = useState("Less spicy");

  return (
    <main className="min-h-[100dvh] bg-background text-foreground">
      <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6 sm:py-8">
        <PageHeader
          eyebrow="Dev console"
          title="Component gallery"
          description="The shared DineSense UI primitives in every state. Toggle the theme to review both palettes; no database or login is needed here."
          actions={<ThemeToggle />}
        />

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Current theme: {resolvedTheme}</Badge>
          <Badge variant="brand">Tailwind 3.4</Badge>
          <Badge variant="neutral">Radix primitives</Badge>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <ThemePreview theme="light" />
          <ThemePreview theme="dark" />
        </div>

        <Section title="Buttons" description="One primary action per card. Loading and disabled states are built in.">
          <div className="flex flex-wrap items-center gap-2">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
            <Button loading>Loading</Button>
            <Button disabled>Disabled</Button>
          </div>
          <div className="mt-4 flex flex-wrap items-end gap-2">
            <Button size="md">Medium</Button>
            <Button size="lg" variant="secondary">
              Large
            </Button>
            <Button size="xl">Extra large</Button>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <IconButton label="Search" icon={<Search className="h-4 w-4" />} />
            <IconButton label="Refresh" variant="ghost" icon={<RefreshCw className="h-4 w-4" />} />
            <IconButton label="Settings" variant="primary" size="lg" icon={<Settings2 className="h-4 w-4" />} />
          </div>
        </Section>

        <Section title="Table status" description="Icon + plain words. Red and violet are reserved for the two urgent states.">
          <div className="flex flex-wrap gap-2">
            {STATES.map((state) => (
              <StatusPill key={state} state={state} />
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge variant="neutral">Neutral</Badge>
            <Badge variant="brand">Brand</Badge>
            <Badge variant="success">Success</Badge>
            <Badge variant="warning">Warning</Badge>
            <Badge variant="danger">Danger</Badge>
            <Badge variant="info">Info</Badge>
            <Badge variant="outline">Outline</Badge>
          </div>
        </Section>

        <Section title="Countdown" description="The ring gives the waiting table a visual deadline as well as a number.">
          <div className="flex flex-wrap items-center gap-5">
            <CountdownRing remainingSeconds={134} totalSeconds={180} />
            <CountdownRing remainingSeconds={45} totalSeconds={180} tone="warning" />
            <CountdownRing remainingSeconds={12} totalSeconds={180} tone="danger" size={76} />
          </div>
        </Section>

        <Section title="Forms" description="Forty-eight pixel controls on the floor tools; large segmented choices for variants.">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground" htmlFor="gallery-query">
                Search
              </label>
              <Input id="gallery-query" placeholder="Search dishes" />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">Floor</p>
              <Select value={floor} onValueChange={setFloor}>
                <SelectTrigger aria-label="Floor">
                  <SelectValue placeholder="Choose a floor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ground">Ground floor</SelectItem>
                  <SelectItem value="first">First floor</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">Portion</p>
              <SegmentedControl
                label="Portion"
                size="lg"
                value={size}
                onValueChange={setSize}
                options={[
                  { value: "half", label: "Half" },
                  { value: "full", label: "Full" },
                ]}
              />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">Quantity</p>
              <QtyStepper value={qty} onChange={setQty} />
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <label className="text-xs font-semibold text-muted-foreground" htmlFor="gallery-note">
              Item note
            </label>
            <Input id="gallery-note" value={note} onChange={(event) => setNote(event.target.value)} />
            <div className="flex flex-wrap gap-2">
              {["Less spicy", "No onion-garlic", "Extra spicy", "Jain"].map((quickNote) => (
                <Button
                  key={quickNote}
                  size="md"
                  variant="secondary"
                  onClick={() => setNote(quickNote)}
                  className="rounded-full text-xs"
                >
                  {quickNote}
                </Button>
              ))}
            </div>
          </div>
        </Section>

        <Section title="Tabs" description="Use tabs for two views of the same record, never for page navigation.">
          <Tabs value={view} onValueChange={(value) => setView(value as "summary" | "details")}>
            <TabsList>
              <TabsTrigger value="summary">Summary</TabsTrigger>
              <TabsTrigger value="details">Details</TabsTrigger>
            </TabsList>
            <TabsContent value="summary" className="rounded-card border border-border bg-card p-4 text-sm text-muted-foreground">
              Four open tables, three orders on the kitchen board, one bill requested.
            </TabsContent>
            <TabsContent value="details" className="rounded-card border border-border bg-card p-4 text-sm text-muted-foreground">
              G3 ordered two items at 12:42. Food is ready; the waiter has been notified.
            </TabsContent>
          </Tabs>
        </Section>

        <Section title="Overlays" description="Sheets slide from the bottom on phones and from the right on desktop.">
          <div className="flex flex-wrap gap-2">
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger asChild>
                <Button>Open table sheet</Button>
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>Table G3</SheetTitle>
                  <SheetDescription>Ground floor · Non-AC · four seats</SheetDescription>
                </SheetHeader>
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-muted-foreground">Portion</span>
                    <SegmentedControl
                      label="Portion"
                      value={size}
                      onValueChange={setSize}
                      options={[
                        { value: "half", label: "Half" },
                        { value: "full", label: "Full" },
                      ]}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-muted-foreground">Quantity</span>
                    <QtyStepper value={qty} onChange={setQty} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground" htmlFor="sheet-note">
                      Item note
                    </label>
                    <Input id="sheet-note" value={note} onChange={(event) => setNote(event.target.value)} />
                  </div>
                </div>
                <SheetFooter>
                  <Button variant="secondary" onClick={() => setSheetOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={() => {
                      setSheetOpen(false);
                      toast.success("Added to the order");
                    }}
                  >
                    Add · ₹{size === "half" ? 155 : 295}
                  </Button>
                </SheetFooter>
              </SheetContent>
            </Sheet>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="secondary">Open dialog</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Move table?</DialogTitle>
                  <DialogDescription>Move the open visit to another free table. The table state moves with it.</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="secondary">Cancel</Button>
                  </DialogClose>
                  <Button
                    onClick={() => {
                      setDialogOpen(false);
                      toast.success("Table moved");
                    }}
                  >
                    Move table
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </Section>

        <Section title="Feedback" description="Every action gets an immediate result: a toast, a banner or a skeleton.">
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => toast.success("Order sent to the kitchen")}>
              Show success toast
            </Button>
            <Button variant="secondary" onClick={() => toast.error("Could not send the order")}>
              Show error toast
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                const id = toast.loading("Sending to kitchen…");
                setTimeout(() => toast.success("Sent to kitchen", { id }), 900);
              }}
            >
              Show loading toast
            </Button>
          </div>
          <div className="mt-4 space-y-3">
            <AlertBanner
              tone="danger"
              icon={BellRing}
              title="Table G3 is waiting to order"
              description="Ground floor · waiting 2:10"
              action={
                <Button size="lg" variant="secondary">
                  I&apos;m going
                </Button>
              }
            />
            <AlertBanner
              tone="ready"
              icon={Utensils}
              title="Food is ready for Table F2"
              description="First floor · waiting 0:45"
              action={
                <Button size="lg" variant="secondary">
                  Mark served
                </Button>
              }
            />
            <AlertBanner
              tone="warning"
              icon={AlertTriangle}
              title="Camera offline"
              description="Set tables manually until it reconnects."
            />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <EmptyState
              icon={Receipt}
              title="No open visits"
              description="New tables will appear here as soon as they are seated."
            />
            <div className="rounded-card border border-border bg-card p-4">
              <div className="mb-3 flex items-center gap-2">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
              <Skeleton className="h-20 w-full" />
            </div>
          </div>
        </Section>

        <Section title="Data tiles" description="The dashboard and reception summaries use the same tile.">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Earnings" value="₹12,480" icon={Wallet} trend={{ value: "12%", direction: "up" }} hint="vs yesterday" />
            <StatTile label="Bills" value="38" icon={Receipt} trend={{ value: "4", direction: "up" }} hint="paid" />
            <StatTile label="Average bill" value="₹328" icon={ShoppingBag} trend={{ value: "2%", direction: "down" }} hint="vs yesterday" />
            <StatTile label="Items ordered" value="142" icon={Soup} hint="today" />
          </div>
        </Section>

        <Section title="Kitchen ticket" description="One large action, a coloured age strip and quantity-first items.">
          <div className="max-w-sm overflow-hidden rounded-card border border-border bg-card shadow-card">
            <div className="h-1.5 w-full bg-brand" />
            <div className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">New ticket</p>
                  <p className="mt-1 text-3xl font-semibold leading-none">G3</p>
                  <p className="mt-1 text-sm text-muted-foreground">Ground floor · Non-AC</p>
                </div>
                <Badge variant="warning">6 min</Badge>
              </div>
              <div className="mt-4 space-y-2">
                <p className="text-xl font-semibold">
                  <span className="mr-2 text-brand-text">2×</span>Veg Manchurian <span className="text-sm font-normal text-muted-foreground">(Half · Gravy)</span>
                </p>
                <p className="text-xl font-semibold">
                  <span className="mr-2 text-brand-text">1×</span>Veg Hakka Noodles <span className="text-sm font-normal text-muted-foreground">(Full)</span>
                </p>
                <p className="inline-flex items-center gap-1 rounded-lg bg-status-occupied px-2.5 py-1 text-xs font-semibold text-status-occupied-foreground">
                  <Sparkles className="h-3.5 w-3.5" /> Less spicy
                </p>
              </div>
              <Button size="xl" className="mt-4 w-full">
                Start
              </Button>
            </div>
          </div>
        </Section>

        <Section title="Small pieces" description="Everything else the screens need.">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary">
              <Plus className="h-4 w-4" /> Add item
            </Button>
            <Button variant="ghost">
              <Minus className="h-4 w-4" /> Remove
            </Button>
            <Button variant="secondary">
              <CreditCard className="h-4 w-4" /> Take payment
            </Button>
            <Button variant="secondary">
              <Coffee className="h-4 w-4" /> Water bottle
            </Button>
            <Button variant="secondary">
              <Check className="h-4 w-4" /> Mark served
            </Button>
            <Badge variant="success">
              <Check className="h-3 w-3" /> Paid
            </Badge>
          </div>
        </Section>

        <p className="pb-6 text-center text-xs text-muted-foreground">
          U0 foundations · `docs/UI-REDESIGN.md` · screens migrate one phase at a time.
        </p>
      </div>
    </main>
  );
}
