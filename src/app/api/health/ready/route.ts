import { NextResponse } from "next/server"
import { checkDatabaseReadiness } from "@/services/health.service"

export async function GET() {
  try {
    await checkDatabaseReadiness()
    return NextResponse.json(
      { status: "ok" },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch {
    return NextResponse.json(
      { status: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    )
  }
}
