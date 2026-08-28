#!/usr/bin/env node

/**
 * Scraper HTTP Server
 *
 * Servidor que executa o scraper de leads via HTTP.
 * Pode ser chamado pelo n8n ou por cron.
 *
 * Porta: 3001 (configurável via PORT)
 */

const http = require("http");
const { execFile } = require("child_process");
const path = require("path");

const PORT = process.env.PORT || 3001;

const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method === "POST" && req.url === "/run") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      let source = "all";
      try {
        const data = JSON.parse(body);
        source = data.source || "all";
      } catch {}

      console.log(`[${new Date().toISOString()}] Executando scraper para: ${source}`);

      const scriptPath = path.join(__dirname, "scrape-leads.js");
      execFile("node", [scriptPath, source], { timeout: 300000 }, (error, stdout, stderr) => {
        if (error) {
          console.error("Erro no scraper:", error.message);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: error.message, stdout, stderr }));
          return;
        }

        console.log("Scraper concluído:", stdout);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, message: "Scraper executado", output: stdout }));
      });
    });
  } else if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", timestamp: new Date().toISOString() }));
  } else {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  }
});

function runScraper(source = "all") {
  const scriptPath = path.join(__dirname, "scrape-leads.js");
  console.log(`[${new Date().toISOString()}] Agendado: executando scraper (${source})...`);
  execFile("node", [scriptPath, source], { timeout: 300000 }, (error, stdout, stderr) => {
    if (error) console.error(`[CRON] Erro: ${error.message}\n${stderr}`);
    else console.log(`[CRON] OK:\n${stdout}`);
  });
}

server.listen(PORT, () => {
  console.log(`Scraper server rodando na porta ${PORT}`);
  // Roda sozinho a cada 2h + 1x no boot (30s após subir) — não precisa do n8n
  const INTERVAL_MS = 2 * 60 * 60 * 1000;
  setTimeout(() => runScraper("all"), 30 * 1000);
  setInterval(() => runScraper("all"), INTERVAL_MS);
  console.log(`[CRON] Agendado: a cada 2h (primeiro em 30s)`);
});
