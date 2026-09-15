import { readdirSync, readFileSync } from "node:fs"
import { dirname, relative, resolve, sep } from "node:path"
import ts from "typescript"
import { describe, expect, it } from "vitest"

const projectRoot = resolve(import.meta.dirname, "../..")
const sourceRoot = resolve(projectRoot, "src")
const httpClientPath = "src/lib/api/client/http-client.ts"
const transportContractModule = "@contract/v1"
const externalNetworkAdapters = new Set([
  "src/lib/auth/credentials-client.ts",
  "src/services/exchange.service.ts",
])
const reactQueryUiAdapters = new Set([
  "src/components/achievements/achievement-watcher.tsx",
  "src/components/providers.tsx",
])
const forbiddenNetworkIdentifiers = new Set([
  "fetch",
  "XMLHttpRequest",
  "EventSource",
  "WebSocket",
])
const forbiddenHttpPackages = new Set([
  "axios",
  "got",
  "ky",
  "node:http",
  "node:https",
  "ofetch",
  "superagent",
  "undici",
])
const forbiddenWebImportPrefixes = [
  "@/app/api",
  "@/lib/api/v1",
  "@/lib/api-errors",
  "@/lib/db",
  "@/lib/serializable-transaction",
  "@/lib/validations",
  "@/services",
  "@prisma/client",
  "bcryptjs",
]
const forbiddenBackendImportPrefixes = [
  "@/components",
  "@/hooks",
  "@/lib/api/client",
  "@/lib/api/view-models",
  "@/lib/forms",
]
const forbiddenLocalTransportTypeNames = new Set([
  "Achievement",
  "Debt",
  "Expense",
  "Feedback",
  "FriendBalance",
  "Group",
  "Member",
  "Profile",
  "Requisites",
  "UserResult",
])

type Violation = {
  file: string
  line: number
  message: string
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    if (
      !entry.isFile() ||
      !/\.[cm]?[jt]sx?$/.test(entry.name) ||
      /(?:\.test|\.d)\.[cm]?[jt]sx?$/.test(entry.name)
    ) {
      return []
    }
    return [path]
  })
}

function projectPath(path: string): string {
  return relative(projectRoot, path).split(sep).join("/")
}

function lineOf(source: ts.SourceFile, node: ts.Node): number {
  return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1
}

function scriptKind(path: string): ts.ScriptKind {
  if (/\.[jt]sx$/.test(path)) return ts.ScriptKind.TSX
  if (/\.[cm]?js$/.test(path)) return ts.ScriptKind.JS
  return ts.ScriptKind.TS
}

function withoutScriptExtension(path: string): string {
  return path.replace(/\.[cm]?[jt]sx?$/, "")
}

function resolvedModulePath(sourcePath: string, importedModule: string): string {
  if (importedModule.startsWith("@/")) return `src/${importedModule.slice(2)}`
  if (importedModule.startsWith(".")) {
    return projectPath(resolve(dirname(sourcePath), importedModule))
  }
  return importedModule
}

function resolvedSourceFile(
  sourcePath: string,
  importedModule: string,
  sourceSet: ReadonlySet<string>
): string | undefined {
  const unresolved = resolvedModulePath(sourcePath, importedModule)
  if (!unresolved.startsWith("src/")) return undefined
  const candidates = [
    unresolved,
    `${unresolved}.ts`,
    `${unresolved}.tsx`,
    `${unresolved}/index.ts`,
    `${unresolved}/index.tsx`,
  ]
  return candidates.find((candidate) => sourceSet.has(candidate))
}

function importedModules(path: string): string[] {
  const source = ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    scriptKind(path)
  )
  const modules: string[] = []
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      modules.push(node.moduleSpecifier.text)
    }
    if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      modules.push(node.moduleSpecifier.text)
    }
    if (
      ts.isCallExpression(node) &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0]) &&
      (
        node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require")
      )
    ) {
      modules.push(node.arguments[0].text)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return modules
}

function isHttpClientModule(sourcePath: string, importedModule: string): boolean {
  return withoutScriptExtension(resolvedModulePath(sourcePath, importedModule)) ===
    withoutScriptExtension(httpClientPath)
}

function isDomainApiClientModule(sourcePath: string, importedModule: string): boolean {
  return /^src\/lib\/api\/client\/[^/]+-api$/.test(
    withoutScriptExtension(resolvedModulePath(sourcePath, importedModule))
  )
}

function isTransportDtoModule(importedModule: string): boolean {
  return importedModule === transportContractModule ||
    importedModule.startsWith("@contract/")
}

function startsWithModule(importedModule: string, prefix: string): boolean {
  return importedModule === prefix || importedModule.startsWith(`${prefix}/`)
}

function isWebModule(file: string): boolean {
  return (
    (file.startsWith("src/app/") && !file.startsWith("src/app/api/")) ||
    file.startsWith("src/app/api/auth/") ||
    file.startsWith("src/components/") ||
    file.startsWith("src/hooks/") ||
    file === "src/lib/auth.ts" ||
    file === "src/lib/auth.config.ts" ||
    file.startsWith("src/lib/auth/") ||
    file.startsWith("src/lib/api/client/") ||
    file.startsWith("src/lib/api/view-models/") ||
    file.startsWith("src/lib/forms/")
  )
}

function isBackendModule(file: string): boolean {
  return (
    file.startsWith("src/app/api/v1/") ||
    file.startsWith("src/services/") ||
    file === "src/lib/db.ts" ||
    file === "src/lib/serializable-transaction.ts" ||
    file === "src/lib/api-errors.ts" ||
    file.startsWith("src/lib/api/v1/") ||
    file.startsWith("src/lib/validations/")
  )
}

function isForbiddenHttpPackage(importedModule: string): boolean {
  return [...forbiddenHttpPackages].some(
    (packageName) =>
      importedModule === packageName || importedModule.startsWith(`${packageName}/`)
  )
}

function isApiUrl(value: string): boolean {
  return /^(?:(?:https?:)?\/\/[^/]+)?\/api\/v1(?:[/?#]|$)/.test(value) ||
    /^api\/v1(?:[/?#]|$)/.test(value)
}

function inspectSource(path: string): Violation[] {
  const file = projectPath(path)
  const source = ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    scriptKind(path)
  )
  const violations: Violation[] = []
  const networkAllowed = file === httpClientPath || externalNetworkAdapters.has(file)
  const isUiModule = file.startsWith("src/components/") || /\/page\.[cm]?[jt]sx?$/.test(file)
  const isFeatureHook = file.startsWith("src/hooks/api/")
  const webModule = isWebModule(file)
  const backendModule = isBackendModule(file)
  const operationTypedClient =
    file.startsWith("src/lib/api/client/") ||
    file === "src/lib/auth/credentials-client.ts"

  const report = (node: ts.Node, message: string) => {
    violations.push({ file, line: lineOf(source, node), message })
  }
  const visit = (node: ts.Node) => {
    if (
      isUiModule &&
      (ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) &&
      forbiddenLocalTransportTypeNames.has(node.name.text)
    ) {
      report(
        node.name,
        `${node.name.text} must come from the view-model layer or be named as an explicit ViewModel`
      )
    }
    if (
      !networkAllowed &&
      ts.isIdentifier(node) &&
      forbiddenNetworkIdentifiers.has(node.text)
    ) {
      report(node, `direct ${node.text} access is forbidden`)
    }
    if (
      !networkAllowed &&
      ts.isStringLiteralLike(node) &&
      forbiddenNetworkIdentifiers.has(node.text)
    ) {
      report(node, `computed ${node.text} access is forbidden`)
    }
    if (
      ts.isStringLiteralLike(node) &&
      isApiUrl(node.text) &&
      file !== httpClientPath
    ) {
      report(node, "/api/v1 path is owned by http-client.ts")
    }
    const inspectImportedModule = (importedModule: string) => {
      if (importedModule.startsWith("@contract/") && importedModule !== transportContractModule) {
        report(node, `application code must import the contract facade, not ${importedModule}`)
      }
      if (
        webModule &&
        forbiddenWebImportPrefixes.some((prefix) => startsWithModule(importedModule, prefix))
      ) {
        report(node, `web code must not import backend module ${importedModule}`)
      }
      if (
        backendModule &&
        forbiddenBackendImportPrefixes.some((prefix) =>
          startsWithModule(importedModule, prefix)
        )
      ) {
        report(node, `backend code must not import web module ${importedModule}`)
      }
      if (!networkAllowed && isForbiddenHttpPackage(importedModule)) {
        report(node, `HTTP package ${importedModule} is forbidden outside an adapter`)
      }
      if (
        isHttpClientModule(path, importedModule) &&
        !file.startsWith("src/lib/api/client/")
      ) {
        report(node, "web code must import a domain API client, not http-client")
      }
      if (
        isDomainApiClientModule(path, importedModule) &&
        !file.startsWith("src/hooks/api/")
      ) {
        report(node, "domain API clients may only be imported by src/hooks/api")
      }
      if (
        importedModule === "@tanstack/react-query" &&
        (file.startsWith("src/app/") || file.startsWith("src/components/")) &&
        !reactQueryUiAdapters.has(file)
      ) {
        report(node, "pages and components must use src/hooks/api instead of React Query directly")
      }
      if ((isUiModule || isFeatureHook) && isTransportDtoModule(importedModule)) {
        report(node, "UI and feature hooks must use view models instead of transport DTOs")
      }
      if (
        operationTypedClient &&
        importedModule === transportContractModule &&
        ts.isImportDeclaration(node) &&
        node.importClause?.namedBindings &&
        ts.isNamedImports(node.importClause.namedBindings)
      ) {
        for (const element of node.importClause.namedBindings.elements) {
          const importedName = element.propertyName?.text ?? element.name.text
          if (
            importedName !== "ApiOperationRequest" &&
            importedName !== "ApiOperationResponse"
          ) {
            report(
              element,
              `API clients must derive transport types from operationId, not ${importedName}`
            )
          }
        }
      }
    }
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      inspectImportedModule(node.moduleSpecifier.text)
    }
    if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      inspectImportedModule(node.moduleSpecifier.text)
    }
    if (
      ts.isCallExpression(node) &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0]) &&
      (
        node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require")
      )
    ) {
      inspectImportedModule(node.arguments[0].text)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return violations
}

describe("web API boundary", () => {
  it("keeps backend HTTP access behind domain API clients", () => {
    const violations = sourceFiles(sourceRoot)
      .flatMap(inspectSource)
      .sort((left, right) =>
        `${left.file}:${left.line}`.localeCompare(`${right.file}:${right.line}`)
      )
    const message = violations
      .map(({ file, line, message: violation }) => `${file}:${line} — ${violation}`)
      .join("\n")

    expect(
      violations,
      [
        "Backend HTTP access must go through src/lib/api/client domain clients.",
        message,
      ].join("\n")
    ).toEqual([])
  })

  it("keeps backend modules outside the transitive web dependency graph", () => {
    const absoluteFiles = sourceFiles(sourceRoot)
    const projectFiles = absoluteFiles.map(projectPath)
    const sourceSet = new Set(projectFiles)
    const absoluteByProjectPath = new Map(
      absoluteFiles.map((path) => [projectPath(path), path])
    )
    const graph = new Map(projectFiles.map((file) => {
      const absolutePath = absoluteByProjectPath.get(file)
      if (!absolutePath) return [file, [] as string[]] as const
      const dependencies = importedModules(absolutePath)
        .map((module) => resolvedSourceFile(absolutePath, module, sourceSet))
        .filter((dependency): dependency is string => dependency !== undefined)
      return [file, dependencies] as const
    }))
    const violations: string[] = []

    for (const root of projectFiles.filter(isWebModule)) {
      const queue: Array<{ file: string; chain: string[] }> = [
        { file: root, chain: [root] },
      ]
      const visited = new Set<string>()
      while (queue.length > 0) {
        const current = queue.shift()
        if (!current || visited.has(current.file)) continue
        visited.add(current.file)
        for (const dependency of graph.get(current.file) ?? []) {
          const chain = [...current.chain, dependency]
          if (isBackendModule(dependency)) {
            violations.push(chain.join(" -> "))
            continue
          }
          queue.push({ file: dependency, chain })
        }
      }
    }

    expect(
      [...new Set(violations)].sort(),
      `Web dependency graph reaches backend modules:\n${violations.join("\n")}`
    ).toEqual([])
  })
})
