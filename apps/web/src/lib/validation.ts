import { z } from "zod";

export const uuidSchema = z.string().uuid();

export const tableStateSchema = z.enum([
  "free",
  "occupied",
  "needs_order",
  "ordered",
  "food_ready",
  "dining",
  "bill_requested",
  "needs_cleaning",
]);

export const loginSchema = z
  .object({
    pin: z.string().regex(/^\d{6}$/).optional(),
    password: z.string().min(10).max(200).optional(),
  })
  .refine((body) => Boolean(body.pin) !== Boolean(body.password), {
    message: "Provide either a PIN or a password",
  });

export const visionEventSchema = z.object({
  camera_id: uuidSchema.nullable().optional(),
  table_id: uuidSchema,
  state: z.enum(["occupied", "empty"]),
  person_count: z.number().int().min(0).max(50),
  confidence: z.number().min(0).max(1),
  ts: z.string().datetime(),
  event_id: uuidSchema,
});

export const heartbeatSchema = z.object({
  camera_id: uuidSchema,
  status: z.enum(["ok", "degraded", "offline"]),
  fps: z.number().min(0).max(120).optional(),
  ts: z.string().datetime(),
});

export const orderSchema = z.object({
  tableId: uuidSchema.optional(),
  sessionId: uuidSchema.optional(),
  clientKey: z.string().min(8).max(100),
  note: z.string().max(500).optional(),
  items: z
    .array(
      z.object({
        variantId: uuidSchema,
        qty: z.number().int().min(1).max(50),
        note: z.string().max(140).optional(),
      }),
    )
    .min(1)
    .max(50),
});

export const taskActionSchema = z.object({
  action: z.enum(["ack", "snooze", "done"]),
});
