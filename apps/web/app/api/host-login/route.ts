import { z } from "zod";
import { handle } from "@/lib/api";
import { logIn, logOut } from "@/lib/host-login";

const Input = z.union([z.object({ password: z.string().min(1).max(200) }), z.object({ logout: z.literal(true) })]);

export const POST = (req: Request) =>
  handle(async () => {
    const input = Input.parse(await req.json());
    await ("password" in input ? logIn(input.password) : logOut());
  });
