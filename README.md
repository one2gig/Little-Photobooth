# Little Booth

A cozy two-phone photobooth. Each person uses their own camera. A shared countdown captures both photos, the phones exchange the pictures directly, and both people can download the same decorated strip.

Photos stay in memory for the session. The server stores booth coordination only: room metadata, two participant slots, and shot status. It does not store image files.

## Local preview

```bash
npm install
npm run dev
```

Open the app in two browsers on this computer. Create a booth in one and join with the code in the other. The dev server holds the booth list, so the browsers do not need to share storage. Restart `npm run dev` after pulling this change. Two phones still need the Supabase setup below.

## Scripts

- `npm run dev` starts the web app
- `npm test` runs unit tests
- `npm run test:e2e` runs the two-phone browser flow
- `npm run build` typechecks and builds for production

## Supabase

1. Create a project and run [supabase/migrations/20261016000000_booth.sql](supabase/migrations/20261016000000_booth.sql).
2. Deploy every function in `supabase/functions`. JWT verification is off because participants use private booth tokens, not accounts. The anon key may call the functions; the token authorizes the action.
3. Copy `.env.example` to `.env`:

```
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

4. Schedule `expire-booth` every few minutes, or call the `expire_booths` database function. Opening a booth also expires it if the invite or idle timer has passed.

Row Level Security is enabled on every table and there are no client policies. Edge Functions use the service role. Do not put the service role key in frontend code.

Optional TURN, for networks that block direct peer connections:

```
VITE_TURN_URL=
VITE_TURN_USERNAME=
VITE_TURN_CREDENTIAL=
```

A TURN relay can see image traffic. Pick a provider that matches the privacy promise, and tell people the other participant receives each photo. The app does not claim a stronger guarantee than the peer connection provides.

## Deploy

Host the Vite app on Vercel over HTTPS. Mobile cameras do not work on insecure origins. Set the same `VITE_` variables in the project, then run `npm run build`.

There is a web app manifest for adding Little Booth to a home screen. Session data is not cached for offline use.

## Privacy

- The camera starts only after Enable my camera. The microphone is never requested.
- Each phone captures its own frame, compresses a JPEG, and sends it over an encrypted WebRTC data channel.
- Signaling uses short-lived session rows and is deleted after the other phone reads it. Image bytes are not written there.
- Ending the booth or leaving the page stops camera tracks, closes the peer connection, and drops in-memory photos.
- A room code only invites someone. Controlling the booth requires that phone's participant token.
- Downloads and screenshots stay on the person's device. Little Booth cannot delete those copies.

## Device checks

Test on real phones, not only desktop emulation.

| Check | iOS Safari | Android Chrome |
| --- | --- | --- |
| Grant and deny camera permission | Required | Required |
| Front camera and flip | Required | Required |
| Switch apps and return | Required | Required |
| Realtime reconnect | Required | Required |
| Capture and transfer | Required | Required |
| Download the strip | Required | Required |
| Portrait and landscape | Required | Required |
