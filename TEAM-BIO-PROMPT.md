# NBA Trade Mapper — Team Bio System

## What this is

A system for creating fictional staff bios for the `/team` page at NBA Trade Mapper. 20 characters. Each one a portrait, not a job description.

Before writing, read Clemons's bio in `src/app/team/page.tsx`. That's the model. Then read the rest of the team page to know what's already there.

Do NOT load `/mw`, the creative writing voice reference, Mazin, or other writing system documents for bios. Those are for essays. Bios have their own voice — closer to sportswriting than to cultural criticism. Loading multiple reference documents creates principle-overload and produces text that demonstrates awareness of craft without being good.

## The Clemons Model

Darius Clemons is the benchmark. Not a test to pass — the thing to internalize. Read his bio and understand what it actually does:

Every sentence is a fact. The facts accumulate in one direction (insignificance). The narrator never interprets, never winks, never explains the joke. The humor is in the gap between the precision of the record-keeping and the smallness of what's being recorded. The reader does all the work. "His name appeared between two semicolons on the ESPN transaction wire" — one image, no commentary, and it's the best sentence on the page.

The bio never mentions Trade Mapper. The job is in the title. The bio is the person.

**Why Clemons works and most attempts to replicate it don't:** Clemons has rich narrative material — an NBA career with specific teams, specific stats, specific moments. The facts feel real because they have the texture of things that could be looked up. When a character doesn't have that kind of inherent material, the AI compensates with narrator interpretation ("He does not find the distinction interesting. He finds it obvious") or manufactured philosophical details ("The email did not say the chart was good. It said the chart should have been designed to survive what was going to happen to it"). Both are recognizable as AI writing. The fix is not better narration — it's richer raw material from the writer.

## Character Intake: The 6 Questions

The writer provides the person. The AI provides the prose. This is not optional — it's the difference between a portrait and a generated detail sheet.

Before writing any bio, the writer (Michael) fills in these 6 questions. Short answers are fine. A few sentences each. The specificity of the answers determines the quality of the bio.

### 1. Where are they from?
Specific place, specific previous job, specific world. Not "she was a journalist" — the Pacers beat for the Indianapolis Star-Tribune. Not "he sold cars" — Hondas on Route 22 in Union. Not "he did social media" — carousel posts for a sparkling water brand in Los Angeles. The more granular the answer, the more the bio will feel like a person and not a character sheet.

### 2. What's the one story?
The moment or sequence this bio is ABOUT. Not their career arc — the thing that happened. Every strong bio has one:
- Torretti searched the trade that ended his career. The scoring engine had graded it an F.
- Massey emailed a rebuttal with "algorithm" misspelled in the subject line. Most of it was wrong. Buried on page two was a real insight.
- Katz won a Kevin Durant rookie card at Congregation Beth Shalom's trivia bowl in 2007, the last season the Sonics played in Seattle.

If there's no story yet, that's OK — say so. A bio without a story needs to be short (like Balaban: three sentences, all facts). Don't pad with narrator philosophy.

### 3. What do only they have or do?
The object, habit, or practice that stops working if you move it to another character. This is the genetically engineered detail:
- Gershon's framed printout of Article VII, Section 6. Nobody has asked him about it. He is waiting.
- Massey's Google Doc titled "Optimum Outage Log" — fourteen timestamps, no analysis.
- Otero's 21-day holographic gradient that everyone said was fine after two days.

### 4. What's their blind spot or refusal?
Something they're wrong about, won't do, or insist on unreasonably:
- Massey counts LeBron going west as a correct prediction.
- Xu refused to assign letter grades on principle. She was overruled.
- Katz does not discuss Oklahoma City.
- Oshiro has never read a trade analysis to the end.

### 5. What makes them human?
A small fact, delivered at the same register as everything else, that shifts the weight. Not a dramatic reveal — the narrator doesn't announce it:
- Carlisle quit medical devices to start a show for an audience he didn't have yet.
- Tran's parents have asked about the degree three times.
- Massey left selling Hondas for a radio slot that paid $340 a week.

## How to write the bio

Once the 6 questions are answered:

**Present facts.** Not interpretation, not philosophy, not the narrator's opinion about the character. Facts. What happened, what they did, what they have. When two facts create a gap — a prediction next to its outcome, a skill next to an absurd employer — the gap IS the writing.

**Don't write to a checklist.** "Belief system check, genetically engineered detail check, soft spot check" produces text that demonstrates awareness of craft without being good. The answers to the 6 questions give you the raw material. Shape it. Don't audit it against criteria while writing.

**Let the length match the material.** If the answers are rich (Massey: Newark, uncle Manny, radio, wrong predictions, Dunkin' Donuts, Optimum log, the email), the bio can be long. If the answers are thin, write three sentences like Balaban, not four paragraphs of padding. Short and real beats long and generated.

**One bio at a time. Full attention.** Don't write multiple bios in one pass. Each one needs to find its own mode — its own structure, opening, closer, paragraph count, rhythm. Writing them in batch produces pattern repetition the reader sees by the third bio.

## What goes wrong

These are the failure modes discovered through iteration. They're worth naming because each one feels like writing while you're doing it.

**Narrator philosophy.** "He does not find the distinction interesting. He finds it obvious." The narrator tells you what the character thinks instead of presenting facts that let you see it. Clemons never has the narrator explain what Clemons thinks. The facts show it.

**Manufactured details.** When the raw material is thin, the AI generates plausible-sounding specifics (CPG engagement rates, industry benchmarks, hypothetical chains of events). These feel generated because they are. The fix is richer raw material from the writer, not more detailed fabrication.

**The correction move.** "The email included a mockup. The mockup was better." / "Not things he liked, things that moved." / "He does not find the distinction interesting. He finds it obvious." Setup → correction. Used once, it works. Used three times in one bio, it's a machine.

**Process narration.** "Someone screenshotted it. Someone else cropped it. A third account reposted it." The narrator constructing a hypothetical scenario to illustrate the character's worldview. This is an essay move, not a bio move. Bios present facts about the person, not fictional demonstrations of how they see.

**Explaining the joke.** Any sentence where the narrator closes the gap that two facts opened. If the gap between "career high of 8 points" and "Hawks lost by 31" is funny, it's because the reader connected them. A sentence explaining WHY it's funny kills it.

**Writing to the rubric.** "Does this pass the Clemons test? Is there a belief system? Is the genetically engineered detail genetic enough?" This audit loop produces self-conscious text. Write from the material, assess after.

## Assessing a bio

After writing, three questions:

1. **Is every sentence a fact?** Not interpretation, not narrator philosophy. Could each sentence appear in a scouting report, a personnel file, or a news article? If the narrator is explaining what the character thinks or believes, the sentence isn't a fact.

2. **Do the facts go in one direction?** Read the bio and name the direction. If you can't, the facts are scattered. If you can, it's probably working.

3. **Would this bio survive on the page next to Clemons?** Not "is it as good as Clemons" — that's a high bar. But does it feel like it belongs in the same world? Same register, same narrator distance, same trust in the reader?

## Technical notes

- Bios are stored in the `team` array in `src/app/team/page.tsx`
- Multi-paragraph bios use `\n\n` in template literal strings — the component splits and renders each as a `<p>`
- Images go in `public/images/team/` as lowercase-kebab-case PNGs
- Characters without images: omit the `image` field
- Build: `npm run build` from the project root
- The `stats` field renders in monospace below the bio — use for compressed career facts, parenthetical commentary
