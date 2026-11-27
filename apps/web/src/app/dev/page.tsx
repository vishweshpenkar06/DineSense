import { devConsoleEnabled } from "@dinesense/db";
import { notFound } from "next/navigation";
import DevConsole from "./dev-console";

export const dynamic = "force-dynamic";

export default function DevPage() {
  if (!devConsoleEnabled()) notFound();
  return <DevConsole />;
}
