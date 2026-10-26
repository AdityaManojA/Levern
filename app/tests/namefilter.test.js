import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isClean, shownName, tidyName } from '../js/namefilter.js';

test('ordinary names pass, including ones that hide a bad word', () => {
  for (const n of ['Aditya', 'Adwaitha', 'Godfrey', 'Kshitij', 'Ashit Kumar', 'Dikshit', 'Dixit', 'Nazia', 'Nazim', 'Nigam', 'Nigel', 'Nigeria',
    'Kunnath', 'Kunnamangalam', 'Thayyil', 'Fukuda', 'Charles Dickens', 'Dickinson', 'Jess Hitchens', 'Hancock', 'Babcock', 'Mc Donald',
    'McDonald', 'B. C. Nair', 'P P Nair', 'K K Menon', 'MC Jose', 'Therapist Tom', 'Cucumber Club', 'Class Act', 'Grape', 'Scunthorpe FC',
    'Li Na', 'Mochi fan 99', 'George', 'Gyorgy', 'Othello', 'Botha', 'Pundalik', 'Randall', 'Brandi', 'Grandiose', 'Claude', 'Lauder',
    'Poornima', 'Puran', 'Puru', 'Pure', 'Mayuri', 'Myra', 'Mira', 'Miranda', 'Kalapani', 'Kazhakkoottam', 'Sreekuttan', 'Ammukutty', 'Kutti',
    'Unnikuttan', 'Vedika', 'Vedant', 'Thendral', 'Mukund', 'Kundan', 'Muthe', 'Ponnu', 'Mallu', 'Assam', 'Hassan', 'Cassie', 'Bass player',
    'Analise', 'Anusha', 'Sexton', 'Titus', 'Pedro', 'Homolka', 'Thorny rose', 'Sunny', 'Ooty', 'Kannan', 'Poori lover', 'Mone'])
    assert.ok(isClean(n), n);
});

test('English swearing, slang and slurs are caught through the usual disguises', () => {
  for (const n of ['fuck', 'FUCK you', 'f.u.c.k', 'f u c k', 'fuuuuck', 'fvck', 'sh1t', '$hit head', 'b1tch', 'biatch', '@ss', 'ass', 'big tits',
    'dick', 'dickhead', 'BigCock', 'motherfucker', 'Ballz', 'B@llz', 'ballz69', 'balls', 'N1gga', 'nibba', 'niqqa', 'faggot', 'tranny',
    'retard', 'kys', 'Hitler', 'Sieg Heil', 'pornstar', 'horny boy', 'milfhunter', 'cumshot', 'sexy', 'thot', 'stfu', 'bc', 'MF', 'chink'])
    assert.equal(isClean(n), false, n);
});

test('Hindi, Malayalam and Tamil swears and slurs are caught', () => {
  for (const n of ['chutiya', 'bhenchod', 'madarchod', 'bsdk', 'gandu', 'Randi', 'lund', 'lavda', 'bhosdike',
    'PooriMone', 'poori mone', 'Thaayoli', 'th@yoli', 'thayoli123', 'Myyyre', 'myre', 'Mayiru', 'mairu', 'Kunna', 'Pundachi', 'pundachi mone',
    'Thallipoli', 'Oombi', 'Thevidiya', 'Ommala', 'Pulayadimone', 'naayinte mone', 'pattimone', 'koothichi', 'kazhuveri', 'Kandaroli', 'pundai'])
    assert.equal(isClean(n), false, n);
});

test('names on the board fall back to Someone', () => {
  assert.equal(shownName('  Mochi   Queen '), 'Mochi Queen');
  assert.equal(shownName('sh1t lord'), 'Someone');
  assert.equal(shownName(''), 'Someone');
  assert.equal(tidyName('x'.repeat(40)).length, 30);
  // names already on the board (up to 30 characters) are shown in full
  assert.equal(shownName('Abcdefghij Klmnopqrst Uvwxyzabc'), 'Abcdefghij Klmnopqrst Uvwxyzab');
  assert.equal(shownName('Mochi Fan Club Kerala Twenty6'), 'Mochi Fan Club Kerala Twenty6');
});
