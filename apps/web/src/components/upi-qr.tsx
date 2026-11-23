"use client";

import QRCode from "react-qr-code";

export function upiPayUri(input: {
  upiId: string;
  name?: string | null;
  amountPaise: number;
  note?: string | null;
}): string {
  const params = new URLSearchParams();
  params.set("pa", input.upiId);
  if (input.name) params.set("pn", input.name);
  if (input.amountPaise > 0) params.set("am", (input.amountPaise / 100).toFixed(2));
  params.set("cu", "INR");
  if (input.note) params.set("tn", input.note.slice(0, 80));
  return `upi://pay?${params.toString()}`;
}

export function UpiQr({
  value,
  size = 144,
  label,
}: {
  value: string;
  size?: number;
  label?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="rounded-xl bg-white p-2">
        <QRCode value={value} size={size} bgColor="#ffffff" fgColor="#0f172a" />
      </div>
      {label ? <span className="text-[10px] text-muted">{label}</span> : null}
    </div>
  );
}
