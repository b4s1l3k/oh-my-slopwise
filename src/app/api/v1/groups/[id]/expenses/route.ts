import { auth } from "@/lib/auth"
import { createExpenseSchema } from "@/lib/validations/expense"
import * as expensesService from "@/services/expenses.service"
import { NextResponse } from "next/server"

type Params = { params: Promise<{ id: string }> }

export async function GET(req: Request, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: groupId } = await params
  const url = new URL(req.url)
  const page = Number(url.searchParams.get("page") ?? 1)

  try {
    const result = await expensesService.getGroupExpenses(groupId, page)
    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
}

export async function POST(req: Request, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: groupId } = await params
  const body = await req.json()
  const parsed = createExpenseSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  try {
    const expense = await expensesService.createExpense(groupId, session.user.id, parsed.data)
    return NextResponse.json({ expense }, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error"
    if (msg === "FORBIDDEN") return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
