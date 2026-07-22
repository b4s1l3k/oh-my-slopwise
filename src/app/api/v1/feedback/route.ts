import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { feedbackSchema } from "@/lib/validations/feedback"
import { createFeedback } from "@/services/feedback.service"
import { handleServiceError } from "@/lib/api-errors"

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const parsed = feedbackSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  try {
    const feedback = await createFeedback(session.user.id, parsed.data.message)
    return NextResponse.json({ feedback }, { status: 201 })
  } catch (e) {
    return handleServiceError(e)
  }
}
