import { createSession } from "@cs/workflows";
import { handle } from "@/lib/api";
import { assertHostLogin } from "@/lib/host-login";

export const POST = (req: Request) => handle(async (userId) => {
    await assertHostLogin();
    return createSession(userId, await req.json());
  });
