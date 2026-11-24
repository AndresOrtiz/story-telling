import { ImageResponse } from "next/og";
import { GameError, snapshot } from "@cs/workflows";
import { handle } from "@/lib/api";

/** Profile card image. Visible to the group only after its owner shared it. */
export const GET = (_req: Request, { params }: { params: Promise<{ code: string; participantId: string }> }) =>
  handle(async (userId) => {
    const { code, participantId } = await params;
    const snap = await snapshot(code.toUpperCase(), userId);
    if ("limited" in snap) throw new GameError("forbidden", 403);
    const p = snap.analysis?.shared.find((x) => x.participantId === participantId);
    if (!p) throw new GameError("not_found", 404);
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: 64,
            color: "#f2efe6",
            background: "linear-gradient(140deg, #0b1214 40%, #5d4310)",
          }}
        >
          <div style={{ display: "flex", fontSize: 36, color: "#f0b445" }}>{p.nickname}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "flex", fontSize: 92 }}>{p.archetypeName}</div>
            <div style={{ display: "flex", fontSize: 30, color: "#c9d2d1" }}>{p.narrative.legacy}</div>
          </div>
          <div style={{ display: "flex", fontSize: 22, color: "#a9b6b5" }}>The Collective Story</div>
        </div>
      ),
      { width: 1200, height: 630 },
    );
  });
