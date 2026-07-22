import { auth } from "@/lib/auth"
import { createExpenseSchema } from "@/lib/validations/expense"
import * as expensesService from "@/services/expenses.service"
import { handleServiceError } from "@/lib/api-errors"
import { NextResponse } from "next/server"

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const expense = await expensesService.getExpense(id, session.user.id)
  if (!expense) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ expense })
}

export async function PATCH(req: Request, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const parsed = createExpenseSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  try {
    const expense = await expensesService.updateExpense(id, session.user.id, parsed.data)
    return NextResponse.json({ expense })
  } catch (e) {
    return handleServiceError(e)
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  try {
    await expensesService.deleteExpense(id, session.user.id)
    return NextResponse.json({})
  } catch (e) {
    return handleServiceError(e)
  }
}
