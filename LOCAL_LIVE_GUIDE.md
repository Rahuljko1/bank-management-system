# Run from your own computer

This guide shares the project from the computer running Node.js and MySQL. It is intended for a college demo, not for real banking or permanent public hosting.

## What is already configured

- The Node server now serves the frontend and API from `http://localhost:4000`.
- This keeps login and session cookies on one origin when a Cloudflare Tunnel is used.
- No router port-forwarding is required. Never expose MySQL (port 3306) to the internet.

## Manual steps

1. Start your local MySQL service.
2. Open `server/.env` and use the local values in `.env.example`. For local testing set `NODE_ENV=development` and include `http://localhost:4000` in `FRONTEND_ORIGINS`.
3. In a terminal, run:

   ```powershell
   cd "E:\Do Not Delete\PROGRAM\SMART BANKING MANAGEMENT SYSTEM\server"
   npm start
   ```

4. Open `http://localhost:4000` and verify registration/login locally.
5. Install Cloudflare's `cloudflared` for Windows. Then, in a second terminal, run:

   ```powershell
   cloudflared tunnel --url http://localhost:4000
   ```

6. Copy the generated `https://*.trycloudflare.com` URL. Leave this terminal open.
7. Stop the Node server with `Ctrl+C`. In `server/.env`, set:

   ```text
   NODE_ENV=production
   TRUST_PROXY=1
   FRONTEND_ORIGINS=https://YOUR-TRYCLOUDFLARE-URL
   ```

   Use the exact URL from step 6 with no trailing slash.
8. Start the Node server again with `npm start` and open that HTTPS URL from a phone on mobile data.

## Limits

- The Quick Tunnel URL changes when the tunnel process stops.
- The website is unavailable when the computer, MySQL, Node server, or tunnel is off.
- For a stable URL, use a named Cloudflare Tunnel and a domain you control.
