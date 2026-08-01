import type { NextAuthConfig } from "next-auth"

// Edge-safe session configuration. Database access and password verification
// stay in auth.ts and are never bundled into middleware.
const authConfig = {
  // The app runs behind the deployment reverse proxy. Credentials auth does
  // not use third-party callback hosts, so trusting the forwarded host is safe
  // and required by Auth.js in the standalone Docker image.
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id
        token.role = (user as { role?: string }).role ?? "USER"
      }
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
} satisfies NextAuthConfig

export default authConfig
