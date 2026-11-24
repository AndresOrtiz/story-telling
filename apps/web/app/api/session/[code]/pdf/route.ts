import { getTranslations } from "next-intl/server";
import { exportSession, GameError } from "@cs/workflows";
import { handle } from "@/lib/api";
import { renderStorybook } from "@/lib/storybook";

export const maxDuration = 60;

export const GET = (_req: Request, { params }: { params: Promise<{ code: string }> }) =>
  handle(async (userId) => {
    const data = await exportSession((await params).code.toUpperCase(), userId);
    if (!data.story) throw new GameError("no_story", 404);
    const t = await getTranslations("story");
    const pdf = await renderStorybook(data, {
      by: t("by", { names: data.story.credits.players.join(", ") }),
      inspiredBy: t("inspiredBy", { titles: data.story.credits.inspiredBy.join(", ") }),
      decisions: t("decisions"),
      aiNotice: t("aiNotice"),
    });
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="story-${data.code}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  });
