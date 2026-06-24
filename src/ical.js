function unfoldLines(input) {
  return input
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .reduce((acc, line) => {
      if ((line.startsWith(' ') || line.startsWith('\t')) && acc.length) {
        acc[acc.length - 1] += line.slice(1);
      } else {
        acc.push(line);
      }
      return acc;
    }, []);
}

function parseParamsAndValue(raw) {
  const [left, ...valueParts] = raw.split(':');
  const value = valueParts.join(':');
  const [name, ...paramPairs] = left.split(';');
  const params = {};

  for (const pair of paramPairs) {
    const [k, v = ''] = pair.split('=');
    params[k.toUpperCase()] = v;
  }

  return { name: name.toUpperCase(), params, value };
}

function parseICalDate(rawValue) {
  if (!rawValue) return null;
  if (/^\d{8}$/.test(rawValue)) {
    return `${rawValue.slice(0, 4)}-${rawValue.slice(4, 6)}-${rawValue.slice(6, 8)}T00:00:00.000Z`;
  }

  if (/^\d{8}T\d{6}Z$/.test(rawValue)) {
    const iso = `${rawValue.slice(0, 4)}-${rawValue.slice(4, 6)}-${rawValue.slice(6, 8)}T${rawValue.slice(9, 11)}:${rawValue.slice(11, 13)}:${rawValue.slice(13, 15)}.000Z`;
    return new Date(iso).toISOString();
  }

  if (/^\d{8}T\d{6}$/.test(rawValue)) {
    const localIso = `${rawValue.slice(0, 4)}-${rawValue.slice(4, 6)}-${rawValue.slice(6, 8)}T${rawValue.slice(9, 11)}:${rawValue.slice(11, 13)}:${rawValue.slice(13, 15)}.000Z`;
    return new Date(localIso).toISOString();
  }

  const fallback = new Date(rawValue);
  return Number.isNaN(fallback.getTime()) ? null : fallback.toISOString();
}

function normalizeEvent(event, source) {
  const start = parseICalDate(event.DTSTART);
  const end = parseICalDate(event.DTEND);

  return {
    id: `${source}:${event.UID || event.DTSTART || Math.random().toString(16).slice(2)}`,
    source,
    uid: event.UID || null,
    title: event.SUMMARY || 'Untitled Event',
    description: event.DESCRIPTION || '',
    location: event.LOCATION || '',
    start,
    end,
    allDay: Boolean(event.DTSTART && /^\d{8}$/.test(event.DTSTART)),
    raw: event,
  };
}

function parseIcs(icsText, source = 'upload') {
  if (!icsText || typeof icsText !== 'string') {
    throw new Error('ICS content is required');
  }

  const lines = unfoldLines(icsText);
  const events = [];
  let currentEvent = null;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line) continue;

    if (line === 'BEGIN:VEVENT') {
      currentEvent = {};
      continue;
    }

    if (line === 'END:VEVENT') {
      if (currentEvent) {
        const normalized = normalizeEvent(currentEvent, source);
        if (normalized.start) {
          events.push(normalized);
        }
      }
      currentEvent = null;
      continue;
    }

    if (!currentEvent || !line.includes(':')) continue;

    const { name, value } = parseParamsAndValue(line);
    currentEvent[name] = value;
  }

  if (!events.length) {
    throw new Error('No valid VEVENT records found in ICS data');
  }

  return events;
}

module.exports = {
  parseIcs,
  parseICalDate,
};
