import { cpSync, existsSync, mkdirSync } from "node:fs"
import { resolve } from "node:path"

const standaloneRoot = resolve(".next/standalone")
const staticSource = resolve(".next/static")

if (!existsSync(resolve(standaloneRoot, "server.js"))) {
  throw new Error("Standalone server is missing. Run `npm run build` before production E2E.")
}
if (!existsSync(staticSource)) {
  throw new Error("Next.js static assets are missing. Run `npm run build` before production E2E.")
}

const staticDestination = resolve(standaloneRoot, ".next/static")
mkdirSync(resolve(standaloneRoot, ".next"), { recursive: true })
cpSync(staticSource, staticDestination, { recursive: true, force: true })

const publicSource = resolve("public")
if (existsSync(publicSource)) {
  cpSync(publicSource, resolve(standaloneRoot, "public"), { recursive: true, force: true })
}
