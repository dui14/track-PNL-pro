import { z } from 'zod'

export const UpdateProfileSchema = z
  .object({
    displayName: z.string().min(1).max(100).trim().optional(),
    email: z.string().email().optional(),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: 'At least one field must be provided',
  })

export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>
