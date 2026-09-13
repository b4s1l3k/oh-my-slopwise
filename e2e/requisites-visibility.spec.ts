import { expect, test } from "@playwright/test"
import { apiJson, authenticatedContext, createExpense, createGroup, userId, users } from "./helpers"

test.describe("payment requisites visibility", () => {
  test("shows requisites only to the owner and their debtor", async ({ browser }) => {
    const aliceContext = await authenticatedContext(browser, users.alice)
    const alicePage = aliceContext.pages()[0]
    const aliceId = (await apiJson<{ user: { id: string } }>(alicePage, "/api/v1/users/me")).user.id
    const bobId = await userId(alicePage, "Боб")
    const carolId = await userId(alicePage, "Карина")
    const groupId = await createGroup(alicePage, {
      name: "Requisites Visibility E2E",
      memberIds: [bobId, carolId],
    })
    await createExpense(alicePage, groupId, {
      title: "Bob owes Alice",
      amount: 2_000,
      currency: "RUB",
      date: "2026-09-13",
      paidById: aliceId,
      splitType: "EXACT",
      splits: [{ userId: aliceId, amount: 1_000 }, { userId: bobId, amount: 1_000 }],
    })

    const bobContext = await authenticatedContext(browser, users.bob)
    const bobPage = bobContext.pages()[0]
    const bobView = await apiJson<{
      group: { members: Array<{ userId: string; user: { payeeAccount?: string | null } }> }
    }>(bobPage, `/api/v1/groups/${groupId}`)
    expect(bobView.group.members.find((member) => member.userId === aliceId)?.user.payeeAccount)
      .toBe("+79990000002")

    const carolContext = await authenticatedContext(browser, users.carol)
    const carolPage = carolContext.pages()[0]
    const carolView = await apiJson<{
      group: { members: Array<{ userId: string; user: { payeeAccount?: string | null } }> }
    }>(carolPage, `/api/v1/groups/${groupId}`)
    expect(carolView.group.members.find((member) => member.userId === aliceId)?.user.payeeAccount)
      .toBeNull()

    await carolContext.close()
    await bobContext.close()
    await aliceContext.close()
  })
})
