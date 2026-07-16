# Canadian Shortcode Compliance Checker

PDF-based compliance review tool powered by Claude AI.  
Your team uploads a shortcode application PDF and gets a full scored report against CWTA guidelines and CASL — **no Anthropic account needed** for team members.

---

## How it works

```
Team member (browser)
      │  uploads PDF
      ▼
  This server          ← holds the API key securely
      │  sends PDF to Claude
      ▼
  Anthropic API        ← Claude reads the document
      │  streams back analysis
      ▼
  Team member sees
  scored report + findings
```

The API key lives only on the server. Team members just open a URL.

---

## Quick start (local / office network)

**Requirements:** Node.js 18 or higher — https://nodejs.org

```bash
# 1. Enter the project folder
cd shortcode-compliance-app

# 2. Set your Anthropic API key
#    Get one at: https://console.anthropic.com
export ANTHROPIC_API_KEY=sk-ant-api03-...

# 3. Start the server
node server.js
```

You'll see:
```
✅  Shortcode Compliance Checker running
   Local:   http://localhost:3000
   Share:   http://<your-ip>:3000
```

- **You:** open http://localhost:3000
- **Your team (same office network):** open http://YOUR-COMPUTER-IP:3000

> **Finding your IP:**  
> Mac/Linux: `ifconfig | grep "inet "` — look for 192.168.x.x  
> Windows: `ipconfig` — look for IPv4 Address

---

## Deployment options (so the whole team can use it from anywhere)

### Option A — Railway (easiest, free tier available)

1. Create account at https://railway.app
2. New Project → Deploy from GitHub repo (or drag the folder)
3. Add environment variable: `ANTHROPIC_API_KEY = sk-ant-...`
4. Railway gives you a public URL like `https://compliance.up.railway.app`
5. Share that URL with your team

### Option B — Render (also free tier)

1. Create account at https://render.com
2. New → Web Service → connect your repo
3. Build command: *(leave blank)*
4. Start command: `node server.js`
5. Add environment variable: `ANTHROPIC_API_KEY = sk-ant-...`
6. Share the `.onrender.com` URL

### Option C — Fly.io

```bash
# Install flyctl: https://fly.io/docs/getting-started/installing-flyctl/
fly launch          # follow prompts, choose a region
fly secrets set ANTHROPIC_API_KEY=sk-ant-api03-...
fly deploy
```

### Option D — Your own server / VPS (Ubuntu)

```bash
# On the server:
git clone <your-repo> /opt/compliance
cd /opt/compliance

# Install pm2 to keep it running
npm install -g pm2

# Start with environment variable
ANTHROPIC_API_KEY=sk-ant-... pm2 start server.js --name compliance
pm2 save
pm2 startup

# Optional: put Nginx in front on port 80
# sudo apt install nginx
# Configure reverse proxy to localhost:3000
```

### Option E — Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

```bash
docker build -t compliance .
docker run -p 3000:3000 -e ANTHROPIC_API_KEY=sk-ant-... compliance
```

---

## Access control (optional)

If you want to restrict access to your team only, add a simple password check by inserting this block at the top of the `handleAnalyze` function in `server.js`:

```js
// Add to top of handleAnalyze():
const teamPassword = process.env.TEAM_PASSWORD;
if (teamPassword && req.headers['x-team-password'] !== teamPassword) {
  res.writeHead(401); res.end('Unauthorized'); return;
}
```

Then add `TEAM_PASSWORD=yourpassword` to your environment variables, and have the frontend send it in the request headers.

---

## Environment variables

| Variable            | Required | Description                          |
|---------------------|----------|--------------------------------------|
| `ANTHROPIC_API_KEY` | ✅ Yes   | Your Anthropic API key (sk-ant-...)  |
| `PORT`              | No       | Server port (default: 3000)          |
| `TEAM_PASSWORD`     | No       | Optional access password             |

---

## Cost estimate

Each PDF review uses approximately 2,000–4,000 tokens (input + output).  
At current Claude Sonnet pricing (~$3/M input, $15/M output tokens), each review costs roughly **$0.01–$0.05**.

A team of 5 running 20 reviews/day = ~$1–5/day.

---

## Project structure

```
shortcode-compliance-app/
├── server.js          ← Node.js server + Anthropic proxy
├── package.json       ← Project metadata
├── README.md          ← This file
└── public/
    └── index.html     ← The full web UI (served statically)
```

No npm dependencies — uses only Node.js built-in modules.

---

## Troubleshooting

**"ANTHROPIC_API_KEY environment variable is not set"**  
→ Make sure you export the variable in the same terminal session before running `node server.js`

**Team members can't reach the server**  
→ Check your firewall allows port 3000 (or whichever port you're using)  
→ Make sure you're sharing your local network IP, not `localhost`

**"Server error 500" on analysis**  
→ Check your API key is valid at https://console.anthropic.com  
→ Check the terminal running `server.js` for error details

**PDF reads as blank / no findings**  
→ The PDF may be a scanned image (no text layer). Try a digitally-created PDF first.
