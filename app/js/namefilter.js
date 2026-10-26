// Names people pick (the greeting name and the leaderboard name), checked for swearing, sexual words and slurs,
// in English (with internet slang), Hindi/Hinglish, Malayalam/Manglish and Tamil/Tanglish.
// There's no server code (free Firebase plan), so the check runs here: when the name is typed, before it's
// published, when other people's names are shown, and at start-up (a saved name that fails has to be replaced:
// see namecheck.js). firestore.rules has a short backstop list of the worst ones.
//
// It sees through the usual tricks: capitals and joined words ("PooriMone"), spacing and dots ("f.u c k"),
// number and symbol swaps ("sh1t", "@ss", "b!tch"), and stretched letters ("fuuuck", "myyyre"). Spelling
// variants (Manglish th/t, oo/u, y/i…) are listed out rather than guessed, because guessing turns ordinary names
// into bad words ("Puran" from "pooran", "Kalapani" from "kazhapp").
// Lots of real names contain a bad word ("Kshitij", "Nazia", "Kunnath", "Dickens", "George", "poori" the bread),
// so only words that never turn up inside a name are matched anywhere; the rest only as a whole word.

// matched anywhere inside a word
const ANYWHERE = [
  // English
  'fuck', 'fcuk', 'fvck', 'phuck', 'shit', 'bitch', 'biatch', 'bastard', 'cunt', 'pussy', 'whore', 'slut', 'wank', 'twat',
  'bollock', 'asshole', 'arsehole', 'butthole', 'dumbass', 'jackass', 'dipshit', 'bullshit', 'horseshit', 'motherf', 'mofo',
  'dick', 'cock', 'penis', 'vagina', 'dildo', 'jizz', 'cumshot', 'cumslut', 'blowjob', 'handjob', 'rimjob', 'deepthroat', 'boner',
  'ballsack', 'nutsack', 'scrotum', 'testicle', 'titties', 'boobies', 'nipple', 'porn', 'hentai', 'orgasm', 'horny',
  'masturbat', 'jerkoff', 'jackoff', 'fingerbang', 'creampie', 'bukkake', 'milf', 'pedophil', 'paedophil', 'molest', 'incest',
  'bestiality', 'necrophil', 'smegma', 'douchebag', 'bellend', 'wanker', 'tosser', 'cuckold', 'killyourself',
  // slurs (race, religion, sexuality, gender, disability)
  'nigg', 'niqq', 'nigga', 'nibba', 'jigaboo', 'porchmonkey', 'wetback', 'beaner', 'raghead', 'towelhead', 'faggot', 'fagot', 'tranny',
  'shemale', 'ladyboy', 'retard', 'mongoloid', 'hitler', 'siegheil', 'whitepower',
  // Hindi / Hinglish
  'chutiya', 'chutia', 'chutiye', 'chootiya', 'madarchod', 'maderchod', 'madarchoot', 'behenchod', 'bahenchod', 'bhenchod', 'bhanchod',
  'bhosdi', 'bhosda', 'bhosad', 'bakchod', 'gaandu', 'lavde', 'lavda', 'lawda', 'lodu', 'raand', 'haramkhor', 'haramzada', 'haraamzaada',
  'haramjada', 'bhadwa', 'bhadva', 'chinaal', 'jhaatu', 'maakichut', 'maakaloda',
  // Malayalam / Manglish
  'thayoli', 'thaayoli', 'thayyoli', 'tayoli', 'thallipoli', 'thalliyoli', 'thallipoly', 'thalipoli', 'kandaroli', 'poorimon', 'poorimol',
  'pooriman', 'poorimakan', 'poorimol', 'pundachi', 'pundamon', 'pundimon', 'pundiyude', 'pundiketta', 'myrandi', 'mairandi', 'mayirandi',
  'mayiru', 'oombi', 'oomban', 'oombal', 'umbiya', 'koothichi', 'thevidiya', 'thevadiya', 'thevdiya', 'thevadichi', 'kazhappi', 'kazhuveri',
  'kazhuvari', 'pulayadi', 'naayintemon', 'nayintemon', 'naayintemol', 'pattimon', 'pattimol', 'thendimon', 'kuthichi', 'vedichi', 'vedimon',
  // Tamil / Tanglish
  'pundai', 'ommala', 'thevidiyapaiya', 'saavugraaki',
];
// taken out before matching: ordinary names and words that contain one of the words above
const SAFE = ['kshit', 'ashit', 'dikshit', 'scunthorpe', 'swank', 'shitake', 'shiitake', 'penistone', 'dickens', 'dickson', 'dickinson', 'riddick',
  'benedick', 'hancock', 'peacock', 'cockburn', 'cocktail', 'cockpit', 'cockroach', 'cockatoo', 'babcock', 'hitchcock', 'woodcock', 'shuttlecock',
  'glasscock', 'alcock', 'thorny', 'lodur', 'melodu', 'kalodu',
  'poorn'];   // Poornima, Poorna: with the double o squashed they'd read "porn"
// only as a whole word
const WHOLE = [
  // English
  'ass', 'arse', 'azz', 'tit', 'tits', 'titty', 'boob', 'boobs', 'balls', 'ballz', 'cum', 'cums', 'jizm', 'fag', 'fags', 'dyke', 'homo',
  'hoe', 'hoes', 'thot', 'sex', 'sexy', 'nude', 'nudes', 'xxx', 'anal', 'anus', 'orgy', 'orgies', 'rape', 'raped', 'rapist', 'pedo', 'paedo',
  'nazi', 'nazis', 'kkk', 'kys', 'kms', 'wtf', 'stfu', 'gtfo', 'mfer', 'fuk', 'fck', 'fuq', 'dik', 'cok', 'knob', 'clit', 'skank', 'prick',
  'pricks', 'douche', 'spic', 'spick', 'chink', 'chinky', 'coon', 'gook', 'kike', 'paki', 'pakis', 'gypo', 'spaz', 'tard', 'negro', 'negros',
  'piss', 'pissed', 'crap', 'turd', 'bugger', 'chode', 'cuck', 'simp', 'incel', 'sperm', 'semen', 'condom', 'bitchy', 'beyotch', 'bish',
  // Hindi / Hinglish
  // ("kutti" isn't here: in Malayalam it's "little one", a common pet name)
  'bkl', 'bsdk', 'mkc', 'lund', 'loda', 'lode', 'lauda', 'laude', 'chut', 'choot', 'chuchi', 'gand', 'gaand', 'gandu', 'randi', 'kuttiya', 'kamina', 'kamine', 'harami', 'tatti', 'jhatu', 'hijra', 'hijda', 'chamar', 'bhangi', 'chuhra', 'katwa', 'katua', 'jihadi',
  // Malayalam / Manglish
  'myre', 'myru', 'myr', 'mayir', 'mayire', 'mairu', 'maire', 'meyre', 'myran', 'mairan', 'mayiran', 'pooru', 'poorr', 'pooran', 'kunna',
  'kunne', 'kunnan', 'kunnamon', 'kunnamone', 'kundi', 'thendi', 'theval', 'vedi', 'oombu', 'umbu', 'koothi', 'punda', 'pundi', 'theetam',
  'koothara', 'pannadai', 'porukki',
  // Tamil / Tanglish
  'otha', 'koodhi', 'baadu', 'sootha', 'sunniya',
];
// two-letter swears, only when typed together as their own word ("bc"), not from initials ("B. C. Nair")
// ("mc" isn't here: McDonald, MC Jose)
const SHORT = ['bc', 'mf', 'fk'];
// insults made of ordinary words ("poori" is bread, "mone" is son), read across the words of the name
const PHRASES = ['poorimone', 'poorimon', 'poorimol', 'naayintemone', 'nayintemone', 'pattimone', 'thendimone', 'pulayadimone', 'sonofabitch',
  'killyourself', 'heilhitler', 'whitepower', 'siegheil'];

const SWAPS = { '0': 'o', '1': 'i', '!': 'i', '|': 'i', '3': 'e', '4': 'a', '@': 'a', '5': 's', '$': 's', '7': 't', '+': 't', '8': 'b', '9': 'g', '€': 'e', '¡': 'i' };
// lower case, accents off, symbol and number swaps; "PooriMone" becomes "poori mone"
const swap = s => String(s || '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/[0-9!|@$+€¡]/g, c => SWAPS[c] || c);
const squash = s => s.replace(/(.)\1+/g, '$1');   // "fuuuck" -> "fuck"
const WHOLE_SET = new Set(WHOLE);

// The words of a name, with spelled-out runs joined back up: "f.u.c.k off" -> ["fuck", "off"].
// Words aren't run together otherwise, so "Jess Hitchens" isn't read as "...shit...".
function words(s) {
  const out = [];
  let run = '';
  for (const t of s.split(/[^a-z]+/).filter(Boolean)) {
    if (t.length <= 2) { run += t; continue; }
    if (run) { out.push(run); run = ''; }
    out.push(t);
  }
  if (run) out.push(run);
  return out;
}

export function isClean(name) {
  const s = swap(name), ws = words(s);
  for (const w of ws) {
    let x = w;
    for (const safe of SAFE) x = x.split(safe).join(' ');
    for (const v of [x, squash(x)]) if (ANYWHERE.some(b => v.includes(b))) return false;
    if (WHOLE_SET.has(w) || WHOLE_SET.has(squash(w))) return false;
  }
  for (const p of s.split(/[^a-z]+/)) if (SHORT.includes(p)) return false;
  const all = ws.join('');
  if (PHRASES.some(p => all.includes(p) || squash(all).includes(squash(p)))) return false;
  return true;
}

// the same 30 characters the board always allowed (firestore.rules), so no name already on it gets shortened
export const MAX_BOARD_NAME = 30;
// tidy what was typed: single spaces, no control characters, at most 30 characters
export const tidyName = s => String(s || '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_BOARD_NAME);

// the name to show for someone on the board: theirs if it's fine, otherwise "Someone"
export const shownName = name => { const t = tidyName(name); return t && isClean(t) ? t : 'Someone'; };
