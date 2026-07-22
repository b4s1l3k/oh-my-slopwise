import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { prisma } from "./db"
import bcrypt from "bcryptjs"

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
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
  callbacks: {
    jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id
        token.role = (user as { role?: string }).role ?? "USER"
      }
      // useSession().update({ name }) → освежаем имя в токене без перелогина
      if (trigger === "update" && typeof session?.name === "string" && session.name) {
        token.name = session.name
      }
      return token
    },
    session({ session, token }) {
      if (token.id) session.user.id = token.id as string
      if (typeof token.name === "string") session.user.name = token.name
      if (token.role) session.user.role = token.role as string
      return session
    },
  },
})
