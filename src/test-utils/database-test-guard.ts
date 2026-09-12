const TEST_DATABASE_NAME_PATTERN = /(?:^|[_-])test(?:$|[_-])/i

function parsePostgresUrl(value: string, variableName: string): URL {
  let parsed: URL

  try {
    parsed = new URL(value)
  } catch {
    throw new Error(`${variableName} must be a valid PostgreSQL URL`)
  }

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error(`${variableName} must use the postgres or postgresql protocol`)
  }

  return parsed
}

function getDatabaseName(url: URL): string {
  return decodeURIComponent(url.pathname.replace(/^\//, ""))
}

function getDatabaseIdentity(url: URL): string {
  const port = url.port || "5432"
  return `${url.hostname.toLowerCase()}:${port}/${getDatabaseName(url)}`
}

export function requireSafeTestDatabaseUrl(
  testDatabaseUrl: string | undefined,
  applicationDatabaseUrl: string | undefined
): string {
  if (!testDatabaseUrl) {
    throw new Error(
      "RUN_DB_INTEGRATION_TESTS requires TEST_DATABASE_URL pointing to a dedicated test database"
    )
  }

  const parsedTestUrl = parsePostgresUrl(testDatabaseUrl, "TEST_DATABASE_URL")
  const testDatabaseName = getDatabaseName(parsedTestUrl)

  if (!TEST_DATABASE_NAME_PATTERN.test(testDatabaseName)) {
    throw new Error("TEST_DATABASE_URL database name must contain a standalone 'test' marker")
  }

  if (applicationDatabaseUrl) {
    const parsedApplicationUrl = parsePostgresUrl(applicationDatabaseUrl, "DATABASE_URL")
    if (getDatabaseIdentity(parsedTestUrl) === getDatabaseIdentity(parsedApplicationUrl)) {
      throw new Error("TEST_DATABASE_URL must not point to the application database")
    }
  }

  return testDatabaseUrl
}

export function deriveTestDatabaseUrl(applicationDatabaseUrl: string | undefined): string {
  if (!applicationDatabaseUrl) {
    throw new Error("DATABASE_URL or an explicit TEST_DATABASE_URL is required for DB tests")
  }

  const parsedApplicationUrl = parsePostgresUrl(applicationDatabaseUrl, "DATABASE_URL")
  const applicationDatabaseName = getDatabaseName(parsedApplicationUrl)

  if (!applicationDatabaseName) {
    throw new Error("DATABASE_URL must include a database name")
  }

  parsedApplicationUrl.pathname = `/${applicationDatabaseName}_test`
  return parsedApplicationUrl.toString()
}
