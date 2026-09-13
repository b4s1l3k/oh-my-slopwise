import { z } from "zod"

export const BCRYPT_MAX_PASSWORD_BYTES = 72

export function isPasswordWithinBcryptLimit(password: string): boolean {
  return new TextEncoder().encode(password).byteLength <= BCRYPT_MAX_PASSWORD_BYTES
}

export const credentialsAuthenticationSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z
    .string()
    .min(1)
    .refine(isPasswordWithinBcryptLimit),
}).strict()

export const registrationSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().min(1).max(100),
  password: z
    .string()
    .min(8, "Пароль минимум 8 символов")
    .refine(isPasswordWithinBcryptLimit, "Пароль должен занимать не больше 72 байт UTF-8"),
})
