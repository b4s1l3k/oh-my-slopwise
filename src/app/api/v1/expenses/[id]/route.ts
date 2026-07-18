import { auth } from "@/lib/auth"
import * as expensesService from "@/services/expenses.service"
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

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  try {
    await expensesService.deleteExpense(id, session.user.id)
    return NextResponse.json({})
  } catch (e) {
    const msg = e instanceof Error ? e.message : ""
    if (msg === "FORBIDDEN") return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (msg === "NOT_FOUND") return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ error: "Error" }, { status: 500 })
  }
}
