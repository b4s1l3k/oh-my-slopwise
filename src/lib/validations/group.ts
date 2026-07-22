import { z } from "zod"
import { SUPPORTED_CURRENCIES } from "@/lib/currencies"

export const createGroupSchema = z.object({
  name: z.string().min(1, "Название обязательно").max(100),
  description: z.string().max(500).optional(),
  type: z.enum(["HOME", "TRIP", "COUPLE", "OTHER"]).default("OTHER"),
  currency: z.enum(SUPPORTED_CURRENCIES).default("RUB"),
  memberIds: z.array(z.string()).default([]),
})

export const updateGroupSchema = createGroupSchema.partial()

export type CreateGroupInput = z.infer<typeof createGroupSchema>
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>
