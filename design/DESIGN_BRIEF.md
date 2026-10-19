# TaskFlow — Design Brief (v1, light mode)

Figma: https://www.figma.com/design/bnt8lsuv1xdCg4xHFitxvZ (page "Light · Mobile")

## Style
- **Look:** soft neo-brutalism. Thick 2.5px ink outlines, rounded 18px cards, flat pastel fills, no hard shadows. Calm, cream background.
- **References:** `references/2.jpg` (layout, pastel stat cards, weekly bars) and `references/3.jpg` (quest cards, bold outlines, subtasks).
- **Mobile first.** Desktop/web layouts come after mobile is signed off.

## Colour
| Role | Hex |
|---|---|
| Cream (background) | #FFF8EE |
| Ink (outlines, text) | #1E1B18 |
| Card | #FFFFFF |
| Muted text | #7A7068 |
| Mint (done, growth) | #A8D8B9 |
| Coral (streak) | #F4A59A |
| Lavender (mascot, stats) | #C9B8E8 |
| Butter (EXP, coins, nav) | #FFD66B |
| Sky (today, timetable) | #A9D6F0 |

**Priority tiers (six, large pastel cards, one hue per step):**

| Tier | Name | Hex | Meaning |
|---|---|---|---|
| P1 | Critical | #F4918A | due today, blocking |
| P2 | High | #F9B77E | due in 1–2 days |
| P3 | Medium | #FFE08A | planned this week |
| P4 | Normal | #B9E7CC | default for new tasks |
| P5 | Low | #A9D6F0 | nice to do |
| P6 | Someday | #D4C4F2 | ideas, no deadline |

Rose #F7B5C2 from v1 is retired. Lilac #D4C4F2 sits close to the mascot card's lavender, so keep the mascot card on #C9B8E8 and never put a priority card next to it.

## Pages (proposed)
1. Dashboard — total tasks done, streak, today 3/5, EXP, monthly goal, weekly chart, mascot
2. Quests — Today / This week / Questlines, priority cards, drag to reorder
3. Quest detail — subtasks, priority per subtask, due date, notes
4. Questline — grouped quests with progress coin
5. Add task — text entry plus voice (TTS) input
6. Timetable — day timings for students
7. Calendar — week / month
8. Focus timer
9. Stats & history
10. Connections — Google Calendar, Apple Calendar / Reminders
11. Settings — sound on/off, volume, mascot, theme
12. Onboarding and empty states

## Interactive prototype
`design/prototype/index.html`. Serve the `design` folder (`python -m http.server 5173 --directory design`) and open `/prototype/`. It has working navigation, drag-to-reprioritise, the voice-add sheet, live Customise settings, all three sounds, and Mochi's full behaviour. Mochi's art lives in `design/prototype/mochi.js`; exported SVGs are in `design/mochi/`.

## Navigation (Figma page "Components" → "Bottom nav")
- Four tabs (Home, Quests, Plan, Customise) and a raised + button in the centre that adds a quest from anywhere.
- 16 variants: Active tab × Style (Float pill / Dock full-width) × Labels (On / Off). Bar colour is a fill override.
- In Customise: bar style, labels, tab click sound, bar colour, and tab order (the + always stays in the middle).

## Customise page
Navigation (above) · Priorities (rename all six tiers; colours stay fixed) · Mochi (roam on/off, walk speed — Slow by default, with the walk cycle played in step with his speed, sounds, patience) · Goals and sound (daily target, volume, preview sounds, theme).

## Mochi (source of truth: `design/mochi design.png`)
The art is the character sheet itself. `design/mochi/extract.py` cuts every pose and rig part out of the sheet into transparent PNGs in `design/mochi/png/` (background removed, white eyes and leg lines kept). The prototype, `design/mochi/sheet.html` and Figma all use those cut-outs; nothing is redrawn. Figma: Components → "Mochi (sheet)" (22 poses) and "Mochi parts (rig)" (10 parts), plus the "Mochi · character sheet" board.

| Sheet section | Poses | When Mochi uses them |
|---|---|---|
| Main poses | sit, sitside, stand, walk, lookup, lookback | Rests on the nav bar, roams along it (hopping over +), looks up when listening or when a P1 is due, looks back while sulking |
| Idle & ambient | blink, twitch, lookaround, track, melt | Blinks every 3–6 s, random ear twitch and look-around, turns to your finger and to scrolling, melts asleep after 25 s idle (9 s on Plan) |
| Touch | boop, squish, pickup | Tap = boop with a heart; double tap = squish; long press = pick him up and drag him, let go to drop |
| Feedback | celebrate, grumpy | Celebrate: quest done or saved, daily target hit, questline done. Grumpy: errors (e.g. saving a quest with no name), tapped past Patience, a P1 still open |
| UI integration | stretch, chase, box, helper, toast-success, toast-error | Pull-to-refresh on Quests, loading screen, empty Quests list, corner helper (roaming off) and peeking over the add sheet, success/error toasts |

**Animations** (source: `design/mochi animations.webp`, cut by `design/mochi/extract_frames.py` into `design/mochi/frames/<name>/01–10.png`; Figma page "Mochi · animations"):

| Animation | Plays | Speed |
|---|---|---|
| blink | every 3–6 s while resting | 16 fps |
| twitch, lookaround | random idle | 12 / 8 fps |
| track | turns to your finger or a scroll | 12 fps |
| melt | 25 s idle (9 s on Plan); holds frames 9–10 (zzz); plays backwards to wake | 8 fps |
| boop, squish | tap, double tap | 13 / 14 fps |
| pickup | long press: 1–5, dangles on 5–6 while held, 7–10 when dropped | 13 fps |
| celebrate, grumpy | success, error | 12 / 11 fps |

Resting pose = blink frame 1, so every animation starts and ends on the same frame.

**Second sheet** (`design/mochi animations 2.webp`, cut by `design/mochi/extract_frames2.py`, which finds each card from its frame number because the cards touch):

| Animation | Plays |
|---|---|
| standup, turn, walk, hop, sitdown | Moving along the nav: stands up, turns if facing the wrong way (the turn plays backwards for left to right), walks, hops over the + mid-walk, sits down on arrival |
| breathe | Resting loop (replaces the still pose) |
| stormoff, sulk, turnback | Annoyed past Patience: storms off, sulks with his back turned, turns back with "…fine." |
| ptr-stretch, ptr-hang, ptr-snap | Pull-to-refresh on Quests: the stretch frame follows your finger, he hangs at full stretch, then snaps back and spins on release |
| chase | Loading screen |
| boxpop | Empty Quests list |
| peek-rise, peek-duck | Rises over the add sheet when it opens, ducks back down when it closes |
| helper-idle | Corner helper when roaming is off |
| toast-celebrate, toast-grumpy | Animated Mochi in success and error toasts |

Hop card 2 on the sheet only holds the + button, so the hop has 7 frames.

**Hover** (`design/mochi hover.webp`, `extract_frames2.py hover`): Mochi follows the pointer one frame at a time. Within about 90px only his eyes move (eyes-lr / eyes-rl); further out his head and body turn (look-lr / look-rl). The left-to-right strips play while the pointer moves right, the right-to-left strips while it moves left. If the pointer rests near him for 1.3 s he does the curious head tilt; after 2.6 s without movement he eases back to looking ahead and resumes breathing.

**Sheet 3** (`design/mochi frames3.png`, `extract_frames3.py`): 13 more animations, 11–14 frames each. Mouse-cursor icons drawn in the cards are removed, since the real pointer or finger plays that part.

| Animation | When it plays |
|---|---|
| yawn | Random idle; also the first half of falling asleep (yawn, then melt) |
| loaf | Random idle: settles into a loaf, breathes there for 4–7 s, sits back up |
| suspicious | Random idle; when you un-tick a done quest ("hmm… sure?") |
| balance | Rare random idle: tail balance on a post |
| bonk | Tap on his head (a tap on his body is still a boop) |
| stomp | One tap before his patience runs out ("hey!") |
| pounce | Rest the pointer low beside him (50–170px away) for about 1 s: he pounces up to 70px toward it |
| cursor-chase | Wiggle the pointer side to side next to him: he chases it up to 50px |
| sprint | Zoomies: about 1 in 5 long walks on Home or Quests becomes a dash (crouch, run loop, skid, sit) |
| notify | A new quest is saved: he catches its badge ("new quest!") |
| button | Daily target hit: he presses the big button ("target hit!") |
| wipe | Last quest ticked: he wipes the slate clean ("all clean!") |
| cry | Settings reset ("my settings…") |

**No jitter between animations:** `design/mochi/build_manifest.py` gives every animation the same reference point. It is measured on Mochi himself (the largest shape, so props, tears and marks never move it): the centre line of his body (the middle of the widest solid slice through each torso row, which ignores the tail) and the line his feet stand on.
- **Every frame** stores its own body centre line (`axs`), and the prototype puts that line on his position each time the frame changes, in the same step as the image. The cut frames are not evenly registered (in blink, the cat sat up to 16px apart from card to card), so placing by one anchor per animation made him wander left and right during idles. Measured on screen, his body now holds within 1px through every idle and the whole walk chain (stand up → turn → walk → hop → sit → turn).
- The feet line slides from the first to the last frame of one-shot animations (sitting down sinks about 4px); loops keep one feet line.
- The small loops drawn outside Mochi (loading chase, box pop, pull to refresh, toasts) are not registered.
- **One scale per sheet**, normalised so the sitting cat is 64px on every sheet. An earlier per-animation sizing made him shrink when the stand-up handed over to the walk, so it is not used.
- Side-on animations that end sitting (sprint, pounce, wipe) end unmirrored, so they meet the left-facing rest pose. The sprint switches on its back-view frame, where the change cannot be seen.

Re-run it after adding or re-cutting frames.

- **Annoyed:** taps within 6 s are counted. One before the limit he stomps and says "hey!", at the limit "stop it…", past the limit (default 5, Patience in Customise) he goes grumpy, says "Hmph! Enough.", storms off and sulks looking back for about 5 s, ignoring taps. Then: "…fine."
- **Page moods:** Home wanders · Quests walks more and reacts to open P1s · Plan melts asleep quickly · Customise watches your finger.

## Onboarding (Figma page "Onboarding")
1. Welcome: Mochi, "Welcome to TaskFlow" ("a calm to-do list that feels like a game"), Get started
2. What's a quest?: a quest is simply a task. Three example quests, what a questline is ("Exam week" = 5 quests), and what the P1–P6 colours mean
3. About you: Student / Work / Personal (Student adds the Plan page)
4. Daily target: stepper (default 5) with example tasks, presets 3/5/7/10, plain-English streak card and EXP card ("3 of 5 done = 12 EXP · all 5 done = 30 EXP")
5. Make it yours: Google Calendar, Apple Calendar, Apple Reminders, sounds on/off, voice input on/off
6. Tour prompt: Mochi asks "Want a quick tour?" → Show me around / Skip tour

**Copy rule:** every game word gets a plain meaning the first time it appears: quest = task, questline = a group of tasks for one goal, streak = days in a row you hit your target, EXP = points.

## Tour (Figma page "Tour")
Each step is the real screen, duplicated, with a dimmed overlay, a butter-yellow spotlight ring around the highlighted element, and a tooltip card with step dots, "Skip tour" and "Next".

| Step | Screen | Highlights | Message |
|---|---|---|---|
| 1 | Dashboard | Stat cards | Your numbers at a glance |
| 2 | Quests | All six priority cards + colour legend | Six priority colours: warmer means sooner, drag to change |
| 3 | Add task | Voice area + detected keywords | Just say it |
| 4 | Quest detail | Subtasks | Break it down, each subtask has its own priority |
| 5 | Quests | Questline card | Finish a questline for the coin chime and bonus EXP |
| 6 | Timetable | Class grid | Drop a quest into a free gap |
| 7 | Dashboard | Bottom nav and + button | Get around |
| 8 | Customise | Navigation card | Make it yours |
| 9 | Dashboard | Mochi on the nav (round spotlight, pulse rings, "tap!" badge) | Meet Mochi. There is no Next button: the tour ends when the user taps the cat, which plays the mascot sound |

## Reminders (prototype: `design/prototype/reminders.js`, `reminders.css`)
- **Set one:** the "Reminder" row in the add sheet (None, In 1 min, In 15 min, In 1 hour, Tonight 8 pm, Tomorrow 9 am, Pick a time), or the bell on any quest card. Cards show "⏰ in 12 min" until it is due.
- **When it is due:** a system notification (browser Notification API; permission is asked the first time you set a reminder), an in-app toast, Mochi plays "notify" ("reminder!"), and the quest card gets a bold outline and a "due now" chip.
- **Count badge:** the red number on the bell in the status bar and on the Quests tab is the number of due reminders. It also shows in the tab title ("(2) TaskFlow") and on the app icon where the Badging API exists. A reminder leaves the count when the quest is done, snoozed (10 min) or dismissed in the bell panel.
- **Fallback:** if notifications are blocked, unsupported, or switched off in Customise → Reminders, everything still works in the app. Customise → Reminders → "Test reminder" fires one in 10 s.
- Prototype limit: reminders only fire while the page is open; real background delivery needs a service worker and push (or the native app's local notifications).

## Rules to build
- **Streak:** a day counts when at least the daily target (default 5) is completed. Missing a day resets it.
- **Daily tasks over a month:** 5 tasks per day tracked as a 30-day goal; "22 of 30 days kept" on the dashboard is the example.
- **EXP:** per day, `EXP = 20 × (tasks done ÷ total tasks that day)`, plus a 10 EXP bonus when all are done. Example: 3 of 5 = 12 EXP.
- **Questline complete:** coin chime plays, mascot does a celebration pose.

## Mascot (Mochi, black blob cat)
- Poses: sitting, sleeping, lying flat, peeking, in a box, with butterfly, with moon.
- **Click reaction:** tap → mascot pop sound + squish, then a random pose.
- **Idle:** every 20–60 s, random animation (blink, tail flick, yawn, look around).
- **Per page:** sleepy on Stats, peeking on Quests, in a box on empty states, celebrating on Questline complete.

## Sounds (in `design/sounds/`)
Approved set:
- `key_click_brown.wav` — task toggle. The user's own recording (`inbounds/keyclick.mp3`), converted to mono WAV.
- `mascot_pop.wav` — mascot tap. A tiny 0.2 s cat "mrp", played quieter than the other sounds (30% peak).
- `coin_questline_complete.wav` — two-note bell on questline complete.
- The mascot and coin sounds come from `design/sounds/make_sounds.py`. The script no longer touches the key click.

## Features to design for (not yet visual)
- **Quick entry by voice:** TTS-style speech to text adds a task directly.
- **Keyword sorting (Python):** pull keywords from the task text ("exam" → Medium, "due tomorrow" → High) and sort automatically. Suggested by the backend, user can override.
- **Subtasks:** unlimited, each with its own priority.
- **Adjustable task count:** daily target can be set from 1 to 10.
- **Drag-and-drop cards:** reorder quests, move between priority groups, and drag a card onto a questline.
- **Timetables:** day timings for students, with classes shown as blocks in the day view.
- **Connections:** Google Calendar and Apple Calendar/Reminders sync (OAuth). Connect screen is on the Connections page.

## Next steps
1. Confirm palette and mascot direction (review `design/palette.html`).
2. Design the Quest detail, Add task (voice), and Timetable frames.
3. Build the mascot poses as separate vectors.
4. Once light mode is signed off, create the dark-mode variables and a second page.
