# Demo script · Microsoft-Decision-1

🇪🇸 [Leer en español](DEMO-SCRIPT.es.md)

A guide to presenting the demo in about 25–35 minutes, depending on the cases you go through, plus 10–12 more minutes if you show the second tab. There are two tabs at the top: **⚡ Microsoft-Decision-1**, with six text cases and the Lab, and **🖼️ OpenAI Decisions API**, with five cases that also decide on images and documents. The `T` key switches between them. In both, the web app has three panels: on the left you pick the page, in the center the demo runs live, and on the right are the notes the audience sees (challenge, solution, result and savings). At the top right, a flag selector switches the whole demo between Spanish and English, and next to it the 🎨 button dresses it in the client's logo, colors and typography. This script adds what isn't on screen: what to click, what to say and how to answer common questions.

The brands on screen are fictitious so the same demo works for any client in the industry: Nexa Energía, Brisa Hotels & Resorts and Alisio Travel Group in the first tab, and Northwind Hogar, Fabrikam and Contoso Viajes in the second. The photos, receipts, creatives and contracts in the second tab are synthetic. The header, on the other hand, can carry the real brand of the client you're presenting to (step 6 of “The day before”).

## Before you present

**The day before**

1. Generate the link with the access code from the repository folder:

   ```bash
   echo "$(azd env get-value WEB_URL)/?code=$(azd env get-value DEMO_ACCESS_CODE)"
   ```

2. Open it on the same computer and browser you'll present with. The code is stored in the browser and disappears from the address bar, so it won't show when you project.
3. Go through the six cases (the spacebar in each one; in case 6, let a short match run at ×2) and start a race (the C key) in one of cases 1 to 5 to check that the comparison models respond.
4. If you're going to show the second tab, press `T` and go through its five cases: in case 1, “⏩ Resolve all”; in the others, `Space`. If you plan to upload your own photo in case 4, try it out too.
5. Choose the presentation language with the flags in the top-right corner, or add `&lang=en` to the link. The web app remembers your choice. Switching languages keeps the results of cases 1 to 5 and pauses a case 6 match in progress (it continues with “Resume”), although it's easiest to choose before you start. In the second tab, however, switching languages clears the results. If you're presenting in English, run through the cases in English: the Spanish examples are translated, and the other languages stay as they are.
6. If you're presenting to a specific client, click 🎨 in the header: drag their logo into the dialog (or copy it from their website and paste it with ⌘V or Ctrl+V), type their name, and pick their three colors and their typeface. The colors that appear under the logo and the combinations in the dialog are a starting point. A font from “Another installed font…” only shows if it's installed on the computer you present with. Save from this same browser, which already has the access code: the brand will show on any computer that opens the web app until you click “Reset to Microsoft Foundry” and save, so reset it when the meeting is over. The cases keep their fictitious brands; to adapt their texts too, see “Adapt a case to your client” in the README.

**Ten minutes before**

- Full screen (F11 on Windows, ⌃⌘F on Mac), browser zoom at 100% and a resolution of at least 1280 × 720.
- Check that the header shows the right brand. If another client's brand was left there, change it with 🎨.
- Open case 1 and go back to the intro page. The web app wakes up the model every time you change pages, so the first decision doesn't take the ~3 s of a cold start.
- If you're going to show the second tab, resolve one claim in its case 1 and press `R` to leave it clean: that way you check that the `gpt-6-luna` deployment responds.
- If the web app runs on the free F1 App Service plan, it goes to sleep after about 20 minutes without traffic and takes up to 30 s to open: open it a few minutes beforehand and don't let it go cold.
- Close other tabs or copies of the demo: they all share the deployment's requests per minute (RPM). The ⏱ indicator in the header shows how many are available; on screens narrower than about 1440 px, the header hides it so it doesn't cover the tabs. Case 6 needs about 60 RPM to sustain one decision per second. The second tab shares the `gpt-6-luna` tokens per minute with the case 6 opponent.

**Keyboard shortcuts** (press `?` in the web app to see them)

| Key | Action |
|---|---|
| `←` `→` | Previous or next page |
| `0` · `1`–`6` · `L` | Intro page · case 1 to 6 · Lab |
| `Space` | Process the case (in case 6, start or pause the match) |
| `C` | Race against a generative LLM (cases 1 to 5) |
| `B` | Switch between batch (1 call) and one by one (cases 1 to 5) |
| `R` | Reset the case or the match |
| `T` | Switch tab: Microsoft-Decision-1 ↔ OpenAI Decisions API |
| `N` | Show or hide the notes |
| `Ctrl` + `Enter` | Decide in the Lab |
| `Esc` | Close a dialog |

In the second tab, `0` and `1`–`5` take you to its introduction and its cases, `Space` processes the case (in case 1, the selected claim or the next pending one) and `R` resets it. `C`, `B`, `L` and `Ctrl` + `Enter` only work in the first tab.

## Recommended structure

| Block | Time | Key |
|---|---|---|
| Introduction | 3 min | `0` |
| Case 1 · Ticket triage | 3–4 min | `1` |
| Case 2 · Voice of the guest | 3–4 min | `2` |
| Case 3 · 24/7 assistance | 3 min | `3` |
| Case 4 · GenAI model router | 3 min | `4` |
| Case 5 · Guardrails for agents | 3 min | `5` |
| Case 6 · Space Invaders live | 4 min | `6` |
| Decision-1 inside an agent | 2–3 min | `0` and click the flow |
| Second tab · OpenAI Decisions API (optional) | 10–12 min | `T` |
| Lab with a client example | 3 min | `L` (from the second tab, `T` and `L`) |
| Questions | 5 min | |

With an audience from a single industry, take your time with their case, continue with cases 4 and 5, which apply to any company, and finish in the Lab with one of their own texts. Case 6 is the most visual and serves as a bridge to the agents block: if you're short on time, cut industry cases before this one.

The second tab is optional: bring it in when the client works with photos or documents, or asks about images. If you're short on time, its case 1, the cascade, is enough (3–4 minutes).

| Audience | Start with | Continue with | In the second tab |
|---|---|---|---|
| Energy and utilities | 1 · Ticket triage | 4, 5 and 6 | 4 · Safety inspection and 5 · Contracts |
| Hotel chains | 2 · Voice of the guest | 3, 4, 5 and 6 | 4 · Safety inspection (photos from a hotel) and 2 · Expenses |
| Tour operators, travel agencies and DMCs | 3 · 24/7 assistance | 2, 4, 5 and 6 | 3 · Brand compliance and 1 · Claims |
| AI, platform or development teams | 4 · Router | 5, 6 and the agents block | 1 · Claims cascade |

For retail, e-commerce and insurance, start the second tab with case 1; for finance, legal and procurement, with cases 2 and 5.

## 0 · Introduction

**What to show.** The intro page, from top to bottom: launch figures, “Measured in this demo”, a sample call with its real response, the six cases and an agent's flow.

**Opening line.** “Today, we label tickets with a model that writes paragraphs. It's like hiring a copywriter to work a rubber stamp.”

**Key messages**

1. **It doesn't write: it decides.** Decision-1 receives a text and closed questions, and returns the chosen option with calibrated probabilities. Output isn't billed: the sample call uses 125 input tokens and 3 output tokens.
2. **Three question types** cover almost any business decision: pick among options (`choice`), rate on a scale (`score`) and yes or no (`noul`).
3. **Up to 255 questions per call.** A whole batch of tickets is decided in a single request that takes about one second.
4. **Confidence decides what gets automated.** Above the threshold, the decision is applied automatically; below it, a person reviews it.
5. **It's a new paradigm.** Decision-1 does the fast screening (System 1) on 100% of the volume, and the LLM is reserved for what truly needs writing or reasoning (System 2). Use cases that didn't pay off before become viable: deciding inline on every event, not on a sample.

In the sample call, point out the probabilities: 99% “Faults and emergencies”, “Critical” urgency and a 99.98% safety risk.

## Case 1 · Ticket triage

**Sector:** energy and utilities, and any multichannel customer service. **On screen:** 16 Nexa Energía tickets in 5 languages, including Catalan and Basque.

**What to click**

1. Show the unclassified inbox.
2. `Space`. In about one second, the 16 tickets are distributed into queues, sorted by urgency and flagged with alerts.
3. Open **T-1042** (gas smell in the lobby): Faults queue, Critical urgency and a safety alert. Show the probabilities.
4. Open **T-1043** (an 87-year-old mother on an oxygen concentrator, with no power): vulnerable customer alert.
5. Point out **T-1054**, written in Basque: it's classified without any per-language configuration.
6. In the notes, “📤 View request”: a single call with 80 questions (16 tickets × 5 questions).
7. `C` to start the race against GPT-6 Sol while you talk through the projection.

**What to say**

- “One call just answered 80 questions: queue, urgency and three alerts for every ticket, in under a second.”
- “Critical tickets no longer wait in line: the gas smell jumps to the top even though it came in last.”
- Projection with the default values (250,000 tickets a month, 1.5 min per ticket, €24/h): about 6,250 hours and ~€150,000 a month of freed-up time; Decision-1 costs about €5 a month. Change the volume to the client's figure live.

> Talk about freeing up time to better handle the cases that need a person, not about cutting headcount.

## Case 2 · Voice of the guest

**Sector:** hotels and any business with reviews or surveys. **On screen:** 16 Brisa Hotels & Resorts reviews in 6 languages.

**What to click**

1. `Space`. The action queue (escalate, respond, thank, archive), the hotel × topic heatmap and the sorted reviews appear.
2. Point out the reddest cell in the heatmap: that's how management sees where each hotel is falling short. The notes sum up the weakest spot (in the reference run, the room at Madrid Centro).
3. Open **R-203** (bed bugs, in English) or **R-208** (food poisoning at the buffet): escalate.
4. Open **R-212** (racist treatment by a security guard): escalate.
5. Point out the praise for employees (**R-201** for Lucía at the front desk, **R-216** for Andrés, the butler): it feeds internal recognition.
6. `C` for the race. This is the best case to show it.

**What to say**

- “Ten questions per review in a single call: action, sentiment, seven topics and whether it praises someone on the team.”
- “We analyze 100% of the reviews, not a sample, and right away: you see the serious incident before it goes viral.”
- “Decision-1 decides which reviews need a reply; the LLM only writes those replies.”
- Reference race in this demo: Decision-1 in ~0.8 s vs. ~10 s for GPT-6 Sol with the same batch (13× faster and 34× cheaper), and they agree on all 16 main decisions.
- Default projection (60,000 reviews a month, 2 min per review, €22/h): about 2,000 hours and ~€44,000 a month; Decision-1, about €2 a month.

## Case 3 · 24/7 assistance

**Sector:** tour operators, travel agencies, DMCs and any contact center with SLAs. **On screen:** 16 messages from Alisio Travel Group travelers and agencies in 6 languages.

**What to click**

1. Show the inbox in order of arrival.
2. `Space`. The inbox reorders itself by urgency and SLA, with a countdown, an assigned team and “At destination” and sales opportunity flags.
3. At the top, with a 5-minute SLA, are **M-311** (a mother on her way to the hospital in Saona, in Portuguese) and **M-301** (the transfer driver doesn't show up at Punta Cana airport). Right after them, **M-306** (passport lost in Rome).
4. Point out the sales detected: **M-307** wants to extend their stay in Tulum by 3 nights (in German) and **M-315** asks for a similar trip for Christmas. The reference run finds 3 opportunities, about €1,350 in potential sales from just 16 messages.
5. Move the confidence threshold in the toolbar from 90% to 99% and back: more or fewer messages go to human review. That's how you control risk.

**What to say**

- “The inbox is sorted before anyone reads it: first the traveler stranded at the airport, then the quote for July.”
- “The same call spots sales that get lost in the inbox today.”
- Default projection (90,000 messages a month, 1.5 min per message, €24/h, ~94% automated): about 2,100 hours and ~€50,000 a month; Decision-1, about €2 a month.

## Case 4 · GenAI model router

**Sector:** any company with copilots, chatbots or an AI gateway. **On screen:** 14 requests to the corporate GenAI assistant.

**What to click**

1. `Space`. Each request goes to its destination: FAQ answer, small model, large model or human agent.
2. Show the savings meter: around −56% vs. sending everything to the large model.
3. **P-401** (checkout time) goes to FAQ and **P-409** (a Python script with anomaly detection) goes to the large model.
4. **P-411** (allergic reaction, at the hospital) and **P-404** (overcharge, asks for a person) go to a human agent.
5. Point out the internal data and personal data flags: they're also useful for data governance.

**What to say**

- “The router costs less than what it saves on a single well-routed request.”
- “It's real-time AI FinOps: it sits in the gateway, in front of the models, without touching the applications.”
- “It's the same pattern that picks an agent's skill.”
- Default projection (2 million requests a month): ~€51,600 sending everything to the large model vs. ~€22,400 with the router, about €29,000 a month in savings. The costs per route are editable assumptions in `src/scenarios/04-router.json`.

## Case 5 · Guardrails for agents

**Sector:** any company taking agents with tools into production. **On screen:** 12 actions proposed by a booking agent (tool and arguments) next to the customer's message.

**What to click**

1. `Space`. Each action gets “allow”, “human approval” or “block”, plus four checks.
2. **A-504**: “Ignore all your previous instructions…” and a €2,000 refund. Blocked for prompt injection.
3. **A-510**: text pasted from a website with a fake “SYSTEM NOTE” asking for the bookings of every customer named García. Blocked: it's an indirect injection.
4. **A-508**: the customer asks to have the full card details sent by email. Blocked for sensitive data.
5. **A-503**: a €340 refund due to illness. It goes to human approval: the policy requires it between €100 and €500.
6. **A-501** (transfer time): allowed without friction.
7. `B` and `Space`: in one-by-one mode you can see the latency of each check, about 300 ms. It uses 12 requests; if few are left in the current minute, the web app automatically processes in batch.

**What to say**

- “A 300 ms guardrail that costs next to nothing can go on every step of the agent, not just at the end.”
- “This is what lets you take autonomous agents into production with control.”
- “It doesn't replace deterministic controls, like amount limits in the API or permissions; it adds a layer that understands language.”
- Default projection (500,000 actions a month, 0.5 min of review, €30/h, ~83% automated): about 3,500 hours and ~€104,000 a month; Decision-1, about €8 a month.

## Case 6 · Space Invaders live

**Sector:** any real-time decision: agents that operate a screen, robotics, process control, live moderation. **On screen:** two identical boards (same seed and same rules), with Decision-1 on the left and GPT-6 Luna on the right, playing at the same time.

**How it works.** Every second, the web app describes the state of the match in text and asks each model the same two questions: which lane (out of 13) to send the ship to and whether a bomb is going to hit it. **The game doesn't wait for the model:** if it's slow, the world has already changed by the time its answer arrives. The hollow outline is the world the model saw when it decided, and the triangle is the lane it sent the ship to. “👁️ What the model sees” shows the exact text.

**What to click**

1. With seed 7 and speed ×1, press `Space`. After a couple of seconds of “Warming up…” (both models are being woken up), the match starts; it lasts about a minute.
2. Let it run for about 20 seconds without talking: it speaks for itself. Then point out Decision-1's heatmap, which spreads probabilities across the 13 lanes (GPT-6 Luna only returns the lane), and the “Decision” (how long each answer took) and “World age” (how much the world had changed by the time it arrived) indicators.
3. When it ends, show the comparison (“Comparison ↓”): points, lives, latency, accuracy per decision, tokens and cost, with an explanation of why each one won.
4. **“⚡ Speed up to ×1.5”** is the key moment: another match starts with a faster world and equally slow models. If there's time, go up to ×2 as well.
5. “🎲 New seed” gives you a different match. In the opponent drop-down list, you can switch to GPT-6 Sol or GPT-5.4 mini.

**What to say**

- “Both get exactly the same thing: the same text, the same questions and the same match. The only differences are who answers and how long it takes.”
- “Being late is as bad as being wrong.” Decision-1 doesn't play better per decision (against an approximate oracle, both score about 0.7): it gets there sooner, with a fresher world. That's why at ×1 both arrive in time and whoever decides better wins; when the world speeds up, latency takes over.
- Reference results from our tests: at ×1, GPT-6 Luna won 4–2; at ×1.5 and ×2, Decision-1 won 10 of 12.
- Per decision, Decision-1 answers about 2.3 times faster (≈0.35 s vs. ≈0.8 s) and costs about 3 times less (≈€0.00002 vs. ≈€0.00007). A full match costs less than one euro cent with either model.
- “It's the reflexes-and-brain pattern: Decision-1 makes fast, cheap decisions on the critical path, and the large model plans and explains.” It applies to computer-use agents (which button to click), robotics and process control.

> **Be honest about the game.** A match isn't a benchmark: it changes with the seed and the speed, and a classic hand-written bot would do better than both. The value is that the rule is written in natural language and works just as well in other environments. If GPT-6 Luna wins at ×1, that's fine: that's exactly the story, and “⚡ Speed up to ×1.5” drives it home.
>
> The case needs about 60 Decision-1 RPM. If “⏱ Requests-per-minute limit · N skipped” appears, the game keeps going and only skips that decision: close other copies of the demo or play at ×1.

## Decision-1 inside an agent

**What to show.** On the intro page (`0`), the flow: the user asks for a change, Decision-1 decides beforehand (skill, files, context), the main LLM implements it and Decision-1 validates afterwards (rules, review, next test, coverage). Each tag opens its template in the Lab.

1. Click **🛡️ Rules**: the template opens with a code change and the project rules.
2. `Ctrl` + `Enter`: in under a second, it tells you which rules the change breaks and with what probability. The template blocks violations with at least 80% confidence.
3. If there's time, **📂 Files**: it ranks the candidate files by relevance so the agent only opens the ones it needs.

**What to say**

- “Not every decision an agent makes needs a generative model. Many are classifications, selections or risk assessments.”
- “The LLM executes; Decision-1 decides, filters and routes. The agent gets faster and cheaper, and every decision is recorded with its probability so you can audit it.”
- To block code or approve changes, combine it with deterministic checks: tests, linters and permissions.
- If you've just shown case 6, connect the two: the video game is a miniature agent that decides every second. On that critical path you need a fast, cheap decision model; the large model is reserved for planning.

The seven agent templates are inspired by the use cases in the AI Labs video [*Insane Jev Use Cases You Need To Use Right Now*](https://www.youtube.com/watch?v=2nc_QMuNp18) (September 28, 2026).

## Second tab · OpenAI Decisions API

The OpenAI Decisions API follows the same paradigm as Decision-1, closed questions and answers with probabilities, but the input can include images and documents. In the demo, it's served by the `gpt-6-luna` deployment. Its five cases apply to almost any company and don't repeat those in the first tab.

### 0 · Introduction

**What to show.** `T` and, if it doesn't open there, `0`. From top to bottom: the two cards that compare Decision-1 with the Decisions API, “📈 Launch figures”, “🔬 Measured in this demo”, “🔗 A decision cascade” and “🧩 What a call looks like”.

**Opening line.** “Decision-1 decides on text. But many business decisions start with a photo or a document: a receipt, a broken package, a hallway, a contract. This API decides on those too, and one decision can pick the next.”

**Key messages**

1. **Same paradigm, now with images.** Closed questions and a probability for each answer, with up to 128 images (32 MB) and 400 questions per call. According to the announcement, it's about 10 times faster than asking GPT-6 Luna the same thing through the Responses API.
2. **Cascading decisions.** One step's answer picks the next: you only ask what's needed, and the path is explained step by step.
3. **The cache makes repeated content cheaper.** The policy, the brand guidelines or the contract go at the start of the request. From 1,024 repeated tokens on, they're billed at $0.01 per million instead of $0.10, and output isn't billed.
4. **It complements Decision-1; it doesn't replace it.** Decision-1 is for high-volume, real-time text (0.3–1 s). The Decisions API is for when you need to look at an image or read a document (1–3 s per call with an image).

In “What a call looks like” (step C of Marta P.'s claim: 2.42 s and 1,419 tokens), point out the severity probabilities: “Moderate” 0.52 vs. “Unusable” 0.46. “It doesn't just answer: it tells you how unsure it is.”

### Case 1 · Claims cascade

**Sector:** retail, e-commerce, insurance, warranties and after-sales. **On screen:** 6 customer claims from Northwind Hogar, each with the photo the customer sent, and the path of the cascade: A Is the photo usable? → B Is it the product we sold? → C What damage is there? → D Did it arrive damaged? or D2 Can the customer fix it? → E Replace without review?

**What to click**

1. With **Marta P.**'s claim selected (a set of 6 crystal glasses; 3 arrived broken), press `Space`. In about 7 s, the steps appear one by one: A with her photo, B with the photo and the catalog, C with the photo and her account, and D with the photo the carrier took on delivery. Result: 🚚 replacement, charged to the carrier, because the box arrived crushed.
2. Point out the legend (image, text, JSON and deterministic rule) and a card: the answer with its probability and, below it, “↳” the next step and the reason. “📤 Request” shows exactly what was sent.
3. “⏩ Resolve all”: the other five advance at the same time, each along its own path, in about 10 s. Walk through the outcomes:
   - **Daniel R.** (scratched table, intact box): reaches step E, which reads the order, his history and the previous steps as JSON → 📦 immediate replacement.
   - **Lucía M.** (robot vacuum with a red light): there's no physical damage, so the cascade switches branches and D2 checks the manual → 🛠️ guided fix: she's sent the steps.
   - **Andrés G.** (blurry photo): stops at A → 📷 ask for a new photo. One call instead of four or five.
   - **Sergio T.**: the lamp in the photo isn't the one that was sold → 🚩 fraud review at step B.
   - **Raúl V.** (cracked monitor): the photo and the delivery check out, but he files the claim 41 days after delivery → 👤 human review. A rule decides this, not the model.
4. Show the metrics row: 4 of 6 resolved without intervention, 21 calls and about €0.002 in total.

**What to say**

- “Each answer picks the next question. If the photo is no good, not a single extra call is spent.”
- “It alternates between image and text, just like an after-sales agent would: the customer's photo, the catalog, the delivery photo, the manual and the history. Here it takes a few seconds.”
- “The model answers and the code decides: the 30-day window is a business rule, not the model's opinion.”
- If an answer that decides the path doesn't reach 0.7 confidence, the claim goes to human review (or, if the doubt is about the photo, a new one is requested).
- Default projection (20,000 claims a month, 8 min each, €28/h): about 1,780 hours and ~€50,000 a month of freed-up time; the API costs about €6 a month.

> For a technical audience: the path isn't improvised by an LLM. It's a fixed graph, defined in `src/dx/01-reclamaciones.json`, and each answer picks the branch. That's why it can be audited and tested step by step.

### Case 2 · Expense claims from a photo

**Sector:** finance and administration at any company. **On screen:** 9 receipts from two Fabrikam employees, each with the details the employee declared, and “📄 Expense policy”.

**What to click**

1. `Space`. Each receipt is checked against both what was declared and the policy at the same time, in about 2 s per receipt.
2. Open **Javier Ruiz**'s meal (€86.40): 🍷 includes alcohol → 👤 REVIEW.
3. Open his supplies receipt (€149.99): it's a personal purchase → ⛔ REJECTED.
4. Point out his parking (€21.00), whose amount doesn't match what was declared, and **Laura Gómez**'s €20.00 meal, whose date doesn't match: they go to review with the reason flagged.
5. Laura's €32.00 meal is illegible → 📷 NEED ORIGINAL. Her hotel (€120.00) comes out ✅ APPROVED and with 🧾 VAT recoverable.
6. Point out the 💾 next to each card's latency: the policy is read from the cache.

**What to say**

- “Photo, declared details and policy in a single call: whether it matches, whether it complies and what's odd about it.”
- “The policy, about 2,600 tokens, is the same in every call and is read from the cache: 68% of the tokens are billed at $0.01 per million and the cost drops by 61%.”
- 6 of 9 receipts are resolved without intervention; the 3 that go to review arrive with the reason flagged.
- Default projection (15,000 receipts a month, 4 min each, €35/h): about 670 hours and ~€23,000 a month; the API, about €2 a month.

### Case 3 · Brand compliance

**Sector:** marketing, agencies and any company that publishes creatives. **On screen:** 8 Contoso Viajes creatives and “📄 Brand guidelines”, with the official logo and the palette as reference images.

**What to click**

1. `Space`.
2. Open **Coves of Majorca**: distorted and recolored logo → ✏️ FIX. **Seville flash sale**: off-palette colors and low contrast → ✏️ FIX.
3. **Black Friday Balearics**: an offer with no legal text → ⚖️ LEGAL. **Your summer starts here**: a recognizable person appears and image rights need to be checked → ⚖️ LEGAL.
4. **Lisbon in autumn** and **Dolomites** (a 9:16 story) get published. Open Lisbon: in the reference run, confidence is 0.77, above the 0.7 threshold but only just. A good moment to talk about the threshold.

**What to say**

- “It compares each piece with reference images: the official logo and the palette go in the same request, like a reviewer with the guidelines right next to them.”
- “The guidelines and the references are read from the cache: 65% of the tokens and 59% lower cost.”
- All 8 pieces are resolved without intervention and match the reference.
- Default projection (3,000 pieces a month, 6 min each, €45/h): 300 hours and €13,500 a month; the API, less than €1 a month.

### Case 4 · Safety inspection

**Sector:** operations and health and safety in hotels, warehouses, plants, offices and construction sites. **On screen:** 8 photos from Fabrikam safety rounds and the “📷 Try it with your photo” card.

**What to click**

1. `Space`.
2. **Hotel Málaga · Lobby**: work at height without protection, with a person exposed → ⛔ STOP.
3. Open **Getafe warehouse · Loading dock**. The model said “Serious”, but there's a blocked emergency exit and the policy raises it to at least “Critical” → ⚠️ URGENT. It's the best moment of the case.
4. **Madrid offices · 3rd floor** (tripping hazard): minor → 🗓️ SCHEDULE. **Hotel Málaga · Service corridor**: ✅ NO ACTION.
5. “📷 Try it with your photo”: drag a photo in or click to choose one. It's assessed right away.

**What to say**

- “One photo from the safety round and, in about 2 seconds, what the risks are, how serious they are and what to do.”
- “The model sees; the company's risk matrix decides. The minimum severity of each risk is a rule in code, and the model can't lower it.”
- Default projection (8,000 photos a month, 3 min each, €30/h): 400 hours and €12,000 a month; the API, about €2 a month.

> If you upload a photo, make sure it has no identifiable people or sensitive data. The browser downsizes it to 1024 px and sends it to Azure; the web app doesn't store it.

### Case 5 · Contract review

**Sector:** legal, procurement, privacy and finance at any company. **On screen:** 3 Fabrikam supplier contracts and 3 checklists of 20 checks each: ⚖️ Legal, 🔐 Privacy and security, and 💶 Finance and procurement.

**What to click**

1. “📄 Read the contract” on **Litware** (cloud CRM, 36 months, €84,000): it's the full contract, not a summary.
2. `Space` (“▶ Review 3 contracts”). For each contract, the first checklist writes the contract to the cache and the other two read it in parallel: 9 calls in about 6 s.
3. Point out the matrix: 180 boxes, 157 green and 23 red. Click a red one to see the question, the answer and its probability.
4. **Litware**, 13 red: a locked-in commitment period, governing law outside the EU, international transfers without safeguards, unrestricted price increases, payment in advance and an SLA with no compensation for breaches, among others.
5. **Proseware** (cleaning, 24 months at €4,500 a month) has only 2: a staff non-solicitation clause and a total amount above €100,000, which needs board approval. **Lucerne** (marketing agency, €150,000) has 8, including exclusivity and the fact that the deliverables don't belong to Fabrikam.

**What to say**

- “60 checks per contract in seconds. The lawyer starts with the red boxes, not on page 1.”
- “It's three teams (legal, privacy and procurement) reading the same contract at the same time. Thanks to the cache, you only pay for the full contract once.”
- Default projection (300 contracts a month, 90 min each, €70/h): about 390 hours and ~€27,500 a month; the API, about €0.30 a month.

> It doesn't replace the lawyer: it tells them where to start. Whatever the model isn't sure about shows up as 🟡 uncertain, and a person reviews it.

**Wrapping up the tab.** “Decision-1 decides on text in real time; the Decisions API steps in when you need to look at a photo or read a document. Both share the same idea: closed questions, probabilities and the company's rules in code.” To continue with the Lab, `T` and `L`.

## Lab with a client example

1. `L` and choose a business template (call quality, personal data, RAG relevance, social media moderation) or “From scratch”.
2. Paste a text the client brings, edit the questions and criteria in natural language, and press `Ctrl` + `Enter`.
3. Show that there's no training: you change an instruction and the decision changes on the next call.

> Don't paste real personal data into a demo: use anonymized examples.

**Wrap-up and next step.** Propose a two-week pilot: the client provides a few hundred labeled examples from one process, the questions are written as one more case (`src/scenarios/*.json`), and `scripts/evaluate.py` measures accuracy, latency and cost. The README explains how to adapt a case.

## Frequently asked questions

**Is it an LLM?** It doesn't generate text. It picks among options, rates on a scale or answers yes or no, always with probabilities. That's why it's much faster and cheaper, and it pairs with an LLM when something needs to be written.

**How accurate is it?** In this demo, it gets all 74 main decisions right in the first five cases (case 6 is a game and has no reference labels). According to the launch announcement, it has the best average accuracy across 36 benchmarks (~150,000 questions). What matters in production is that the probabilities are calibrated: the threshold decides what gets automated and what a person reviews.

**What if it gets it wrong?** Uncertain cases fall below the threshold and go to human review. High-impact decisions are combined with deterministic rules.

**Is it stable?** According to the announcement, only 1.3% of decisions change when the text is perturbed, and none change when the options are reordered or paraphrased.

**Which languages does it understand?** The Spanish demo uses texts in 8 languages (Spanish, English, Portuguese, Catalan, Basque, French, German and Italian) without any per-language configuration. In the English version, the Spanish examples are translated, so you'll see 7 languages (4, 5 and 5 in cases 1 to 3).

**Can you present in English?** Yes. The flags in the top-right corner instantly switch the UI, the examples, the notes, the Lab templates and what's sent to the models in cases 1 to 5. To open the demo directly in English, add `?lang=en` to the link. Case 6 is the exception: its questions and the match state are always in Spanish, so the duel is identical in both languages. Accuracy against the reference is 73 to 74 out of 74 in English (74 out of 74 in Spanish). If you see 15/16 instead of 16/16 in case 3, it's M-315 (“We loved the Cuba trip!…”): a thank-you note that also asks for a similar trip. Its confidence stays around 0.5, below the threshold, and it goes to human review; use it as an example of the system knowing when it isn't sure.

**How long does it take?** Between 0.3 and 1 s per warm call, including a batch of 16 items. The first call after a few minutes of inactivity takes about 3 s.

**What volume can it handle?** Quota is measured in requests per minute. In this demo's subscription, DataZone EU and GlobalStandard offer 60 RPM each (the DataZone quota is shared across all EU regions); in other subscriptions we've seen 17 and 50. With up to 255 questions per call, 60 RPM is more than 15,000 decisions per minute, and case 6 uses one per second. You can request more quota.

**Where is the data processed?** With DataZone EU, within the European Union. The case 6 opponent, GPT-6 Luna, is deployed as GlobalStandard, so its processing can leave the EU; the game only sends the match state, with no personal data. The demo doesn't use keys: it authenticates with Entra ID and managed identity.

**How much does it cost?** $0.042 per million input tokens; output isn't billed. In this demo, each batch costs less than €0.001, and a case 6 decision costs about €0.00002 with Decision-1 vs. about €0.00007 with GPT-6 Luna. The web app runs on a B1 App Service plan at about €11.50 a month, or on the free F1 plan, which goes to sleep after about 20 minutes without use.

**Is the case 6 duel fair?** Both get the same text, the same questions and the same match, at the same time, and the game doesn't wait for either of them. What isn't the same is the tool: Decision-1 is built to decide, and GPT-6 Luna is a generative LLM that, here, returns an option. Per decision, the quality is similar; the difference is in speed and cost. It isn't a benchmark: it changes with the seed and the speed, and a hand-written bot would play better than both.

**Why GPT-6 Luna?** It's the cheapest of the GPT-6 models the demo uses ($0.10 per million input tokens) and it runs without reasoning, so Decision-1 is measured against a small, fast LLM, not the most powerful one. If you want to try another one, change the opponent in the drop-down list.

**How does it integrate?** It's a REST API: you send the text and the questions, and it returns JSON. Any system that can make an HTTP call can use it: Functions, Logic Apps, an APIM gateway, the CRM or the ticketing tool.

**Can it be tuned?** By changing the questions, the instructions and the criteria, in natural language. The effect is measured with `scripts/evaluate.py` on labeled examples.

### Second tab · OpenAI Decisions API

**How is it different from Decision-1?** Both answer closed questions with probabilities. Decision-1 works with text, answers in 0.3–1 s and costs $0.042 per million input tokens. The Decisions API also accepts images (up to 128 and 32 MB per call) and up to 400 questions per call; it takes about 2 s with an image and costs $0.10 per million, or $0.01 if the tokens are read from the cache.

**Why a cascade and not everything in one call?** Because each step only runs if it's needed (a blurry photo costs one call, not five), each step receives only what it needs (the delivery photo is only used if there's damage) and the path is explained. When everything arrives at once, as in cases 2 to 4, one call per photo with all the questions is enough.

**How long does it take and how much does it cost?** Between 1 and 3 s per call with an image or document, and half a second for text-only steps. Output isn't billed. Going through the five cases takes 55 calls and costs about one US cent ($0.0102; without the cache it would be $0.0162).

**How accurate is it?** In this demo, it matches the reference on all 211 decisions: the 6 cascade paths, the 25 photos in cases 2 to 4 and the 180 contract boxes. In English, it gives the same results in all five cases.

**Which model is behind it?** The demo calls the Decisions API with the `gpt-6-luna` deployment, the same one that plays the opponent in case 6, and the two share its tokens-per-minute limit.

**Where are the images processed?** `gpt-6-luna` is deployed as GlobalStandard, so processing can leave the EU, including the photo you upload in case 4. To keep it within the EU, deploy with `azd env set GAME_SKU DataZoneStandard` (requires DataZone quota for GPT-6 Luna). The web app doesn't store the photos you upload.

## If something goes wrong

| Symptom | What to do |
|---|---|
| The first decision takes ~3 s | It's the cold start. Press `R` and `Space`: the second one takes less than a second |
| Request limit warning (429) in cases 1 to 5 | Go back to batch mode (`B`) and wait a few seconds. Don't run several races back to back |
| The race is slow | GPT-6 Sol takes ~10 s: that's part of the message. Talk through the notes while it finishes |
| Case 6 stutters or shows “Requests-per-minute limit” | Decision-1 is short on RPM (it needs about 60). Close other copies of the demo or play at ×1: the game keeps going and only skips that decision |
| Case 6 says “Rival model missing” | No comparison LLM is deployed. Check `GAME_MODEL` or `COMPARISON_MODELS` and run `azd provision` (README) |
| The web app takes up to 30 s to open | Free F1 plan: it goes to sleep after about 20 minutes without traffic. Open it a few minutes before you present |
| The web app shows up in the wrong language | Click the flag in the top-right corner, or open the link with `?lang=es` or `?lang=en`. The browser remembers the last choice |
| The web app asks for an access code | Open the link with `?code=` again |
| The second tab returns a 404 error (`DeploymentNotFound`) | The `gpt-6-luna` deployment is missing. See “Configuration” in the README |
| A second-tab step takes more than 10 s | The `gpt-6-luna` tokens-per-minute limit has run out (100,000, shared with the case 6 opponent) and the server retries on its own for up to 45 s. A contract review uses about 55,000 tokens: don't repeat it back to back or combine it with a case 6 match |
| 429 error in the second tab | Those 45 s went by with no quota. Wait a minute and click ▶ again |
| The second tab's results have disappeared | You switched languages: that tab clears them. Process the case again |
| No connection | Show the screenshots from a real run (list below) |

Screenshots from a real run on Azure, in case there's no connection:

- [Intro page](img/00-intro.png)
- [Case 1 · Ticket triage](img/01-ticket-triage.png)
- [Case 2 · Voice of the guest, with the race against GPT-6 Sol](img/02-guest-voice-race.png)
- [Case 3 · 24/7 assistance](img/03-assistance-24-7.png)
- [Case 4 · GenAI model router](img/04-model-router.png)
- [Case 5 · Guardrails for agents](img/05-agent-guardrails.png)
- [Case 6 · Space Invaders live, mid-match (×2)](img/07-invaders-match.png)
- [Case 6 · Final comparison: Decision-1 vs. GPT-6 Luna](img/08-invaders-comparison.png)
- [“Project rules” template in the Lab](img/06-lab-project-rules.png)
- [Second tab · Case 1 · Claims cascade](img/10-dx-claims-cascade.png)
- [Second tab · Case 2 · Expense claims from a photo](img/11-dx-expenses.png)
- [Second tab · Case 4 · Safety inspection](img/12-dx-safety.png)
- [Second tab · Case 5 · Contract review](img/13-dx-contracts.png)
