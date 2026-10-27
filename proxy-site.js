// proxy-site.js - a simple web proxy. Needs Node 18+. No installs required.
// Run:  node proxy-site.js   then open http://localhost:3000
const http = require('http');

const PORT = process.env.PORT || 3000;

const HOME = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Search</title>
<style>
  body{font-family:system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;margin-top:20vh}
  input{width:min(90vw,480px);padding:12px;font-size:16px;border:1px solid #aaa;border-radius:8px}
  button{margin-top:12px;padding:10px 20px;font-size:16px;border-radius:8px;border:0;background:#333;color:#fff}
</style></head>
<body>
  <h2>Search or enter a website</h2>
  <form action="/go" method="get">
    <input name="q" placeholder="Search, or type a URL like example.com" autofocus>
    <br><button>Go</button>
  </form>
</body></html>`;

function resolveTarget(params) {
  const direct = params.get('url');
  if (direct) return direct;
  const q = (params.get('q') || '').trim();
  if (!q) return null;
  // Looks like a URL or domain? Visit it. Otherwise search for it.
  if (/^https?:\/\//i.test(q)) return q;
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(q)) return 'https://' + q;
  return 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q);
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');

  if (u.pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(HOME);
  }

  if (u.pathname === '/go') {
    const target = resolveTarget(u.searchParams);
    if (!target) {
      res.writeHead(302, { location: '/' });
      return res.end();
    }
    try {
      const upstream = await fetch(target, {
        redirect: 'follow',
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; SimpleProxy/1.0)' },
      });
      const type = upstream.headers.get('content-type') || 'application/octet-stream';
      const finalUrl = upstream.url;

      if (type.includes('text/html')) {
        let html = await upstream.text();
        // Send links, images, scripts and forms back through the proxy
        html = html.replace(/(href|src|action)=["']([^"']+)["']/gi, (match, attr, val) => {
          try {
            const abs = new URL(val, finalUrl).href;
            if (!/^https?:/.test(abs)) return match;
            return `${attr}="/go?url=${encodeURIComponent(abs)}"`;
          } catch {
            return match;
          }
        });
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        return res.end(html);
      }

      // Images, CSS, etc. are passed straight through
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.writeHead(upstream.status, { 'content-type': type });
      return res.end(buf);
    } catch (err) {
      res.writeHead(502, { 'content-type': 'text/plain' });
      return res.end('Could not load that page: ' + err.message);
    }
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => console.log('Proxy running on port ' + PORT));
