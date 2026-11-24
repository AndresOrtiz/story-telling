import type { Bible, BibleDiffOp, UniverseWithSpine } from "@cs/schemas";

export function createBible({ universe, spine }: UniverseWithSpine): Bible {
  return {
    universe,
    spine,
    characters: structuredClone(universe.characters),
    factions: structuredClone(universe.factions),
    locations: structuredClone(universe.locations),
    resources: Object.fromEntries(universe.resources.map((r) => [r.key, r.value])),
    threads: [{ id: "central", description: universe.central_conflict, status: "open" }],
    events: [],
    minority_echoes: [],
  };
}

export type DiffResult = { bible: Bible; rejected: { op: BibleDiffOp; reason: string }[] };

/** Applies a diff to canon. Contradicting operations are rejected one by one; universe.* is never touched. */
export function applyDiff(current: Bible, ops: BibleDiffOp[], k: number): DiffResult {
  const bible = structuredClone(current);
  const rejected: DiffResult["rejected"] = [];
  let added = 0;
  for (const op of ops) {
    const reject = (reason: string) => void rejected.push({ op, reason });
    switch (op.op) {
      case "update_character": {
        const c = bible.characters.find((x) => x.id === op.id);
        if (!c) reject("unknown_character");
        else if (c.status === "dead") reject("character_is_dead");
        else {
          c.status = op.status;
          if (op.note) c.relationships = `${c.relationships} ${op.note}`.trim().slice(-400);
        }
        break;
      }
      case "add_character":
        if (added >= 1) reject("one_new_character_per_turn");
        else if (!op.reason.trim()) reject("missing_reason");
        else if (bible.characters.some((x) => x.id === op.character.id || x.name === op.character.name)) {
          reject("duplicate_character");
        } else {
          bible.characters.push(op.character);
          added++;
        }
        break;
      case "set_resource":
        bible.resources[op.key] = op.value;
        break;
      case "update_faction": {
        const f = bible.factions.find((x) => x.id === op.id);
        if (!f) reject("unknown_faction");
        else f.attitude = Math.max(-3, Math.min(3, f.attitude + op.attitude_delta));
        break;
      }
      case "add_thread":
        if (bible.threads.some((t) => t.id === op.id)) reject("duplicate_thread");
        else bible.threads.push({ id: op.id, description: op.description, status: "open" });
        break;
      case "resolve_thread": {
        const t = bible.threads.find((x) => x.id === op.id);
        if (!t) reject("unknown_thread");
        else if (t.status === "resolved") reject("already_resolved");
        else {
          t.status = "resolved";
          t.description = `${t.description} Resolved: ${op.resolution}`;
        }
        break;
      }
      case "add_location":
        if (bible.locations.some((l) => l.id === op.location.id)) reject("duplicate_location");
        else bible.locations.push(op.location);
        break;
      case "add_event":
        bible.events.push({ k, summary: op.summary, impact: op.impact });
        break;
      case "add_minority_echo":
        bible.minority_echoes.push({ k, position: op.position, potential_return: op.potential_return });
        break;
    }
  }
  return { bible, rejected };
}
