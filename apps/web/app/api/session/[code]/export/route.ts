import { exportSession } from "@cs/workflows";
import { handle } from "@/lib/api";

export const GET = (_req: Request, { params }: { params: Promise<{ code: string }> }) =>
  handle(async (userId) => {
    const data = await exportSession((await params).code.toUpperCase(), userId);
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="session-${data.code}.json"`,
        "Cache-Control": "no-store",
      },
    });
  });
