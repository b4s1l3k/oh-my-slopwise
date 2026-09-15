import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { handleServiceError } from "@/lib/api-errors"
import { toAccountActivityPageResponse } from "@/lib/api/v1/response-mappers"
import * as activityService from "@/services/activity.service"

function pageSize(value: string | null): number {
  if (value === null) return activityService.DEFAULT_ACTIVITY_PAGE_SIZE
  if (!/^[1-9]\d*$/.test(value)) throw new Error("INVALID_PAGE_SIZE")

  const parsed = Number(value)
  if (
    !Number.isSafeInteger(parsed) ||
    parsed > activityService.MAX_ACTIVITY_PAGE_SIZE
  ) {
    throw new Error("INVALID_PAGE_SIZE")
  }
  return parsed
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url = new URL(req.url)
  try {
    const result = await activityService.getAccountActivity(
      session.user.id,
      url.searchParams.get("cursor"),
      pageSize(url.searchParams.get("limit"))
    )
    return NextResponse.json(toAccountActivityPageResponse(result))
  } catch (error) {
    return handleServiceError(error)
  }
}
