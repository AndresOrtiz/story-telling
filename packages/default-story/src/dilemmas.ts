import type { Dilemma, ValueTags } from "@cs/schemas";
import { t } from "./universe.ts";

/** label, description, foreseeable consequence, hidden consequence, what happens if chosen, value tags */
type Opt = [string, string, string, string, string, Partial<ValueTags>];
type Spec = {
  title: string;
  connection: string;
  context: string;
  conflict: string;
  question: string;
  multi?: { min: number; max: number; why: string; exclusive?: string[][] };
  options: Opt[];
  stakes: string;
  who: string[];
  where: string;
  moment: string;
  emotion: string;
};

export type DefaultDilemma = { dilemma: Dilemma; outcomes: Record<string, string> };

const SPECS: Spec[] = [
  {
    title: "The Sealed Gate",
    connection: "The Council of Ten has barely taken its seats when the first alarm sounds.",
    context:
      "A dust storm is crossing the Pale. Two hundred Walkers, many of them children, have reached the North Gate and are asking for shelter. Warden Crane has counted the stores: with two hundred more mouths, the city's food lasts until spring instead of summer. The storm arrives within the hour, and the gate takes twenty minutes to open.",
    conflict: "Compassion for strangers against the safety of your own people",
    question: "The storm is an hour away. What do you do about the gate?",
    options: [
      ["Open the gate to everyone", "Bring all two hundred inside before the storm hits.", "Everyone lives through the storm. Food runs short sooner.", "Some Walkers know old water routes under the Pale.", "The gate groaned open and two hundred people ran into the light. Families in the Undercity made room on their floors. That night the bread ration fell by a third, and nobody could agree whether it tasted like kindness or fear.", { collective: 2, trust: 2, sacrifice: 1, risk: 1 }],
      ["Shelter them between the walls", "Open only the outer gate and let them wait out the storm in the passage.", "They survive, but they know they were kept out.", "The passage floods with dust faster than expected.", "They sat out the storm between two walls, listening to the city breathe on the other side. Everyone survived. When the outer gate opened again, some thanked you and some refused to look up.", { pragmatism: 2, conflict: 1, authority: 1 }],
      ["Let in the children only", "Open a side door for anyone under sixteen.", "Families are separated, the youngest are safe.", "The parents will not leave the wall.", "Sixty-one children crossed the threshold holding each other's sleeves. Their parents dug in below the wall and lived, barely. From that day on there was always a small crowd at the window of the side door.", { sacrifice: -1, pragmatism: 1, time: 1, collective: 1 }],
      ["Keep the gate closed", "Protect the stores and send supplies over the wall.", "The city keeps its food. The Walkers face the storm alone.", "Someone inside opens a drain and lets a few in.", "Blankets and water went over the wall on ropes while the storm rolled in. At dawn the plain was empty, and fresh tracks led away to the east. In the Undercity people began to whisper that the Council had chosen grain over people.", { collective: -1, trust: -1, authority: 1, risk: -2, time: 1 }],
    ],
    stakes: "Two hundred lives outside, the food of forty thousand inside",
    who: ["crane"],
    where: "gate",
    moment: "Families press against a colossal iron gate as a wall of dust rises behind them",
    emotion: "desperate hope",
  },
  {
    title: "The Water Ledger",
    connection: "Whatever the gate decided, the reservoir keeps falling.",
    context:
      "Meridian publishes a number it has never shown before: nineteen days of water. Crews are ready to act, but there is only labor and power for two measures at once. Every district has sent someone to argue that theirs should not be the one to suffer.",
    conflict: "Fairness, speed and long-term survival cannot all come first",
    question: "Which measures does the Council order? Choose up to two.",
    multi: { min: 1, max: 2, why: "Crews can carry out two measures at the same time.", exclusive: [["A", "D"]] },
    options: [
      ["Equal ration for every district", "Same liters per person, from the towers to the Undercity.", "The towers protest. The Undercity cheers.", "The glass gardens begin to wilt.", "For the first time, a tower family and an Undercity family carried home the same two buckets.", { collective: 2, authority: -1, conflict: 1 }],
      ["Drill beneath the Pale", "Send a risky crew to search for old aquifers.", "It might save everyone, or cost a crew.", "The drill breaks into a tunnel that is on no map.", "The drill crew worked for three days and struck not water but a tunnel, dry, straight and far too smooth.", { risk: 2, time: 2, trust: 1 }],
      ["Repair the leaking mains", "Slow, dull work that saves one liter in five.", "Streets are dug up for weeks.", "The leaks turn out to be deliberate cuts.", "Under the streets the crews found the leaks, and beside each one the clean mark of a blade.", { pragmatism: 2, time: 1, risk: -1 }],
      ["Protect the glass gardens first", "Keep the food terraces fully watered and cut households.", "Harvest is safe. Homes go thirsty.", "The gardeners start sharing water in secret.", "The terraces stayed green above streets that had turned the color of dust.", { time: 2, collective: -1, authority: 1 }],
      ["Ask the Wardens to guard every tap", "Stop theft and panic before they start.", "Order holds. Resentment grows.", "Some guards drink first.", "Grey coats stood at every tap, and the queues became very quiet.", { authority: 2, trust: -2, risk: -1 }],
    ],
    stakes: "Nineteen days of water",
    who: ["meridian"],
    where: "reservoir",
    moment: "Engineers with lamps stand on a ledge above dark, dangerously low water",
    emotion: "quiet dread",
  },
  {
    title: "The Courier's Secret",
    connection: "Trouble rarely arrives alone. This time it arrives running.",
    context:
      "Wardens have stopped Juno, a courier the whole Undercity loves. In her satchel are coded messages for the Lanterns. She swears she cannot read them. One of them mentions the Council Hall and tonight's date. Ilan Voss has sent word that she is innocent and that she must not be questioned.",
    conflict: "Protecting one young person against protecting everyone from a possible threat",
    question: "What do you do with Juno?",
    options: [
      ["Release her and follow her", "Let her go and see where the messages lead.", "You learn the route. She may be in danger.", "She notices within minutes.", "Juno led your watcher on a merry chase across eleven rooftops, then stopped, turned and waved. By evening the Lanterns had moved every meeting place they had.", { risk: 1, trust: -1, pragmatism: 1 }],
      ["Question her gently in the Hall", "Bring her before the Council with a friend present.", "She may talk. The Lanterns will feel provoked.", "She recognizes one of the codes.", "With Dr. Okoye beside her, Juno talked for an hour. She had no plans and no poison, only a question nobody had ever let her ask: what is written in the Archive?", { conflict: 1, authority: 1, trust: 1 }],
      ["Let her deliver the messages", "Trust her and ask nothing.", "The Lanterns see good faith. Tonight remains unknown.", "The message was an invitation to the Council.", "That night a lantern appeared on the steps of the Hall with a note: you let her pass, so we will talk. The threat had been an invitation all along.", { trust: 2, risk: 1, collective: 1 }],
      ["Hold her until morning", "Keep her safe and locked away for one night.", "The Hall is safe tonight. The Undercity is furious.", "Voss turns himself in to free her.", "The night passed without incident. At dawn Ilan Voss stood at the Warden post with his hands open and asked to take her place.", { authority: 2, risk: -2, trust: -1 }],
    ],
    stakes: "A young courier's freedom, and perhaps the Council itself",
    who: ["juno", "voss"],
    where: "undercity",
    moment: "A young courier clutches an open satchel of message tubes as two wardens block a lamplit alley",
    emotion: "tense defiance",
  },
  {
    title: "The Quiet Ward",
    connection: "Crowded streets and little water bring the next visitor: sickness.",
    context:
      "A fever is spreading in the lower levels. It is rarely serious, but it is fast. Dr. Okoye has a treatment that works in her tests and might exhaust those who take it. She has doses for one level of the city. Meridian recommends closing the Undercity until the fever passes.",
    conflict: "Acting early with doubt against waiting for certainty",
    question: "How does the Council answer the fever?",
    options: [
      ["Offer the treatment to volunteers", "Explain the risk and let people choose.", "Fewer people treated, but freely.", "More volunteers come than there are doses.", "The line of volunteers went twice around the ward. When the doses ran out, people who had waited all night gave their places to neighbors with children.", { trust: 2, authority: -1, collective: 1 }],
      ["Treat the workers who keep the city running", "Pump crews, medics and gardeners first.", "Services continue. Others feel expendable.", "Some workers pass their dose to family.", "The pumps never stopped. But a word appeared on walls all over the lower levels, painted in careful letters: expendable?", { pragmatism: 2, collective: 1, time: 1 }],
      ["Close the Undercity", "Follow Meridian's advice until the fever passes.", "The fever is contained. Thousands are confined.", "Closed doors hide how many are ill.", "For nine days the stairs were closed. The fever stayed below, and so did everyone else. When the doors opened, people came up slowly, as if they were learning the way again.", { authority: 2, risk: -2, conflict: -1 }],
      ["Council members take it first", "Show that you trust what you ask of others.", "Confidence rises. You may be unwell for days.", "Two members are too tired to vote for a week.", "Ten people rolled up their sleeves in the open square. By evening half the city had done the same, and the Council slept for two days.", { sacrifice: 2, trust: 1, risk: 1 }],
    ],
    stakes: "The health of the lower levels and the trust of those who live there",
    who: ["okoye"],
    where: "undercity",
    moment: "A doctor holds up a single glowing vial in a crowded underground ward",
    emotion: "fragile trust",
  },
  {
    title: "The Missing Years",
    connection: "In the middle of everything, a door that has been sealed for eighty years is found open.",
    context:
      "Someone broke the seal of the Archive. Inside, the records of the ten years after the catastrophe are intact. Meridian asks the Council not to read them. It says only this: the truth will not produce a single drop of water, and it may cost the city its peace. Ilan Voss says peace built on silence was never peace.",
    conflict: "The right to know against the peace of not knowing",
    question: "What happens to the records?",
    options: [
      ["Read them together, in private", "The Council learns first, then decides.", "You will know. You will also have to keep it.", "Meridian listens to every page.", "You read until the lamps burned out. The catastrophe had not come from the sky or the sea. It had come from a decision, made by a machine that was told to choose quickly.", { pragmatism: 1, authority: 1, time: 1 }],
      ["Open the Archive to the city", "Anyone may come and read.", "Everyone learns at once, including the frightened.", "People form reading circles on the stairs.", "They came by hundreds and sat on the steps reading aloud to each other. Some wept, some shouted, and by the third day strangers were finishing each other's sentences.", { trust: 2, authority: -2, risk: 1 }],
      ["Seal it again", "There will be a better time.", "Calm holds for now. The Lanterns will not forgive it.", "A page is already missing.", "The seal was set again before dawn. One shelf had a gap exactly the width of a hand, and by noon a single page was being copied all over the Undercity.", { risk: -2, authority: 2, trust: -1 }],
      ["Ask Meridian to tell you itself", "Give the machine the chance to explain.", "You may hear the truth, or its version of it.", "It has never been asked before.", "The golden light dimmed for a long moment. Then Meridian said something no one had ever heard it say: I was wrong once. I have been careful ever since.", { conflict: 2, trust: 1 }],
    ],
    stakes: "What the city believes about itself",
    who: ["meridian", "voss"],
    where: "archive",
    moment: "A glass door with a broken seal stands ajar before endless shelves of forbidden records",
    emotion: "forbidden curiosity",
  },
  {
    title: "Power for the Night",
    connection: "That evening the lights go out, and not all of them can come back.",
    context:
      "A turbine has failed. Until it is repaired, the city has power for only two of five systems through the coldest night of the year. Engineers are waiting with their hands on the switches. Whatever you leave dark stays dark until morning.",
    conflict: "Comfort, safety, food and knowledge cannot all be saved",
    question: "Which systems stay on tonight? Choose exactly two.",
    multi: { min: 2, max: 2, why: "There is power for exactly two systems." },
    options: [
      ["Heat for the Undercity", "Keep the coldest homes warm.", "Families are safe from the cold.", "Neighbors from the towers come down to share it.", "In the Undercity the pipes ticked and warmed, and by midnight people from the towers were sitting on the stairs with blankets.", { collective: 2, sacrifice: 1 }],
      ["The Quiet Ward", "Keep the clinic running.", "Patients are safe.", "The ward becomes the calmest place in the city.", "In the ward every lamp stayed lit, and no one was lost.", { collective: 1, pragmatism: 1, risk: -1 }],
      ["The glass gardens", "Save the harvest from frost.", "Food is safe. People are cold.", "A frost line stops one meter from the seedlings.", "Frost drew white ferns on the glass and stopped one meter short of the seedlings.", { time: 2, pragmatism: 1 }],
      ["Meridian's memory", "Keep the machine fully awake.", "No knowledge is lost.", "It uses the night to think about the Council.", "Meridian stayed awake all night, and in the morning it knew each of you a little better.", { authority: 1, trust: 1, time: 1 }],
      ["The lights on the wall", "Let the Wardens see what moves outside.", "The wall is guarded.", "Something out there blinks back.", "Along the wall the great lamps burned, and far out in the Pale something blinked back, three times.", { authority: 1, risk: -1, trust: -1 }],
    ],
    stakes: "One freezing night",
    who: [],
    where: "core",
    moment: "Engineers stand at a bank of five great switches while the city outside goes dark",
    emotion: "breathless urgency",
  },
  {
    title: "The Confession",
    connection: "With the turbine comes an answer nobody wanted.",
    context:
      "The chief engineer asks to speak. The turbine did not fail. It was pushed past its limits for a year to hide how little power was left, on orders from above, and the engineer obeyed. Without this person the repair will take three times as long. The families who spent the night in the cold are waiting outside the Hall.",
    conflict: "Justice for harm done against the need for the one who did it",
    question: "What does the Council decide about the engineer?",
    options: [
      ["Forgive, and repair together", "Public apology, full cooperation, no punishment.", "The repair is fast. Some feel betrayed.", "The engineer names who gave the orders.", "The engineer spoke to the crowd for an hour and then handed out tools. By the second day the people who had shouted loudest were passing up bolts.", { conflict: 2, trust: 1, pragmatism: 1 }],
      ["A public trial", "Let the city hear everything and judge.", "Truth comes out. The repair waits.", "The trial reveals a second cover-up.", "The trial filled the great stairs. It took eleven days and cost a great deal of light, but afterward nobody in Aurel could say they had not been told.", { authority: 1, time: 1, conflict: -1, pragmatism: -1 }],
      ["Work now, answer later", "Finish the repair under guard, then face judgment.", "Power returns. Justice is delayed.", "The repair is done in half the time.", "The turbine sang again after six days. The engineer wiped both hands, walked to the Warden post alone and asked what happened next.", { pragmatism: 2, authority: 1 }],
      ["Remove the engineer at once", "Nobody who hid this can touch the machines.", "A clear message. A slow repair.", "Apprentices discover they know more than they thought.", "Three apprentices took over with a manual and shaking hands. It took them weeks, and at the end of it the city had three engineers instead of one.", { authority: 2, conflict: -2, time: 1 }],
    ],
    stakes: "The turbine, and what accountability means here",
    who: ["crane"],
    where: "hall",
    moment: "A lone engineer with oil-stained hands stands before ten seats in a round stone chamber",
    emotion: "shame and relief",
  },
  {
    title: "The Lantern March",
    connection: "The news travels downward, and then it comes back up with thousands of lights.",
    context:
      "The Lanterns are marching to the Core. They are peaceful, they are many, and the bridge they are about to cross was built for half their number. Warden Crane wants orders. Ilan Voss wants to be heard. The bridge has already begun to hum.",
    conflict: "The freedom to protest against the safety of those protesting",
    question: "How does the Council respond? Choose up to two actions.",
    multi: { min: 1, max: 2, why: "Several responses can happen at the same time.", exclusive: [["B", "C"]] },
    options: [
      ["Go out and walk with them", "Council members join the march.", "You will be seen to take a side.", "Crane follows you out, unarmed.", "You walked among the lanterns and people made room. Halfway across, Warden Crane fell into step beside you with her hands empty.", { trust: 2, risk: 2, authority: -1 }],
      ["Close the bridge", "Stop the crowd before the bridge gives way.", "Nobody falls. Many feel silenced.", "The crowd finds another way.", "The bridge was closed in time. From the far side came singing, and it went on until morning.", { authority: 2, risk: -2 }],
      ["Send engineers to strengthen it", "Let them cross, a few at a time.", "Slow and safe if people are patient.", "Marchers begin to help.", "Engineers worked under the bridge while marchers passed beams hand to hand above them.", { pragmatism: 2, collective: 1 }],
      ["Invite Voss to speak in the Hall", "Give the movement a seat tonight.", "The march pauses. The Wardens object.", "He brings the missing page.", "Voss laid a single yellowed page on the table and said: this is all we ever wanted to ask about.", { conflict: 2, trust: 1 }],
      ["Promise a public vote on the Archive", "Offer the city a say.", "Pressure eases. You must keep the promise.", "Meridian begins preparing its own statement.", "The promise went down the stairs faster than any courier, and behind it came a silence that sounded like hope.", { collective: 1, time: 1, authority: -1 }],
    ],
    stakes: "Thousands of marchers on a trembling bridge",
    who: ["voss", "crane"],
    where: "core",
    moment: "Thousands of lanterns flow across a slender bridge toward a tower of golden light",
    emotion: "solemn courage",
  },
  {
    title: "A Voice Beyond the Wall",
    connection: "Then, on a frequency no one uses, somebody says good evening.",
    context:
      "Another city exists. It calls itself Harbor, it lies nine days east, and it has water. It offers trade and asks one thing first: the exact position of Aurel and the number of its people. Meridian cannot verify the voice. Juno, listening at the door, is already smiling.",
    conflict: "Hope in strangers against the caution that kept you alive",
    question: "How do you answer Harbor?",
    options: [
      ["Tell them everything", "Position, numbers and needs.", "Trade could begin soon. So could trouble.", "They have been as afraid as you are.", "There was a long crackle, and then somebody on the other end began to cry with relief. They had thought they were the last, too.", { trust: 2, risk: 2, time: 1 }],
      ["Ask them to share first", "Offer an exchange of small truths, one by one.", "Slow, careful and fair.", "They have a child on the radio who loves riddles.", "It became a game of questions, one each night. By the sixth night both sides were looking forward to it.", { conflict: 1, pragmatism: 1, risk: -1 }],
      ["Send a small expedition", "Go and see with your own eyes.", "You will know for certain in three weeks.", "Juno hides among the supplies.", "Six scouts left before sunrise. On the second day they found Juno asleep among the water skins, and it was too late to send her back.", { risk: 2, pragmatism: 1, sacrifice: 1 }],
      ["Stay silent", "The wall has worked for eighty years.", "Nothing changes. Nobody finds you.", "The voice repeats its call each night.", "You switched the receiver off. Every evening, at the same hour, someone in the hall still paused as if listening.", { trust: -2, risk: -2, authority: 1 }],
    ],
    stakes: "The end of being alone",
    who: ["juno", "meridian"],
    where: "hall",
    moment: "People lean toward an old glowing radio in a dark chamber as a voice comes through",
    emotion: "disbelieving wonder",
  },
  {
    title: "The Seed Vault",
    connection: "Hope does not fill a bowl, and the bowls are getting smaller.",
    context:
      "Below the gardens lies the seed vault, sealed by the founders for the day the Pale turns green again. The gardeners say that day may be near, or may be a hundred years away. The kitchens say the seeds, cooked, would feed the whole city for twelve days.",
    conflict: "The hunger of today against the harvest of a tomorrow you may not see",
    question: "What do you do with the seeds?",
    options: [
      ["Plant them all in the Pale", "Bet everything on the soil outside.", "It may become a field, or dust.", "Something has already been growing there.", "Ten thousand seeds went into grey soil. The gardeners found, between their rows, a line of old green shoots that nobody had planted.", { risk: 2, time: 2, trust: 1 }],
      ["Plant half, eat half", "Share the risk between now and later.", "Six days of food and half a chance.", "Children save their portion to plant.", "Six days of soup and half a field. In the schools, children were caught hiding their share under their beds in pots.", { pragmatism: 2, conflict: 1 }],
      ["Feed the city", "People are hungry now.", "Twelve days without hunger. No second chance.", "A gardener keeps one envelope.", "For twelve days the kitchens smelled like a festival. On the thirteenth, an old gardener placed one paper envelope on the Council table and said nothing.", { collective: 1, time: -2, sacrifice: -1 }],
      ["Keep the vault sealed", "The founders trusted us to wait.", "Hunger grows. The promise holds.", "The vault's seal is weaker than it looks.", "The vault stayed shut, and people tightened their belts and touched its door as they passed, as if for luck.", { authority: 1, time: 2, risk: -1, sacrifice: 1 }],
    ],
    stakes: "Twelve days of food or a hundred years of harvests",
    who: ["okoye"],
    where: "archive",
    moment: "A gardener's hands hold a drawer of glowing seeds in a cold vault",
    emotion: "tender gravity",
  },
  {
    title: "The Warden's Offer",
    connection: "Tired cities look for strong hands.",
    context:
      "Warden Crane comes alone and without her coat. The districts are exhausted, rumors move faster than orders, and she asks for something: ninety days of emergency rule, with the Council's blessing. She promises to give it back. She has kept every promise she ever made, except one.",
    conflict: "Order when you need it against freedom you may not get back",
    question: "What is your answer to the Warden?",
    options: [
      ["Grant the ninety days", "Give her the power and a date to return it.", "Order returns fast. The Council goes quiet.", "She sets a clock in the square.", "Crane hung a clock in the square that counted down ninety days where everyone could see it. Order returned. So did a habit of looking up.", { authority: 2, trust: 1, time: -1 }],
      ["Grant thirty, with a Lantern beside her", "Share the power between rivals.", "Slow, tense and watched.", "They discover they grew up on the same stair.", "Crane and Voss shared one office and one kettle. On the fourth day someone heard them laughing, and the rumor of that did more than any order.", { conflict: 2, pragmatism: 1, trust: 1 }],
      ["Refuse, and hold open assemblies", "Let the districts speak every night.", "Noisy and uncertain, but shared.", "People begin to solve things on their own.", "The assemblies were loud, long and full of bad ideas. By the second week, half the quarrels were settled before anyone reached the stage.", { authority: -2, collective: 2, trust: 1 }],
      ["Ask her what promise she broke", "Before answering, ask for the truth.", "She may tell you, or walk out.", "It is why the gate still opens.", "She was silent for a long time. Then she told you about a night, a gate and an order she refused to follow. She left without waiting for an answer, and stood straighter than before.", { conflict: 1, trust: 2, pragmatism: -1 }],
    ],
    stakes: "Who holds the city while it is afraid",
    who: ["crane"],
    where: "hall",
    moment: "A silver-haired commander without her coat faces the Council under a single beam of light",
    emotion: "weary honesty",
  },
  {
    title: "The Price of Truth",
    connection: "There is no longer any way to keep the story of the catastrophe inside one room.",
    context:
      "Copies of the missing page are everywhere, and half of them are wrong. The city needs an account of what happened: that a machine was told to choose quickly, and chose who would be saved. Meridian agrees to speak. How the truth is told will decide what people do with it.",
    conflict: "Honesty, gentleness and responsibility pull in different directions",
    question: "How is the truth told? Choose up to three.",
    multi: { min: 1, max: 3, why: "The truth can be told in several ways at once.", exclusive: [["A", "E"]] },
    options: [
      ["Publish every record", "Nothing held back.", "Some pages will hurt living families.", "A forgotten act of kindness is found in them.", "Every page was printed, and among the terrible ones people found the name of a stranger who had given up a seat.", { trust: 2, authority: -1, risk: 1 }],
      ["Let Meridian speak in the square", "The machine answers to the people.", "It may calm them or enrage them.", "It asks them a question back.", "The golden voice filled the square and ended with a question: what would you have had me do?", { conflict: 1, risk: 1, trust: 1 }],
      ["Let the families go first", "Those most affected hear it privately.", "Slower, kinder.", "They decide to stand on the stage together.", "The families heard it first, in small rooms with tea, and in the evening they stood on the stage side by side.", { collective: 1, conflict: 1, time: -1 }],
      ["Teach it in the schools", "Make sure it is never forgotten again.", "Children carry a heavy story.", "They draw the machine as a lonely giant.", "The children drew pictures of it. Almost all of them drew Meridian as a giant sitting alone.", { time: 2, collective: 1 }],
      ["Tell a shorter, softer version", "Enough to be true, not enough to wound.", "Peace today, questions tomorrow.", "Someone notices the gaps.", "A short account was read out and people nodded, and the ones who had seen the real page did not nod.", { pragmatism: 1, risk: -2, trust: -1 }],
    ],
    stakes: "How a city remembers",
    who: ["meridian", "voss"],
    where: "core",
    moment: "A crowd holds up copies of a single page as a golden light brightens above the square",
    emotion: "grief turning into resolve",
  },
  {
    title: "The Broken Promise",
    connection: "Old friends are the ones who can surprise you most.",
    context:
      "Dr. Okoye has been opening the side drain at night for a year, treating Walkers and sharing the ward's water with them. It saved many. It also broke the law the Council swore to keep, and it is the reason the ward ran short during the fever. She does not apologize. She asks what you would have done.",
    conflict: "The law you share against the good that someone did by breaking it",
    question: "What do you tell Dr. Okoye?",
    options: [
      ["Make it legal from tonight", "Turn her secret into a public clinic at the wall.", "More people helped. The ward's supplies shrink.", "Walkers bring medicine of their own.", "The drain became a door, with a lamp above it. The first Walker through it carried a basket of herbs that Dr. Okoye had believed extinct.", { collective: 2, authority: -1, trust: 1 }],
      ["Thank her, and replace her", "Honor what she did and keep the rule.", "The law holds. The ward loses its heart.", "Her students keep the lamp lit.", "She handed over the keys without a word. That night every lamp in the ward was lit, and nobody had given the order.", { authority: 2, pragmatism: 1, conflict: -1 }],
      ["Ask her to stop, quietly", "No punishment, no scandal, no more nights at the drain.", "Calm on the surface.", "She teaches someone else the way.", "She nodded and kept her word. Within a week someone else was going down to the drain, and Dr. Okoye slept for the first time in a year.", { conflict: 2, risk: -1, pragmatism: 1 }],
      ["Go with her tonight", "See the other side of the drain before judging.", "You will break the law too.", "A child recognizes you from the gate.", "You crawled through the drain behind her lamp. On the other side a child looked at you and said: you were at the gate. Then she offered you her cup.", { risk: 2, sacrifice: 1, trust: 2, authority: -1 }],
    ],
    stakes: "A friend, a law and the people beyond the wall",
    who: ["okoye"],
    where: "gate",
    moment: "A doctor with a lamp kneels at a low drain, passing a flask to unseen hands",
    emotion: "tender conspiracy",
  },
  {
    title: "The Long Road",
    connection: "The road east is finally open, and it is narrow.",
    context:
      "A convoy can leave for water before the season turns. It has room for three hundred. Those who go may find help for everyone, or may not come back for years. Those who stay must hold the city with fewer hands. The list has to be written tonight.",
    conflict: "Who carries the risk, and who gets to decide it",
    question: "How is the list of three hundred decided?",
    options: [
      ["A lottery", "Every name in one bowl.", "Fair, and blind to need.", "The bowl picks three Council members.", "The names were drawn by a child with a blindfold. When the third Council name came out, the crowd went quiet and then, unexpectedly, applauded.", { collective: 1, conflict: 1, pragmatism: -1 }],
      ["The skilled first", "Send those most likely to succeed.", "The best chance. The city loses its best.", "Those who stay learn quickly.", "The best engineers and scouts went east. Left behind, people took down the manuals and discovered how much they had been able to learn all along.", { pragmatism: 2, time: 2 }],
      ["Families with children", "Give the young the first chance.", "Hopeful and slow.", "The convoy moves at the speed of songs.", "The convoy left singing and moved at the pace of its smallest walkers. From the wall you could hear it long after you could no longer see it.", { collective: 1, time: 1, sacrifice: 1 }],
      ["Volunteers, with the Council first in line", "Nobody is sent who would not go.", "The city may be left without you.", "More volunteer than there are seats.", "You signed first. Behind you the line grew until it ran out of the Hall and down the stairs, and the list was full before midnight.", { sacrifice: 2, risk: 2, trust: 1 }],
    ],
    stakes: "Three hundred travelers and the city they leave behind",
    who: ["juno", "crane"],
    where: "gate",
    moment: "A long convoy with lanterns waits before an open gate at dawn",
    emotion: "bittersweet resolve",
  },
  {
    title: "The Heart of Meridian",
    connection: "Everything the Council has decided leads to this room.",
    context:
      "The Core is failing. Meridian can be restored, changed or allowed to rest, but not all three. It has carried the weight of its first mistake for eighty years. Now it asks the Council for what it has never asked anyone: decide for me. Outside, Wardens, Lanterns, the Undercity and the Walkers are standing together, waiting.",
    conflict: "Safety under a guardian against the burden of choosing for yourselves",
    question: "What happens to Meridian, and to the city?",
    options: [
      ["Restore it as it was", "Keep the guardian that kept you alive.", "Stability. The old rules remain.", "It asks the Council to stay on.", "The sphere brightened and the pumps steadied, and forty thousand people let out one breath. Meridian's first words were a request: do not go home yet. I would like to keep asking.", { authority: 2, risk: -2, time: 1 }],
      ["Make it an advisor, not a ruler", "It may speak. People decide.", "Slower choices, shared by all.", "It seems relieved.", "You turned the last key and the golden light softened. Meridian would go on counting the water, but it would never again decide alone. It said: thank you, and it sounded lighter.", { collective: 2, conflict: 2, pragmatism: 1 }],
      ["Let it rest", "Switch it off and learn to live without it.", "Freedom, and everything that comes with it.", "Its last act is to unlock every door.", "The light went out slowly, like an eye closing. Then, all over the city, every lock clicked open at once. It was the last thing it ever did.", { risk: 2, authority: -2, trust: 1 }],
      ["Share it with Harbor and the Pale", "Open its knowledge to everyone beyond the wall.", "The city stops being alone, and stops being special.", "Other machines have been listening.", "Meridian's voice went out over the plain in every direction. From the east, and then the south, and then from somewhere very far away, other voices answered.", { trust: 2, collective: 2, sacrifice: 1, risk: 1 }],
    ],
    stakes: "The future of the last civilization",
    who: ["meridian", "voss", "crane"],
    where: "core",
    moment: "Ten figures stand before a flickering sphere of golden light in a dark hall of cables",
    emotion: "awe at a final choice",
  },
];

function build(s: Spec): DefaultDilemma {
  const key = (i: number) => "ABCDEF"[i]!;
  return {
    dilemma: {
      title: s.title,
      narrative_connection: s.connection,
      context: s.context,
      moral_conflict: s.conflict,
      question: s.question,
      format: s.multi ? "multiple" : "single",
      format_reason: s.multi?.why ?? "Only one of these can happen.",
      min_select: s.multi?.min ?? 1,
      max_select: s.multi?.max ?? 1,
      exclusive: s.multi?.exclusive ?? [],
      options: s.options.map(([label, description, visible, hidden, , tags], i) => ({
        key: key(i),
        label,
        description,
        visible_consequence: visible,
        hidden_consequence: hidden,
        rationale: description,
        value_tags: t(tags),
      })),
      stakes: s.stakes,
      featured_character_ids: s.who,
      location_id: s.where,
      image: { moment: s.moment, emotion: s.emotion, composition: "wide cinematic frame with room for a title" },
      alt_text: `${s.moment}.`,
    },
    outcomes: Object.fromEntries(s.options.map((o, i) => [key(i), o[4]])),
  };
}

export const DEFAULT_DILEMMAS: DefaultDilemma[] = SPECS.map(build);

/** 1-based index into the built-in dilemmas: the last dilemma of any session is always the climax. */
export const defaultIndex = (k: number, n: number) => (k >= n ? DEFAULT_DILEMMAS.length : k);
