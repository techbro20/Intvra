# Ai.Intvra server

Backend for the Ai.Intvra desktop app: accounts (Google or email code), credits, and an AI proxy so users never need their own API keys.

- **Sign-in:** the app opens `GET /auth/login` in the browser. After Google or email verification, the browser hands a one-time code back to the app on a `127.0.0.1` loopback address, and the app exchanges it (with a PKCE verifier) at `POST /auth/token` for a session token.
- **Credits:** new accounts get `FREE_CREDITS`. Each AI answer costs 1 credit on paid plans and `FREE_ANSWER_COST` (default 2) on the free plan, so the 20 trial credits cover 10 answers. Credits are refunded if the AI provider fails. Listening (speech-to-text) is free but needs enough credits for one answer and has a daily cap (`FREE_STT_DAILY_LIMIT` for free accounts, `STT_DAILY_LIMIT` otherwise).
- **Trial abuse:** the free credits are granted when the app first exchanges its sign-in code, once per device (the app sends a hash of the OS machine ID). A second account on the same computer gets no free credits, and each network (IPv4 address or IPv6 /64) can claim at most `TRIAL_IP_LIMIT` trials per `TRIAL_IP_WINDOW_DAYS` (default 3 per 30 days). IPs are stored only as hashes; behind Caddy set `TRUST_PROXY=1` so the real client IP is used. Throwaway email domains are rejected at sign-in; see `BLOCKED_EMAIL_DOMAINS`, `ALLOWED_EMAIL_DOMAINS` and `DISPOSABLE_DOMAINS_FILE` in `.env.example`. Use `npm run admin -- grant <email> <credits>` to help a genuine user who was blocked.
- **Plans:** `free`, `payg`, `pro`, `lifetime`. Lifetime and admin accounts use their own API keys inside the app.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/auth/login?challenge&redirect_uri&state` | Browser sign-in page |
| POST | `/auth/token` | Exchange the one-time code for a session |
| GET | `/v1/me` | Current user, plan and credits |
| POST | `/v1/logout` | End the session |
| POST | `/v1/chat/completions` | OpenAI-compatible streaming answer (1 credit) |
| POST | `/v1/audio/transcriptions` | Speech-to-text (multipart `file`) |
| GET | `/health` | Health check |

`/v1/*` requires `Authorization: Bearer <session token>`.

## Run locally

Requires Node.js 22.13 or newer (uses the built-in `node:sqlite`).

```bash
cd server
npm install
cp .env.example .env   # set NODE_ENV=development, PUBLIC_URL=http://127.0.0.1:8787, TRUST_PROXY=0, and AI_API_KEYS
npm run dev
```

Without `RESEND_API_KEY`, development mode prints email sign-in codes to the console. The desktop app in development talks to `http://127.0.0.1:8787` by default (override with `INTVRA_API_URL`).

## Admin

```bash
npm run admin -- users
npm run admin -- user someone@example.com
npm run admin -- grant someone@example.com 100 "manual top-up"
npm run admin -- set-plan someone@example.com pro 2026-11-04
npm run admin -- admin you@example.com on      # use your own keys in the app
npm run admin -- stats
```

## Deploy on a Contabo VPS (Ubuntu)

1. **DNS:** add an `A` record `api.intvra.com` pointing to the VPS IP.

2. **Install Node.js and Caddy:**

   ```bash
   curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
   sudo apt-get install -y nodejs git
   sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
   sudo apt-get update && sudo apt-get install -y caddy
   ```

3. **App user and code:**

   ```bash
   sudo useradd --system --create-home --home-dir /opt/intvra intvra
   sudo -u intvra git clone https://github.com/techbro20/Intvra.git /opt/intvra/app
   cd /opt/intvra/app/server
   sudo -u intvra npm ci --omit=dev
   sudo -u intvra cp .env.example .env && sudo -u intvra nano .env
   ```

4. **systemd service** at `/etc/systemd/system/intvra.service`:

   ```ini
   [Unit]
   Description=Ai.Intvra server
   After=network.target

   [Service]
   User=intvra
   WorkingDirectory=/opt/intvra/app/server
   ExecStart=/usr/bin/node --env-file=.env src/index.js
   Restart=always
   RestartSec=3
   NoNewPrivileges=true

   [Install]
   WantedBy=multi-user.target
   ```

   ```bash
   sudo systemctl daemon-reload && sudo systemctl enable --now intvra
   sudo journalctl -u intvra -f
   ```

5. **HTTPS reverse proxy:** `/etc/caddy/Caddyfile`:

   ```
   api.intvra.com {
     reverse_proxy 127.0.0.1:8787 {
       flush_interval -1
     }
   }
   ```

   ```bash
   sudo systemctl reload caddy
   ```

   Caddy gets the TLS certificate automatically. `flush_interval -1` keeps answers streaming word by word.

6. **Firewall:** allow only SSH and web traffic.

   ```bash
   sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable
   ```

7. **Backups:** the whole database is `data/intvra.db`. Back it up daily, for example:

   ```bash
   sqlite3 /opt/intvra/app/server/data/intvra.db ".backup '/opt/intvra/backups/intvra-$(date +%F).db'"
   ```

**Updating:** `cd /opt/intvra/app && sudo -u intvra git pull && cd server && sudo -u intvra npm ci --omit=dev && sudo systemctl restart intvra`.
