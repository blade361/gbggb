# gbggb

Minimal iCal/ICS import app with:

- `.ics` file import
- Web calendar URL import (Booking.com-style ICS feed)
- Normalized in-memory event model
- Basic API and browser UI

## Run

```bash
npm install
npm start
```

Open `http://localhost:3000`.

## API

- `POST /api/import/file` body: raw ICS text
- `POST /api/import/url` body: `{ "url": "https://.../calendar.ics" }`
- `GET /api/events` list imported events

## Test

```bash
npm test
```
