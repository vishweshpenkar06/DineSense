import { WaiterAlerts } from "@/components/waiter-alerts";
import { WaiterOrdersProvider } from "@/components/waiter-orders";

export default function WaiterLayout({ children }: { children: React.ReactNode }) {
  return (
    <WaiterOrdersProvider>
      <WaiterAlerts />
      {children}
    </WaiterOrdersProvider>
  );
}
