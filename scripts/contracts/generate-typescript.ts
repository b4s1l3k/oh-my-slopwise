import { readFile, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import openapiTS, { astToString, COMMENT_HEADER } from "openapi-typescript"

async function main(): Promise<void> {
  const specUrl = new URL("../../contracts/openapi/v1.openapi.json", import.meta.url)
  const outputUrl = new URL(
    "../../contracts/generated/typescript/v1.generated.ts",
    import.meta.url
  )
  const checkOnly = process.argv.includes("--check")
  const ast = await openapiTS(specUrl)
  const generated = COMMENT_HEADER + astToString(ast)

  if (checkOnly) {
    const current = await readFile(outputUrl, "utf8").catch(() => "")
    if (current !== generated) {
      console.error(
        "Generated TypeScript contract is stale. Run: npm run contract:generate"
      )
      process.exitCode = 1
    }
    return
  }

  await writeFile(fileURLToPath(outputUrl), generated)
}

void main()
