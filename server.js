/**
 * Canadian Shortcode Compliance Checker — Backend Server
 * -------------------------------------------------------
 * Run:  node server.js
 * Env:  ANTHROPIC_API_KEY=sk-ant-...   (required)
 *       PORT=3000                       (optional, default 3000)
 */

const http    = require('http');
const https   = require('https');
const fs      = require('fs');
const path    = require('path');
const url     = require('url');

const API_KEY = process.env.ANTHROPIC_API_KEY || '';
const PORT    = parseInt(process.env.PORT || '3000', 10);

if (!API_KEY) {
  console.error('\n❌  ANTHROPIC_API_KEY environment variable is not set.');
  console.error('    Set it before starting:');
  console.error('    export ANTHROPIC_API_KEY=sk-ant-...\n');
  process.exit(1);
}

// ── MIME types ──────────────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
};

// ── Compliance system prompt ─────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a Canadian telecommunications compliance expert specializing in CWTA (Canadian Wireless Telecommunications Association) shortcode guidelines and CASL (Canada's Anti-Spam Legislation, S.C. 2010, c. 23).

You will be given a PDF document — a shortcode program application, brief, or submission form. Your task is to read it thoroughly and produce a structured compliance review.

Key regulations to check against:
- CWTA Canadian Common Short Code Application Guidelines (latest version)
- CASL (S.C. 2010, c. 23) — express consent, sender identification, unsubscribe mechanisms, 10-business-day suppression rule
- CRTC Unsolicited Telecommunications Rules
- Mandatory opt-out keywords: STOP, ARRET (required for French/Quebec), END, QUIT, CANCEL, UNSUBSCRIBE
- Required disclosures: program name, STOP instruction, HELP keyword, "Msg & data rates may apply"
- Double opt-in best practice (required for marketing programs)
- Consent record-keeping requirements
- Shortcode format: 5 or 6 numeric digits
- Province-specific rules (Quebec requires French-language opt-out keyword ARRET)

Respond ONLY with a valid JSON object — no markdown, no fences, no preamble. Use this exact schema:

{
  "score": <integer 0-100>,
  "verdict": "<Compliant | Mostly Compliant | Needs Work | Non-Compliant>",
  "summary": "<3-4 sentence executive summary covering overall compliance posture, main risks, and readiness for carrier submission>",
  "carrierReadiness": "<Ready for submission | Minor revisions needed | Major revisions required | Not ready>",
  "caslExposure": "<Low | Medium | High | Critical>",
  "documentType": "<what type of document this appears to be>",
  "priorityActions": [
    "<specific action 1>",
    "<specific action 2>",
    "<specific action 3>"
  ],
  "findings": [
    {
      "status": "<pass|warn|fail>",
      "category": "<Shortcode Format | Consent & Opt-In | Opt-Out Handling | Message Content | Disclosures | CASL Compliance | Privacy & Data | Quebec/French | Carrier Provisioning | Program Details>",
      "title": "<concise finding title>",
      "detail": "<1-3 sentences: what you found and why it is or is not compliant, quoting relevant text from the document where helpful>",
      "fix": "<specific, actionable remediation — include exact wording or steps where relevant. Only for warn/fail.>",
      "regulation": "<cite the specific rule, e.g. CWTA s.4.2, CASL s.6(2)(a), CRTC Rule 3>"
    }
  ]
}

Be thorough. Produce at least 10-15 findings covering every major compliance area. Quote specific text from the document when citing an issue. For anything not present in the document, flag it as fail or warn as appropriate.`;

// ── Request body reader ──────────────────────────────────────────────────────
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end',  () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// ── Static file server ───────────────────────────────────────────────────────
function serveStatic(res, filePath) {
  const ext  = path.extname(filePath);
  const mime = MIME[ext] || 'application/octet-stream';
  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('Not found');
  }
}

// ── Proxy handler — streams Claude response back to client ───────────────────
async function handleAnalyze(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405); res.end('Method not allowed'); return;
  }

  let body;
  try {
    const raw  = await readBody(req);
    body = JSON.parse(raw.toString());
  } catch {
    res.writeHead(400); res.end('Bad request'); return;
  }

  const { pdfBase64, scope, context } = body;
  if (!pdfBase64) {
    res.writeHead(400); res.end('Missing pdfBase64'); return;
  }

  const userPrompt = `Please review the attached PDF document for Canadian shortcode compliance.

Review scope requested: ${(scope || []).join(', ') || 'full review'}.
${context ? '\nAdditional context from submitter: ' + context : ''}

Analyze every section of the document and return a full compliance report in the specified JSON format.`;

  const payload = JSON.stringify({
    model:      'claude-sonnet-4-6',
    max_tokens: 4000,
    stream:     true,
    system:     SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: [
        {
          type:   'document',
          source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 }
        },
        { type: 'text', text: userPrompt }
      ]
    }]
  });

  // Set SSE headers so browser receives streaming chunks
  res.writeHead(200, {
    'Content-Type':  'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection':    'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  const apiReq = https.request({
    hostname: 'api.anthropic.com',
    path:     '/v1/messages',
    method:   'POST',
    headers:  {
      'Content-Type':      'application/json',
      'x-api-key':         API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Length':    Buffer.byteLength(payload),
    }
  }, apiRes => {
    if (apiRes.statusCode !== 200) {
      const chunks = [];
      apiRes.on('data', c => chunks.push(c));
      apiRes.on('end', () => {
        const msg = Buffer.concat(chunks).toString();
        res.write(`data: {"error": ${JSON.stringify(msg)}}\n\n`);
        res.end();
      });
      return;
    }
    // Pipe SSE events straight through to the browser
    apiRes.on('data', chunk => res.write(chunk));
    apiRes.on('end',  ()    => res.end());
  });

  apiReq.on('error', e => {
    res.write(`data: {"error": ${JSON.stringify(e.message)}}\n\n`);
    res.end();
  });

  apiReq.write(payload);
  apiReq.end();
}

// ── HTTP server ──────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const parsed  = url.parse(req.url);
  const pathname = parsed.pathname;

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' });
    res.end(); return;
  }

  if (pathname === '/api/analyze') {
    await handleAnalyze(req, res);
    return;
  }

  // Health check
  if (pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', model: 'claude-sonnet-4-6' }));
    return;
  }

  // Static files
  const publicDir = path.join(__dirname, 'public');
  let filePath = pathname === '/' ? '/index.html' : pathname;
  serveStatic(res, path.join(publicDir, filePath));
});

server.listen(PORT, () => {
  console.log(`\n✅  Shortcode Compliance Checker running`);
  console.log(`   Local:   http://localhost:${PORT}`);
  console.log(`   Share:   http://<your-ip>:${PORT}  (on same network)\n`);
});
