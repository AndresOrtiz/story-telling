import "server-only";
import { after, NextResponse } from "next/server";
import { ZodError } from "zod";
import { GameError, setBackground } from "@cs/workflows";
import { getUserId } from "./identity";

// Inline jobs keep running after the response was sent.
setBackground((work) => {
  try {
    after(work);
  } catch {
    void work();
  }
});

export async function handle(run: (userId: string) => Promise<unknown>): Promise<Response> {
  try {
    const userId = await getUserId();
    if (!userId) return NextResponse.json({ error: "no_identity" }, { status: 401 });
    const out = await run(userId);
    return out instanceof Response ? out : NextResponse.json(out ?? { ok: true });
  } catch (e) {
    if (e instanceof GameError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof ZodError || e instanceof SyntaxError) {
      return NextResponse.json({ error: "bad_input" }, { status: 400 });
    }
    console.error(e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
