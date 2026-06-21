const http = require('http');
const fs = require('fs');
const path = require('path');
const { parseIcs } = require('./ical');

const MAX_BODY_BYTES = 1024 * 1024;
const eventsStore = [];

function json(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY_BYTES) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function mergeEvents(newEvents) {
  const existing = new Set(eventsStore.map((event) => event.id));
  let added = 0;
  for (const event of newEvents) {
    if (!existing.has(event.id)) {
      eventsStore.push(event);
      existing.add(event.id);
      added += 1;
    }
  }
  return added;
}

async function fetchIcsFromUrl(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Failed to fetch URL: HTTP ${response.status}`);
    }
    return await response.text();
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Timed out while fetching calendar URL');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function isValidHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

function servePublicFile(res, filePath) {
  fs.readFile(filePath, 'utf8', (err, content) => {
    if (err) {
      json(res, 500, { error: 'Failed to load UI' });
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(content);
  });
}

function createApp() {
  return http.createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/') {
        const filePath = path.join(__dirname, '..', 'public', 'index.html');
        servePublicFile(res, filePath);
        return;
      }

      if (req.method === 'GET' && req.url === '/api/events') {
        json(res, 200, { events: eventsStore });
        return;
      }

      if (req.method === 'POST' && req.url === '/api/import/file') {
        const body = await readBody(req);
        if (!body.trim()) {
          json(res, 400, { error: 'ICS file content cannot be empty' });
          return;
        }

        const events = parseIcs(body, 'upload');
        const imported = mergeEvents(events);
        json(res, 200, { imported, total: eventsStore.length, events });
        return;
      }

      if (req.method === 'POST' && req.url === '/api/import/url') {
        const body = await readBody(req);
        let payload;

        try {
          payload = JSON.parse(body || '{}');
        } catch (_) {
          json(res, 400, { error: 'Request body must be valid JSON' });
          return;
        }

        if (!payload.url || !isValidHttpUrl(payload.url)) {
          json(res, 400, { error: 'A valid http/https URL is required' });
          return;
        }

        const icsText = await fetchIcsFromUrl(payload.url);
        const events = parseIcs(icsText, payload.url);
        const imported = mergeEvents(events);
        json(res, 200, { imported, total: eventsStore.length, events });
        return;
      }

      json(res, 404, { error: 'Not found' });
    } catch (error) {
      json(res, 400, { error: error.message || 'Import failed' });
    }
  });
}

module.exports = {
  createApp,
  eventsStore,
};
