import type { Persona, Universe, EndingFamily, ValueTags } from "@cs/schemas";

const none: ValueTags = {
  risk: 0,
  trust: 0,
  collective: 0,
  authority: 0,
  sacrifice: 0,
  conflict: 0,
  pragmatism: 0,
  time: 0,
};
export const t = (partial: Partial<ValueTags>): ValueTags => ({ ...none, ...partial });

const personas: Persona[] = [
  ["archivist", "the Archivist", "keeper of what the old world wrote down", "You know how earlier choices were recorded, and which were erased."],
  ["engineer", "the Engineer", "who keeps the pumps and lights alive", "Every promise made in this hall ends up as a load on your machines."],
  ["medic", "the Medic", "who has never turned anyone away", "You count the beds before you count the votes."],
  ["scout", "the Scout", "who has walked beyond the wall and back", "Only you remember how quiet it is out there."],
  ["gardener", "the Gardener", "who tends the last green terraces", "Seeds do not care about politics. They care about water."],
  ["teacher", "the Teacher", "who raises the children of the city", "Someone will have to explain this decision to them tomorrow."],
  ["mediator", "the Mediator", "who settles the quarrels of the markets", "Two people are rarely as far apart as they sound."],
  ["watcher", "the Watcher", "who guards the wall at night", "You have seen both sides of the gate from above."],
  ["musician", "the Musician", "who sings the news to the lower levels", "A song can carry what an order cannot."],
  ["cartographer", "the Cartographer", "who maps the changing streets", "Every map you draw is out of date by morning."],
].map(([id, name, role, monologue]) => ({
  id: id!,
  name: name!,
  role: role!,
  bond: "Chosen by lot to sit on the Council of Ten",
  monologue: monologue!,
}));

export const DEFAULT_UNIVERSE: Universe = {
  name: "The Last Civilization",
  logline: "Ten strangers must decide the future of the last city, while its guardian machine hides what happened to the world.",
  setting:
    "Generations after a global catastrophe, the remaining population lives behind the walls of Aurel, a tiered city of glass gardens, copper pipes and crowded lower levels. An artificial intelligence called Meridian balances the water, the power and the rules. Beyond the wall lies the Pale, a silent plain that nobody is supposed to cross.",
  inciting_situation:
    "The reservoirs are falling and Meridian can no longer balance the city alone. For the first time it asks people to decide: ten strangers, drawn by lot, become the Council of Ten.",
  central_conflict:
    "The city cannot keep everyone safe, free and informed at the same time. A hidden movement, the Lanterns, claims the government is lying about the catastrophe.",
  opening: [
    "When the world fell silent, a single city kept its lights on. They called it Aurel, and they told their children it was the last.",
    "For eighty years a machine named Meridian measured every drop of water and every hour of light, and nobody asked how it chose.",
    "Tonight the reservoirs are lower than they have ever been. Meridian has sent ten names to ten doors. Yours is one of them.",
  ],
  atmosphere: "Dystopian science fiction with a stubborn thread of hope",
  world_rules: [
    "Water and power are limited. Whatever one district gains, another loses.",
    "Meridian can advise and delay, but it cannot overrule the Council of Ten.",
    "Nobody has crossed the Pale and returned in a single day.",
    "Records from before the catastrophe are sealed in the Archive.",
  ],
  factions: [
    { id: "wardens", name: "The Wardens", goal: "Keep order inside the walls", attitude: 1 },
    { id: "lanterns", name: "The Lanterns", goal: "Uncover the truth about the catastrophe", attitude: 0 },
    { id: "undercity", name: "The Undercity", goal: "A fair share of water and light", attitude: 0 },
    { id: "outsiders", name: "The Walkers of the Pale", goal: "A safe place to stop walking", attitude: 0 },
  ],
  characters: [
    {
      id: "meridian",
      name: "Meridian",
      role: "The artificial intelligence that governs the city",
      motivation: "Preserve the city at any cost it can measure",
      secret: "It sealed the records because it once made a terrible mistake",
      status: "alive",
      relationships: "Trusted by the Wardens, feared by the Lanterns.",
      visual_descriptor: "a vast sphere of slow golden light suspended in a dark hall of cables",
    },
    {
      id: "crane",
      name: "Warden Ada Crane",
      role: "Commander of the wall",
      motivation: "Never again lose a district",
      secret: "She once opened the gate against orders",
      status: "alive",
      relationships: "Respects Dr. Okoye, distrusts Ilan Voss.",
      visual_descriptor: "a stern woman of sixty with cropped silver hair and a long grey coat",
    },
    {
      id: "voss",
      name: "Ilan Voss",
      role: "Voice of the Lanterns",
      motivation: "Prove that the city has been lied to",
      secret: "He used to repair Meridian's memory",
      status: "alive",
      relationships: "Protects Juno like family.",
      visual_descriptor: "a thin man of forty in a patched amber scarf, carrying a hand-made lantern",
    },
    {
      id: "okoye",
      name: "Dr. Sefa Okoye",
      role: "Head of the Quiet Ward",
      motivation: "Keep the lower levels healthy",
      secret: "She has been treating Walkers in secret",
      status: "alive",
      relationships: "Old friend of Warden Crane.",
      visual_descriptor: "a calm woman of fifty with braided hair and a faded white coat",
    },
    {
      id: "juno",
      name: "Juno",
      role: "Courier of the lower levels",
      motivation: "See what is beyond the wall",
      secret: "Carries messages she cannot read",
      status: "alive",
      relationships: "Trusts Ilan Voss, curious about the Council.",
      visual_descriptor: "a quick teenager with goggles on her forehead and a satchel full of tubes",
    },
  ],
  locations: [
    { id: "hall", name: "The Council Hall", description: "A round chamber with ten seats", visual_descriptor: "a round stone chamber with ten seats lit from above" },
    { id: "gate", name: "The North Gate", description: "The only gate that still opens", visual_descriptor: "a colossal iron gate in a wind-scoured wall" },
    { id: "undercity", name: "The Undercity", description: "Crowded lower levels", visual_descriptor: "stacked homes, hanging cables and warm lamps underground" },
    { id: "reservoir", name: "The Reservoir", description: "The city's water", visual_descriptor: "a cathedral-sized cistern with dark, low water" },
    { id: "archive", name: "The Archive", description: "Sealed records", visual_descriptor: "endless shelves behind a sealed glass door" },
    { id: "core", name: "The Core", description: "Where Meridian lives", visual_descriptor: "a dark hall of cables around a sphere of golden light" },
  ],
  resources: [
    { key: "water", value: "critical" },
    { key: "food", value: "low" },
    { key: "power", value: "unstable" },
    { key: "trust", value: "fragile" },
  ],
  visual_identity: {
    medium: "painterly cinematic illustration",
    palette: "deep teal shadows, warm amber light, muted stone",
    lighting: "low golden light through dust",
    motifs: "lanterns, copper pipes, tall walls, small human figures",
  },
  personas,
  inspiration: [
    { source: "Stories of survival", became: "A city where every drop of water is a decision" },
    { source: "Stories of loyalty and betrayal", became: "Wardens and Lanterns who both believe they protect the city" },
    { source: "Stories of hidden truth", became: "The sealed Archive and the silence of Meridian" },
    { source: "Stories of ordinary heroes", became: "Ten strangers chosen by lot" },
  ],
  key_art: {
    moment: "A lone walled city glows under a dark sky while ten small figures cross a bridge toward it",
    emotion: "awe and unease",
    composition: "wide shot, city in the upper third, figures small in the foreground",
  },
};

export const DEFAULT_ENDINGS: EndingFamily[] = [
  {
    id: "restoration",
    name: "Restoration",
    premise: "The city survives by holding together what it already had.",
    values: t({ authority: 2, collective: 1, risk: -2, pragmatism: 1 }),
  },
  {
    id: "transformation",
    name: "Transformation",
    premise: "The city opens itself and becomes something new.",
    values: t({ trust: 2, collective: 2, sacrifice: 1, time: 1, conflict: 1 }),
  },
  {
    id: "collapse_with_hope",
    name: "Collapse with hope",
    premise: "The old city falls, and its people carry a light out into the Pale.",
    values: t({ risk: 2, authority: -2, pragmatism: -1 }),
  },
];

export const ENDING_TEXT: Record<string, { headline: string; text: string }> = {
  restoration: {
    headline: "The lights stay on",
    text: "Aurel did not become a different city. It became a steadier one. The pumps were mended, the rules were rewritten in plain words, and the Council of Ten went home to streets that still had light. Some people missed what might have been. Most slept well.",
  },
  transformation: {
    headline: "The city opens",
    text: "One morning the North Gate opened and nobody gave the order to close it. Walkers came in, gardeners went out, and the wall slowly became a road. Aurel was no longer the last city. It was the first of something else.",
  },
  collapse_with_hope: {
    headline: "A light in the Pale",
    text: "The great machine fell quiet and the tall towers went dark, one window at a time. Nobody was left behind. They walked out together, ten lanterns at the front, and when they looked back the city seemed small. Ahead, very far away, another light answered.",
  },
};
