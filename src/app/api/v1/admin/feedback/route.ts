import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { listFeedback } from "@/services/feedback.service"
import { handleServiceError } from "@/lib/api-errors"
import { toFeedbackListResponse } from "@/lib/api/v1/response-mappers"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  try {
    const feedbacks = await listFeedback()
    return NextResponse.json(toFeedbackListResponse(feedbacks))
  } catch (e) {
    return handleServiceError(e)
  }
}
