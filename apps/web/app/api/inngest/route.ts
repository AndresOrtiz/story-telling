import { serve } from "inngest/next";
import type { NextRequest } from "next/server";
import { isFake } from "@cs/db";
import { functions, inngest } from "@cs/workflows";

export const maxDuration = 300;
const handlers = serve({ client: inngest, functions });

/** Closed unless Inngest is configured, so nobody can trigger jobs from outside. */
const enabled = () => process.env.INNGEST_DEV === "1" || !isFake(process.env.INNGEST_SIGNING_KEY);
const off = () => new Response("Inngest is not configured", { status: 404 });

export const GET = (req: NextRequest, ctx: unknown) => (enabled() ? handlers.GET(req, ctx) : off());
export const POST = (req: NextRequest, ctx: unknown) => (enabled() ? handlers.POST(req, ctx) : off());
export const PUT = (req: NextRequest, ctx: unknown) => (enabled() ? handlers.PUT(req, ctx) : off());
