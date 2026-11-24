import { createSession } from "@cs/workflows";
import { handle } from "@/lib/api";

export const POST = (req: Request) => handle(async (userId) => createSession(userId, await req.json()));
