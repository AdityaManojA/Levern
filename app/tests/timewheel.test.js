import { test } from 'node:test';
import assert from 'node:assert/strict';
import { timeWheelHTML, fmtTime, setTimeWheel } from '../js/timewheel.js';

test('timewheel: fmtTime formats 24-hour time strings or empty string correctly', () => {
  assert.equal(fmtTime(''), 'No time');
  assert.equal(fmtTime(null), 'No time');
  assert.equal(fmtTime('10:00'), '10:00 AM');
  assert.equal(fmtTime('22:00'), '10:00 PM');
  assert.equal(fmtTime('00:15'), '12:15 AM');
  assert.equal(fmtTime('12:30'), '12:30 PM');
});

test('timewheel: timeWheelHTML renders structured wheels container, colon separator, and distinct footer buttons', () => {
  const html = timeWheelHTML('22:00', { name: 'time', label: 'Due time' });

  // Must have outer panel and dedicated wheels container
  assert.ok(html.includes('class="tw-panel"'), 'has tw-panel');
  assert.ok(html.includes('class="tw-wheels"'), 'has dedicated tw-wheels container');

  // Must have a time separator between hour and minute
  assert.ok(html.includes('class="tw-sep"'), 'has tw-sep colon separator');
  assert.ok(html.includes('aria-hidden="true">:</div>'), 'colon has aria-hidden');

  // Three wheel columns: hour, minute, AM/PM
  assert.ok(html.includes('data-tw-col="h"'), 'has hour column');
  assert.ok(html.includes('data-tw-col="m"'), 'has minute column');
  assert.ok(html.includes('data-tw-col="p"'), 'has AM/PM column');
  assert.ok(html.includes('class="tw-band"'), 'has selection band');

  // Dedicated footer buttons, not generic underlined .link
  assert.ok(html.includes('class="tw-btn-clear" data-tw-clear>No time</button>'), 'has styled clear button');
  assert.ok(html.includes('class="tw-btn-done" data-tw-done>Done</button>'), 'has styled done button');
  assert.ok(!html.includes('class="link" data-tw-clear'), 'should not use generic .link for clear');
  assert.ok(!html.includes('class="link" data-tw-done'), 'should not use generic .link for done');
});
