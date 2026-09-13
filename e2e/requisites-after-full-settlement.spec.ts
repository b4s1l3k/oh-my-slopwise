import { expect, test, type Page } from "@playwright/test"
import {
  apiJson,
  authenticatedContext,
  createExpense,
  createGroup,
  userId,
  users,
} from "./helpers"

type RequisitesMember = {
  userId: string
  payeeName: string | null
  bankName: string | null
  payeeAccount: string | null
  user: {
    payeeName: string | null
    bankName: string | null
    payeeAccount: string | null
  }
}

async function memberView(page: Page, groupId: string, userId: string) {
  const response = await apiJson<{ group: { members: RequisitesMember[] } }>(
    page,
    `/api/v1/groups/${groupId}`
  )
  const member = response.group.members.find((candidate) => candidate.userId === userId)
  expect(member).toBeDefined()
  return member!
}

test.describe("requisites after full settlement", () => {
  test("removes creditor requisites from debtor API and UI after the debt reaches zero", async ({
    browser,
  }) => {
    const aliceContext = await authenticatedContext(browser, users.alice)
    const alicePage = aliceContext.pages()[0]
    const aliceId = (await apiJson<{ user: { id: string } }>(alicePage, "/api/v1/users/me")).user.id
    const bobId = await userId(alicePage, "Боб")
    const groupId = await createGroup(alicePage, {
      name: "Requisites Full Settlement E2E",
      memberIds: [bobId],
    })
    await createExpense(alicePage, groupId, {
      title: "Debt exposing requisites",
      amount: 2_000,
      currency: "RUB",
      date: "2026-09-13",
      paidById: aliceId,
      splitType: "EXACT",
      splits: [
        { userId: aliceId, amount: 1_000 },
        { userId: bobId, amount: 1_000 },
      ],
    })

    const bobContext = await authenticatedContext(browser, users.bob)
    const bobPage = bobContext.pages()[0]
    expect(await memberView(bobPage, groupId, aliceId)).toMatchObject({
      payeeName: null,
      bankName: null,
      payeeAccount: null,
      user: {
        payeeName: "Алиса Тестовая",
        bankName: "Альфа Тест",
        payeeAccount: "+79990000002",
      },
    })

    await bobPage.goto(`/groups/${groupId}`)
    await bobPage.getByRole("button", { name: "Оплатить" }).click()
    await expect(bobPage.getByRole("dialog").getByText("+79990000002", { exact: true })).toBeVisible()

    await apiJson(bobPage, "/api/v1/settlements", {
      method: "POST",
      expectedStatus: 201,
      body: {
        groupId,
        toUserId: aliceId,
        amount: 1_000,
        currency: "RUB",
        date: "2026-09-13",
      },
    })

    expect(await memberView(bobPage, groupId, aliceId)).toMatchObject({
      payeeName: null,
      bankName: null,
      payeeAccount: null,
      user: { payeeName: null, bankName: null, payeeAccount: null },
    })

    await bobPage.goto(`/groups/${groupId}`)
    await expect(bobPage.getByText("Все расчёты завершены!", { exact: true })).toBeVisible()
    await expect(bobPage.getByRole("button", { name: "Оплатить" })).toHaveCount(0)
    await expect(bobPage.getByText("+79990000002", { exact: true })).toHaveCount(0)

    await bobContext.close()
    await aliceContext.close()
  })
})
