import type { TableState } from "./types";

export type ServiceTicket = {
  status: "PLACED" | "PREPARING" | "READY" | "SERVED" | "CANCELLED";
};

export function deriveServiceState(
  tickets: ServiceTicket[],
  billRequested: boolean,
): TableState {
  const live = tickets.filter(
    (ticket) => ticket.status === "PLACED" || ticket.status === "PREPARING" || ticket.status === "READY",
  );
  if (live.some((ticket) => ticket.status === "READY")) return "food_ready";
  if (live.length > 0) return "ordered";
  const served = tickets.some((ticket) => ticket.status === "SERVED");
  if (served) return billRequested ? "bill_requested" : "dining";
  return "occupied";
}
