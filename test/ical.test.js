const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { parseIcs } = require('../src/ical');
const { createApp, eventsStore } = require('../src/app');

const SAMPLE_ICS = `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:abc-123\nSUMMARY:Booked Stay\nDTSTART:20260701T120000Z\nDTEND:20260705T100000Z\nEND:VEVENT\nEND:VCALENDAR`;

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

test('parseIcs extracts and normalizes events', () => {
  const events = parseIcs(SAMPLE_ICS, 'upload');
  assert.equal(events.length, 1);
  assert.equal(events[0].uid, 'abc-123');
  assert.equal(events[0].title, 'Booked Stay');
  assert.equal(events[0].start, '2026-07-01T12:00:00.000Z');
});

test('file import endpoint imports ICS events', async () => {
  eventsStore.length = 0;
  const app = createApp();
  const port = await listen(app);

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/import/file`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/calendar' },
      body: SAMPLE_ICS,
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.imported, 1);
    assert.equal(data.total, 1);
  } finally {
    await close(app);
  }
});

test('url import endpoint fetches and imports ICS feed', async () => {
  eventsStore.length = 0;

  const feedServer = http.createServer((_, res) => {
    res.writeHead(200, { 'Content-Type': 'text/calendar' });
    res.end(SAMPLE_ICS);
  });

  const feedPort = await listen(feedServer);
  const feedUrl = `http://127.0.0.1:${feedPort}/calendar.ics`;

  const app = createApp();
  const appPort = await listen(app);

  try {
    const res = await fetch(`http://127.0.0.1:${appPort}/api/import/url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: feedUrl }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.imported, 1);
    assert.equal(data.total, 1);
  } finally {
    await close(app);
    await close(feedServer);
  }
});

test('url import validates URL format', async () => {
  eventsStore.length = 0;
  const app = createApp();
  const port = await listen(app);

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/import/url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'file:///tmp/calendar.ics' }),
    });

    assert.equal(res.status, 400);
    const data = await res.json();
    assert.match(data.error, /valid http\/https URL/i);
  } finally {
    await close(app);
  }
});
