import { z } from "zod";
import * as game from "@cs/workflows";
import { handle } from "@/lib/api";
import { assertHostLogin, mayHost } from "@/lib/host-login";

const id = z.uuid();
const HOST_ACTIONS = [
  "start",
  "continue_selection",
  "regenerate_universe",
  "lower_rating",
  "begin_story",
  "open_voting",
  "close_voting",
  "revote",
  "start_discussion",
  "extend_discussion",
  "confirm_unanimous",
  "open_final_vote",
  "close_final_vote",
  "next",
  "show_story",
  "finish",
  "pause",
  "resume",
  "abort",
  "skip_timer",
] as const satisfies readonly game.HostAction[];

const Command = z.discriminatedUnion("type", [
  z.object({ type: z.literal("heartbeat") }),
  z.object({
    type: z.literal("join"),
    nickname: z.string(),
    avatar: z.string().optional(),
    role: z.enum(["player", "spectator"]).optional(),
  }),
  z.object({ type: z.literal("recover"), seat: z.string().max(40) }),
  z.object({ type: z.literal("config"), config: z.record(z.string(), z.unknown()) }),
  z.object({ type: z.literal("host"), action: z.enum(HOST_ACTIONS), phase: z.string(), k: z.number() }),
  z.object({ type: z.enum(["kick", "approve", "cohost", "nudge"]), participantId: id }),
  z.object({ type: z.literal("rename"), participantId: id, nickname: z.string() }),
  z.object({ type: z.literal("lock"), locked: z.boolean() }),
  z.object({ type: z.literal("select"), selections: z.array(z.unknown()) }),
  z.object({ type: z.literal("vote"), vote: z.unknown() }),
  z.object({ type: z.literal("writein"), text: z.string().max(400) }),
  z.object({ type: z.literal("endorse"), id }),
  z.object({ type: z.literal("review"), id, ok: z.boolean() }),
  z.object({ type: z.literal("regenerate_dilemma") }),
  z.object({
    type: z.literal("edit_dilemma"),
    title: z.string().optional(),
    context: z.string().optional(),
    question: z.string().optional(),
  }),
  z.object({ type: z.literal("regenerate_image"), role: z.enum(["key_art", "dilemma"]) }),
  z.object({ type: z.literal("scene"), index: z.number(), autoAdvance: z.boolean().optional() }),
  z.object({ type: z.literal("share"), shared: z.boolean() }),
  z.object({ type: z.literal("share_profile"), shared: z.boolean() }),
  z.object({ type: z.literal("delete_me") }),
]);

/** Everything else needs the host login, so a new command is protected until it is listed here. */
const PLAYER_COMMANDS: ReadonlySet<string> = new Set<z.infer<typeof Command>["type"]>([
  "heartbeat",
  "join",
  "recover",
  "select",
  "vote",
  "writein",
  "endorse",
  "share_profile",
  "delete_me",
]);

export const POST = (req: Request, { params }: { params: Promise<{ code: string }> }) =>
  handle(async (user): Promise<unknown> => {
    const code = (await params).code.toUpperCase();
    const c = Command.parse(await req.json());
    // Co-hosts are not owners: they need no login, and the command itself checks them.
    if (!PLAYER_COMMANDS.has(c.type) && !(await mayHost()) && (await game.isOwner(code, user))) await assertHostLogin();
    switch (c.type) {
      case "heartbeat":
        return game.heartbeat(code, user);
      case "join":
        await game.join(code, user, c);
        return { ok: true };
      case "recover":
        return game.recoverSeat(code, user, c.seat);
      case "config":
        return game.updateConfig(code, user, c.config);
      case "host":
        return game.runHostAction(code, user, c.action, { phase: c.phase, k: c.k });
      case "kick":
      case "approve":
      case "cohost":
      case "nudge":
        return game.roomAction(code, user, { type: c.type, participantId: c.participantId });
      case "rename":
      case "lock":
        return game.roomAction(code, user, c);
      case "select":
        return game.saveSelections(code, user, c.selections);
      case "vote":
        return game.castVote(code, user, c.vote);
      case "writein":
        return game.proposeWriteIn(code, user, c.text);
      case "endorse":
        return game.endorseWriteIn(code, user, c.id);
      case "review":
        return game.reviewWriteIn(code, user, c.id, c.ok);
      case "regenerate_dilemma":
        return game.regenerateDilemma(code, user);
      case "edit_dilemma":
        return game.editDilemma(code, user, c);
      case "regenerate_image":
        return game.regenerateImage(code, user, c.role);
      case "scene":
        return game.setScene(code, user, c.index, c.autoAdvance);
      case "share":
        return { slug: await game.setShared(code, user, c.shared) };
      case "share_profile":
        return game.setProfileShared(code, user, c.shared);
      case "delete_me":
        return game.deleteMe(code, user);
    }
  });
