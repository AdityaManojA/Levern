// What's new: one entry per release, newest first (Settings → What's new). Add an entry here with every update;
// the first one is the version shown at the bottom of Settings.
export const CHANGELOG = [
  {
    v: '1.07', date: '2026-10-25', title: 'An aura for the top three',
    items: [
      'Finish a season in the top three and you wear an aura all next season: a turning gold, silver or aurora ring, a shimmering name and a sparkle, on the leaderboard and your profile. It passes to the new top three every season.',
      'The aura turns faster, with a bright highlight racing round the ring.',
      'Refreshing the leaderboard keeps it in place while it loads, and the first load shows the board’s outline instead of jumping.',
    ],
  },
  {
    v: '1.06', date: '2026-10-25', title: 'For the day ones',
    items: [
      'An OG badge for everyone who was on the leaderboard in Season 1: by your name on the board and on your profile. Thank you for being here from the start.',
    ],
  },
  {
    v: '1.05', date: '2026-10-25', title: 'Up next first, and simpler reminders',
    items: [
      'Home opens on Up next, with today’s numbers in one small row underneath.',
      'Stats is one tap away from every page, next to the leaderboard at the top.',
      'How often: Once, Repeats or Times per week. Weekly goals have their own option instead of hiding in the repeat list.',
      'Reminders in one place: a quest’s reminders (including several times a day) under Reminders on the quest, and every daily reminder in Settings → Reminders.',
      'Pick your theme from small swatches.',
      'A shorter welcome: four screens instead of nine.',
      'An open quest no longer shows its priority twice.',
      'Test reminder shows a sample notification without adding a quest.',
      'The Developer page and API are gone.',
    ],
  },
  {
    v: '1.04', date: '2026-10-25', title: 'A tidier leaderboard, and no example quests',
    items: [
      'Leaderboard: the season opens first, with Legacy on the second tab.',
      'Leaderboard: your board options (showing on the board, a public profile, your board name) are in a Settings dropdown.',
      'Leaderboard: the top 15, then Show more for everyone else.',
      'Leaderboard: past seasons at the bottom, each with its final standings.',
      'No more example quests: a new list starts empty, and old examples are removed.',
      'A weekly goal’s label matches the other chips on a quest.',
      'Fixed: your rank on the leaderboard could get stuck below the one on your season card. It now catches up.',
    ],
  },
  {
    v: '1.03', date: '2026-10-25', title: 'A monochrome theme',
    items: [
      'Mono: a new theme in greys only (Settings → Theme).',
      'Home: when Up next can’t show all your quests, a small “+N more quests” link shows how many more there are.',
      'Fixed: the reminder unit (minutes, hours, days) was cut off to “h..” on phones.',
    ],
  },
  {
    v: '1.02', date: '2026-10-25', title: 'Custom timers, yearly repeats and the back button',
    items: [
      'Focus: a Custom timer. Run it for a set time (hours and minutes) or until a time you pick. Long timers show hours.',
      'Repeats: Every year, and monthly or yearly repeats keep to their date (the 31st stays the 31st, or the month’s last day).',
      'Your phone’s back button or back swipe closes the New quest sheet, the reminders panel and dialogs instead of leaving the page.',
    ],
  },
  {
    v: '1.01', date: '2026-10-25', title: 'Fixes: Cookie’s missing moves',
    items: [
      'Cookie has his own art for 28 more moves: the peek over the screen edge, tail chase, sneeze, boop, heart eyes, a dramatic cry, melting into a nap, the loaf, squish, sulk, cheer and more.',
      'Pull to refresh with Cookie: he stretches, hangs on and spins, like Mochi.',
      'Fixed: a smudged, blurry pose Cookie sometimes made after a tap. He now jumps up surprised instead.',
      'No more glow around the cats in dark mode.',
      'Fixed: a second Cookie sometimes showing up beside him, after an update or between moves.',
      'Cookie lands properly when you throw him: flat on the floor, then back up to sit. His old smudged surprised pose is gone.',
      'Cookie stays the same size in every move: walking, running and sniffing no longer shrink him, and his newer moves no longer make him bigger.',
      'Mochi has a new walk.',
      'The name field is gone from Settings.',
    ],
  },
  {
    v: '1.0', date: '2026-10-24', title: 'Two cats, a new night look and easier ranks',
    items: [
      'Meet Cookie, Mochi’s orange twin brother, with his own art. Pick your cat in Settings → Cat.',
      'Both cats redrawn from new high-quality art: sharper on phone screens, and Mochi has 23 new animations (melting into a nap, a double-tap squish, a loaf, pull-to-refresh poses and more).',
      'Dark mode redesigned: a calm night look with glowing accents. Switching themes is instant.',
      'Seasons now end every second Sunday at midnight (India time), and ranks are much easier to climb. Master has no top: Master 1, 2, 3 and up, a level every 50 EXP.',
      'A pop-up (and a notification if TaskFlow is in the background) when you reach a new rank.',
      'Profiles: tap a name on the leaderboard. Make yours public from the Leaderboard to show your ranks, past seasons, streaks, totals and a year of activity; it stays private until you do.',
      'Delete your account and all your data from Settings, any time.',
      'This page: every update, listed here.',
      'Fixed: the leaderboard flickering and hiding the podium, and a background sync that kept running for nothing.',
      'Fixed: example quests (like “Submit lab report” or “Water the plants”) showing up among your own quests after signing in. They are removed from your account and devices.',
    ],
  },
  {
    v: '0.9', date: '2026-10-23', title: 'Dark mode, seasons and fair play',
    items: [
      'Dark mode, ranked two-week seasons and your own name on the board.',
      'New rank badges, from Iron to Master.',
      'The leaderboard limits how fast EXP can grow, and leaving it hides you instead of deleting you.',
      'A wider filter for swear words and slurs in names (English, Hinglish, Manglish and Tanglish).',
      'Mochi stays on his spot on the bar when you zoom in or out.',
    ],
  },
  {
    v: '0.8', date: '2026-10-21', title: 'Leaderboard sounds and a fresh icon',
    items: [
      'Rank sounds and Mochi lines on the leaderboard, and a celebration when you hit your daily target.',
      'New app icons and a rounded logo on every page.',
      'Install TaskFlow from Settings, with steps when your browser hasn’t offered it yet.',
      'Returning people skip the welcome screens on any device.',
      'More words understood when you add quests by typing or by voice.',
    ],
  },
  {
    v: '0.7', date: '2026-10-20', title: 'Reminders that reach you',
    items: [
      'Reminders arrive even when the app is closed, with several alerts and lead-up alerts by priority.',
      'Weekly goals, repeats on chosen weekdays and quests that count once a day.',
      'Daily nudges (water, meals, a walk) and a redesigned calendar.',
      'An opt-in leaderboard, ranked by EXP.',
      'Mochi learned more idles and taps, and the moonwalk (now the Michael Jackson dance).',
    ],
  },
  {
    v: '0.6', date: '2026-10-19', title: 'Sign in, sync and sketches',
    items: [
      'Sign in with Google: your quests stay the same on every device.',
      'Google Calendar: your dated quests in a TaskFlow calendar, and your events alongside them.',
      'Sketches and handwriting on quests.',
      'Sounds, and Mochi’s voice.',
      'Privacy policy and cookies pages.',
    ],
  },
];
export const APP_VERSION = CHANGELOG[0].v;
