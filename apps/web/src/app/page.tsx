import { readSessionUser } from "@/lib/auth";
import { homeForRole } from "@/lib/ui";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await readSessionUser();
  if (!user) redirect("/login");
  redirect(homeForRole(user.role));
}
