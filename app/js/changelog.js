// What's new: one entry per release, newest first (Settings → What's new). Add an entry here with every update;
// the first one is the version shown at the bottom of Settings. A new first entry is also shown once to every person
// as a pop-up (updatepop.js), so bump v for every release. Optional: note (an intro line) and tip (shown at the end).
export const CHANGELOG = [
  {
    v: '1.14', date: '2026-10-28', title: 'Seamless Focus Music, Nature Ambiances & Cleaner Themes',
    note: 'Focus music now loops continuously without awkward pauses or silences, new classical pieces and gentle nature sounds keep you in flow, and all emojis have been removed from the focus screen and theme selector for a calm, minimal workspace.',
    tip: 'Try Forest Vibes or Mozart in Focus mode for long, uninterrupted work sessions!',
    items: [
      'Continuous, Seamless Music: All classical pieces now loop continuously with zero gaps or sudden silences at the end, giving you a smooth and uninterrupted background flow.',
      'New Classical Pieces: Added Mozart’s Piano Sonata in C and Pachelbel’s Canon in D to your focus music collection.',
      'Soothing Nature & White Noise: Gentle Light Rain, soothing Forest Vibes with distant birdsong, and warm Soft White Noise let you block out everyday distractions without overpowering your thoughts.',
      'Emoji-Free Focus Mode: Removed icons and emojis from the audio controls and song selector for a distraction-free screen.',
      'Pure Theme Names: Cleaned up theme labels and removed all emojis from the theme picker, with dedicated names for Light Mode, Dark Mode, Monochrome Light, Monochrome Light Accent, Monochrome Dark, and Monochrome Dark Accent.',
    ],
  },
  {
    v: '1.13', date: '2026-10-28', title: 'Cookie Welcome, Upgraded Previews & Gentle Raindrops',
    note: 'Your cat choice now carries through the entire welcome tour, the theme selector features a realistic app preview mockup, relaxing raindrops with sweet piano join Focus mode, and all release notes are written clearly from your perspective as a user.',
    tip: 'Switch between Mochi and Cookie anytime under Settings → Cat, or try Raindrops in Focus mode!',
    items: [
      'Welcome with Cookie: If Cookie is your cat, he greets you by name during the welcome tour instead of introducing himself as Mochi.',
      'Upgraded Theme Preview: A realistic app screen mockup in Settings shows exactly how quest cards, checkmarks, and priority colors look in your chosen theme.',
      'Calmer Theme Menu: Cleaned up extra emojis and sparkles in the theme picker so it is easy to find your favorite look without visual clutter.',
      'Gentle Raindrops & Piano: Soft, comforting raindrop pitter-patter paired with sweet piano chords to keep you relaxed and focused.',
      'Clear, Everyday Descriptions: All updates are now explained simply from a user perspective so you always know what is new and how it helps you.',
    ],
  },
  {
    v: '1.12', date: '2026-10-28', title: 'Mono Accent Themes & Classical Focus Music',
    note: 'Added Mono Light & Dark Accent themes that spotlight your priority colors, an easier theme selector with a live card preview, and 5 relaxing full-length classical pieces for focus.',
    tip: 'Select your favorite classical piece in Focus mode for deep, continuous concentration!',
    items: [
      'Mono Accent Themes: A clean, quiet greyscale style that highlights your 6 quest priority colors so urgent tasks stand out immediately.',
      'Upgraded Theme Picker: A simple dropdown menu and live preview card so you can see exactly how cards and colors look before choosing.',
      'Long Classical Focus Music: 5 relaxing, full-length classical pieces (over 3 minutes each) to help you get into deep flow: Satie’s Gymnopédie No. 1, Debussy’s Clair de lune, Bach’s Prelude in C, Beethoven’s Moonlight Sonata, and Chopin’s Nocturne.',
      'Better Focus Sound: Replaced short, repetitive ambient loops with peaceful classical piano music.',
    ],
  },
  {
    v: '1.11', date: '2026-10-28', title: 'Monochrome Dark, Focus History & Classical Audio',
    note: 'Introducing a Monochrome Dark theme for night work, a log of your past focus sessions, peaceful classical focus music, and an easier way to save new quests.',
    tip: 'Check out Settings → Theme to try the new Mono Dark theme!',
    items: [
      'Monochrome Dark: A deep, eye-friendly dark theme in pure greys, perfect for working in low light.',
      'Past Focus Sessions: A dropdown below the focus timer lets you review all your completed focus sessions and points earned.',
      'Peaceful Focus Audio: Calming piano music inspired by Erik Satie’s Gymnopédie No. 1 to keep you relaxed and focused.',
      'Easier Quest Creation: A clear Save button and matching "x" button when creating quests so you never lose your edits.',
      'Smoother Mascot & Scrolling: Fixed page jitter on desktop and made sure your cat sits smoothly when sheets open.',
    ],
  },
  {
    v: '1.10', date: '2026-10-27', title: 'Durations, Micro-EXP, Tags & Ambient Audio',
    note: 'Quests now support durations (e.g. 2 hours at the gym), Micro-EXP for subtasks, hashtag organization, ambient focus sound loops, and interactive mobile notification actions.',
    tip: 'Try #tags like #work or #fitness in your quest titles, and switch on ambient audio in Focus mode!',
    items: [
      'Quest Durations: Set how long a task takes (like "2 hours at the gym"); overdue warnings wait until your full session is finished.',
      'Points for Subtasks: Earn 2 EXP every time you check off a subtask, keeping you motivated on bigger projects.',
      'Hashtags & Project Spaces: Add #tags to quest titles and click tags to filter your quests instantly.',
      'Background Focus Sounds: Relax with gentle background ambiance while your focus timer runs.',
      'Notification Quick Actions & Badge: Mark quests Done or Snooze directly from mobile notifications, with dynamic app badge counts.',
      'Fast & Reliable Sync: Offline saving is faster and smoother, sound effects play instantly, and your scores sync safely.',
    ],
  },
  {
    v: '1.09', date: '2026-10-26', title: 'TaskFlow is now Levern',
    note: 'Other apps were already established under names like ours, so we rebranded to a name that’s only ours: Levern, said /lev·earn/ (level up, earn). Same app, same quests, same cats. Your data, streaks and leaderboard progress are untouched, and the new address is getlevern.web.app.',
    tip: 'Reinstalling the app makes sure the full update is done: the new name and icon on your home screen, and the latest version everywhere.',
    items: [
      'New address: getlevern.web.app. Old TaskFlow links and bookmarks open the same page there automatically.',
      'Reminder notifications are tied to the old address, so turn them on again here: Settings → Reminders.',
      'Reliable Leaderboard EXP: Your score updates reliably and catches up automatically when you return to the app.',
      'The /lev·earn/ under the name now matches the app, with earn in the accent colour.',
      'Home greets you by your leaderboard name, or by the name in your email if you haven’t set one.',
      'The app icon is the black-and-white cat on every device, iPhone included. Reinstall the app to see it on your home screen.',
    ],
  },
  {
    v: '1.08', date: '2026-10-26', title: 'On time pays more',
    items: [
      'A quest finished after it was due earns half the EXP. Finish on time to get it all (the daily target bonus still counts).',
      'Tick an overdue quest and a pop-up tells you so, with a wink.',
      'Faster Leaderboard Catchup: Points you just earned appear on the leaderboard within minutes.',
      'Clearer Reminder Units: Reminder times and units fit cleanly on all phone screens without truncation.',
      'Easier Custom Timer: Time selectors in Focus mode are comfortable to tap and never get covered up.',
    ],
  },
  {
    v: '1.07', date: '2026-10-25', title: 'An aura for the top three',
    items: [
      'Finish a season in the top three and you wear an aura all next season: a turning gold, silver or aurora ring, a shimmering name and a sparkle, on the leaderboard and your profile. It passes to the new top three every season.',
      'The aura turns faster, with a bright highlight racing round the ring.',
      'Refreshing the leaderboard keeps it in place while it loads, and the first load shows the board’s outline instead of jumping.',
      'A new season shows everyone on the board at 0 EXP and Iron until they earn some. Ties go to the one with more EXP overall.',
    ],
  },
  {
    v: '1.06', date: '2026-10-25', title: 'For the day ones',
    items: [
      'An OG badge for everyone on the leaderboard in the first seasons (Seasons 1 to 3): by your name on the board and on your profile. Thank you for being here from the start.',
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
      'Removed unused settings to keep the menu simple and uncluttered.',
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
      'Accurate Season Ranks: Your rank always stays in sync between your profile and the leaderboard.',
    ],
  },
  {
    v: '1.03', date: '2026-10-25', title: 'A monochrome theme',
    items: [
      'Mono: a new theme in greys only (Settings → Theme).',
      'Home: when Up next can’t show all your quests, a small “+N more quests” link shows how many more there are.',
      'Clearer Reminder Units: Reminder times and units fit cleanly on all phone screens without truncation.',
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
      'Lively Mascot Taps: Cookie reacts to your taps with a crisp, clear surprised jump.',
      'No more glow around the cats in dark mode.',
      'Single Mascot on Navigation: Cookie stays reliably on his single spot along the navigation bar.',
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
      'A pop-up (and a notification if Levern is in the background) when you reach a new rank.',
      'Profiles: tap a name on the leaderboard. Make yours public from the Leaderboard to show your ranks, past seasons, streaks, totals and a year of activity; it stays private until you do.',
      'Delete your account and all your data from Settings, any time.',
      'This page: every update, listed here.',
      'Smooth Leaderboard: Loads smoothly without flickering, and uses less battery in the background.',
      'Personal Quest List: Starter example quests are kept out so you only ever see your own quests.',
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
      'Install Levern from Settings, with steps when your browser hasn’t offered it yet.',
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
      'Google Calendar: your dated quests in a Levern calendar, and your events alongside them.',
      'Sketches and handwriting on quests.',
      'Sounds, and Mochi’s voice.',
      'Privacy policy and cookies pages.',
    ],
  },
];
export const APP_VERSION = CHANGELOG[0].v;
