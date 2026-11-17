import { notFound } from "next/navigation";
import { Gallery } from "./gallery";

export const dynamic = "force-dynamic";

export default function DevUiPage() {
  if (process.env.ENABLE_DEV_CONSOLE !== "true") notFound();
  return <Gallery />;
}
