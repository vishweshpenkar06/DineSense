import { WaiterAlerts } from "@/components/waiter-alerts";

export default function WaiterLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <WaiterAlerts />
      {children}
    </>
  );
}
