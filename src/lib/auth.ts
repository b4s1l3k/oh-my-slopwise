import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { prisma } from "./db"
import bcrypt from "bcryptjs"
import authConfig from "./auth.config"
import { isPasswordWithinBcryptLimit } from "@/lib/validations/auth"

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = typeof credentials?.email === "string"
          ? credentials.email.trim().toLowerCase()
          : credentials?.email
        const password = credentials?.password
        if (
          typeof email !== "string" ||
          typeof password !== "string" ||
          !email ||
          !password ||
          !isPasswordWithinBcryptLimit(password)
        ) {
          return null
        }

        const user = await prisma.user.findUnique({
          where: { email },
        })
        if (!user) return null

        const valid = await bcrypt.compare(
          password,
          user.passwordHash
        )
        if (!valid) return null

        const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase()
        const role = user.email.toLowerCase() === adminEmail ? "ADMIN" : "USER"
        return { id: user.id, email: user.email, name: user.name, image: user.avatarUrl, role }
      },
    }),
  ],
})
