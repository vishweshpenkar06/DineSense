"use client";

import { Toaster } from "sonner";
import { useTheme } from "@/components/theme-provider";

export function AppToaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      theme={resolvedTheme}
      position="top-center"
      closeButton
      richColors
      toastOptions={{
        classNames: {
          toast: "font-sans",
        },
      }}
    />
  );
}
