"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/theme-provider";
import { Button } from "./button";

const OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const Icon = theme === "system" ? Monitor : resolvedTheme === "dark" ? Moon : Sun;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="secondary" size="md" className={cn("gap-2", className)} aria-label="Theme">
          <Icon className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Theme</span>
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-40 rounded-card border border-border bg-card p-1 text-foreground shadow-float"
        >
          <DropdownMenu.Label className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
            Appearance
          </DropdownMenu.Label>
          {OPTIONS.map((option) => {
            const OptionIcon = option.icon;
            return (
              <DropdownMenu.Item
                key={option.value}
                onSelect={() => setTheme(option.value)}
                className="flex min-h-10 cursor-default items-center gap-2 rounded-lg px-2 text-sm outline-none focus:bg-card-raised focus-visible:outline-none"
              >
                <OptionIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <span className="flex-1">{option.label}</span>
                {theme === option.value ? <Check className="h-4 w-4 text-brand-text" aria-hidden="true" /> : null}
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
