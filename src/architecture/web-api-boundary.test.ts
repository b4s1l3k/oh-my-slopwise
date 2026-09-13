import { readdirSync, readFileSync } from "node:fs"
import { dirname, relative, resolve, sep } from "node:path"
import ts from "typescript"
import { describe, expect, it } from "vitest"

const projectRoot = resolve(import.meta.dirname, "../..")
const sourceRoot = resolve(projectRoot, "src")
const httpClientPath = "src/lib/api/client/http-client.ts"
const transportDtoPath = "src/lib/api/v1/response-dtos.ts"
const externalNetworkAdapters = new Set(["src/services/exchange.service.ts"])
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

function isHttpClientModule(sourcePath: string, importedModule: string): boolean {
  return withoutScriptExtension(resolvedModulePath(sourcePath, importedModule)) ===
    withoutScriptExtension(httpClientPath)
}

function isDomainApiClientModule(sourcePath: string, importedModule: string): boolean {
  return /^src\/lib\/api\/client\/[^/]+-api$/.test(
    withoutScriptExtension(resolvedModulePath(sourcePath, importedModule))
  )
}

function isTransportDtoModule(sourcePath: string, importedModule: string): boolean {
  return withoutScriptExtension(resolvedModulePath(sourcePath, importedModule)) ===
    withoutScriptExtension(transportDtoPath)
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
      if ((isUiModule || isFeatureHook) && isTransportDtoModule(path, importedModule)) {
        report(node, "UI and feature hooks must use view models instead of transport DTOs")
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
})
