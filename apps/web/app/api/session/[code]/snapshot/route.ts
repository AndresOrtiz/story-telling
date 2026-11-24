import type { NextRequest } from "next/server";
import { snapshot } from "@cs/workflows";
import { handle } from "@/lib/api";

export const dynamic = "force-dynamic";

export const GET = (req: NextRequest, { params }: { params: Promise<{ code: string }> }) =>
  handle(async (userId) => {
    const known = Number(req.nextUrl.searchParams.get("v")) || undefined;
    return snapshot((await params).code.toUpperCase(), userId, req.nextUrl.searchParams.get("t"), known);
  });
