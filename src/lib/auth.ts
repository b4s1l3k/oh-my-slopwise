import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { prisma } from "./db"
import bcrypt from "bcryptjs"
import authConfig from "./auth.config"

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        })
        if (!user) return null

        const valid = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash
        )
        if (!valid) return null

        const role = user.email === process.env.ADMIN_EMAIL ? "ADMIN" : "USER"
        return { id: user.id, email: user.email, name: user.name, image: user.avatarUrl, role }
      },
    }),
  ],
})
