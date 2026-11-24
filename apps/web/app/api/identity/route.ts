import { NextResponse } from "next/server";
import { authMode, getUserId, issueCookieIdentity } from "@/lib/identity";

export async function GET() {
  return NextResponse.json({ mode: authMode(), known: Boolean(await getUserId()) });
}

export async function POST() {
  await issueCookieIdentity();
  return NextResponse.json({ ok: true });
}
