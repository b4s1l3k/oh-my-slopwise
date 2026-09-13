export const E2E_FIXTURE_PROTOCOL_VERSION = 1 as const

export type E2eFixtureUser = {
  fixtureId: "admin" | "alice" | "bob" | "carol" | "outsider"
  email: string
  name: string
  password: string
  applicationRole?: "ADMIN"
  requisites?: {
    payeeName: string
    bankName: string
    payeeAccount: string
  }
}

export type ResetE2eFixtureRequest = {
  protocolVersion: typeof E2E_FIXTURE_PROTOCOL_VERSION
  operation: "reset-and-seed"
  fixtureSet: "default"
  users: E2eFixtureUser[]
}

export type E2eFixtureResponse = {
  protocolVersion: typeof E2E_FIXTURE_PROTOCOL_VERSION
  ok: boolean
  error?: {
    code: string
    message?: string
  }
}

export const DEFAULT_E2E_FIXTURE: ResetE2eFixtureRequest = {
  protocolVersion: E2E_FIXTURE_PROTOCOL_VERSION,
  operation: "reset-and-seed",
  fixtureSet: "default",
  users: [
    {
      fixtureId: "admin",
      email: "admin.e2e@example.com",
      name: "Админ E2E",
      password: "E2e-password-123",
      applicationRole: "ADMIN",
      requisites: {
        payeeName: "Админ Тестовый",
        bankName: "Тест Банк",
        payeeAccount: "+79990000001",
      },
    },
    {
      fixtureId: "alice",
      email: "alice.e2e@example.com",
      name: "Алиса E2E",
      password: "E2e-password-123",
      requisites: {
        payeeName: "Алиса Тестовая",
        bankName: "Альфа Тест",
        payeeAccount: "+79990000002",
      },
    },
    {
      fixtureId: "bob",
      email: "bob.e2e@example.com",
      name: "Боб E2E",
      password: "E2e-password-123",
      requisites: {
        payeeName: "Боб Тестовый",
        bankName: "Бета Тест",
        payeeAccount: "+79990000003",
      },
    },
    {
      fixtureId: "carol",
      email: "carol.e2e@example.com",
      name: "Карина E2E",
      password: "E2e-password-123",
    },
    {
      fixtureId: "outsider",
      email: "outsider.e2e@example.com",
      name: "Внешний E2E",
      password: "E2e-password-123",
    },
  ],
}
