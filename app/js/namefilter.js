// Leaderboard names: what someone picks to be called on the board, checked for swearing and slurs.
// There's no server code (free Firebase plan), so the check runs here: when the name is typed, before it's
// published, and again when other people's names are shown (names written by older versions get caught too).
// It catches the common tricks: capitals, spacing and dots ("f.u c k"), number swaps ("sh1t", "@ss"), and
// stretched letters ("fuuuck"). Short words that hide inside ordinary words ("ass" in "class") only count
// as a whole word.

// words that are never part of an ordinary name, matched anywhere in it
// Careful with this list: lots of real names hide a bad word ("Kshitij", "Nazia", "Kunnath", "Fukuda", "Dickens"),
// so only words that never turn up inside a name go here; the rest are in WHOLE.
const ANYWHERE = ['fuck', 'shit', 'bitch', 'bastard', 'cunt', 'pussy', 'whore', 'slut', 'wank', 'twat', 'bollock', 'asshole', 'arsehole',
  'motherf', 'nigg', 'faggot', 'retard', 'porn', 'penis', 'vagina', 'dildo', 'jizz', 'hitler', 'tranny',
  // common Hindi and Malayalam swears, spelled the usual Latin ways
  'chutiya', 'chutia', 'madarchod', 'behenchod', 'bhenchod', 'bhosdi', 'thayoli', 'lavda'];
// names that contain one of the words above, taken out before checking
const SAFE = ['kshit', 'ashit', 'scunthorpe', 'swank', 'shitake', 'penistone'];
// short ones, or ones inside ordinary words and names, only as a whole word
const WHOLE = ['ass', 'arse', 'tit', 'tits', 'fag', 'hoe', 'sex', 'kys', 'wtf', 'stfu', 'cum', 'dick', 'dicks', 'cock', 'cocks', 'rape', 'rapist',
  'spic', 'nazi', 'kike', 'chink', 'fuk', 'fck', 'boob', 'boobs', 'randi', 'loda', 'lauda', 'gandu', 'myre', 'myran', 'pooru', 'kunna', 'punda'];

const SWAPS = { '0': 'o', '1': 'i', '!': 'i', '|': 'i', '3': 'e', '4': 'a', '@': 'a', '5': 's', '$': 's', '7': 't', '+': 't', '8': 'b', '9': 'g' };
const swap = s => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[0-9!|@$+]/g, c => SWAPS[c] || c);
const squash = s => s.replace(/(.)\1+/g, '$1');   // "fuuuck" -> "fuck"

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
  for (const w of words(swap(String(name || '')))) {
    let x = w;
    for (const safe of SAFE) x = x.split(safe).join(' ');
    for (const v of [x, squash(x)]) if (ANYWHERE.some(b => v.includes(b))) return false;
    if (WHOLE.includes(w) || WHOLE.includes(squash(w))) return false;
  }
  return true;
}

export const MAX_BOARD_NAME = 24;
// tidy what was typed: single spaces, no control characters, at most 24 characters
export const tidyName = s => String(s || '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_BOARD_NAME);

// the name to show for someone on the board: theirs if it's fine, otherwise "Someone"
export const shownName = name => { const t = tidyName(name); return t && isClean(t) ? t : 'Someone'; };
