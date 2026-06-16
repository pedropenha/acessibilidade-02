const http = require("node:http");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const PORT = Number(process.env.PORT || 3002);
const PROJECT_DIR = __dirname;
const DATA_FILE = path.join(PROJECT_DIR, "respostas.json");
const PROJECT_NAME = "Projeto inacessivel";

const QUESTIONS = {
  nome: "Nome completo",
  email: "E-mail",
  tipo: "Tipo de atendimento",
  mensagem: "Mensagem",
};

const TYPE_LABELS = {
  matricula: "Matricula",
  documentos: "Documentos",
  suporte: "Suporte de acesso",
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function ensureDataFile() {
  if (!fsSync.existsSync(DATA_FILE)) {
    await fs.writeFile(DATA_FILE, "[]\n", "utf8");
  }
}

async function readResponses() {
  await ensureDataFile();
  const raw = await fs.readFile(DATA_FILE, "utf8");
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeResponses(responses) {
  await fs.writeFile(DATA_FILE, `${JSON.stringify(responses, null, 2)}\n`, "utf8");
}

function send(response, status, contentType, body, headers = {}) {
  response.writeHead(status, {
    "Content-Type": contentType,
    ...headers,
  });
  response.end(body);
}

function redirect(response, location) {
  response.writeHead(303, { Location: location });
  response.end();
}

function collectBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        request.destroy();
        reject(new Error("Payload muito grande"));
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function toRecord(params, request) {
  const respostas = {
    nome: params.get("nome") || "",
    email: params.get("email") || "",
    tipo: TYPE_LABELS[params.get("tipo")] || params.get("tipo") || "",
    mensagem: params.get("mensagem") || "",
  };

  return {
    id: crypto.randomUUID(),
    site: PROJECT_NAME,
    dataHora: new Date().toISOString(),
    perguntas: QUESTIONS,
    respostas,
    origem: {
      ip: request.socket.remoteAddress || "",
      userAgent: request.headers["user-agent"] || "",
    },
  };
}

async function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  let filePath;

  if (url.pathname === "/" || url.pathname === "/index.html") {
    filePath = path.join(PROJECT_DIR, "index.html");
  } else if (url.pathname === "/styles.css") {
    filePath = path.join(PROJECT_DIR, "styles.css");
  } else if (url.pathname.startsWith("/assets/")) {
    filePath = path.join(PROJECT_DIR, url.pathname.slice(1));
  } else if (url.pathname === "/favicon.ico") {
    response.writeHead(204);
    response.end();
    return true;
  } else {
    return false;
  }

  const ext = path.extname(filePath).toLowerCase();
  const types = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".png": "image/png",
  };

  try {
    const content = await fs.readFile(filePath);
    send(response, 200, types[ext] || "application/octet-stream", content);
  } catch {
    send(response, 404, "text/plain; charset=utf-8", "Arquivo nao encontrado");
  }

  return true;
}

function renderThanks() {
  return `<html><head><meta charset="utf-8"><title>ok</title><link rel="stylesheet" href="/styles.css"></head><body>
    <div class="topbar"><div class="brand"><span class="brand-mark">A</span><span>Portal Aula Acessivel</span></div></div>
    <div class="site-shell"><div class="hero"><div class="hero-copy">
      <div class="eyebrow">Confirmacao</div>
      <div class="title">Resposta enviada</div>
      <p>Sua resposta foi gravada no JSON deste projeto.</p>
      <span class="fake-link" onclick="location.href='/'">Voltar</span>
    </div></div></div>
  </body></html>`;
}

function renderReport(responses) {
  const rows = responses
    .map((item, index) => {
      const respostas = item.respostas || {};
      return `<div class="fake-row">
        <div>${index + 1}</div>
        <div>${escapeHtml(new Date(item.dataHora).toLocaleString("pt-BR"))}</div>
        <div>${escapeHtml(QUESTIONS.nome)}: ${escapeHtml(respostas.nome)}</div>
        <div>${escapeHtml(QUESTIONS.email)}: ${escapeHtml(respostas.email)}</div>
        <div>${escapeHtml(QUESTIONS.tipo)}: ${escapeHtml(respostas.tipo)}</div>
        <div>${escapeHtml(QUESTIONS.mensagem)}: ${escapeHtml(respostas.mensagem)}</div>
      </div>`;
    })
    .join("");

  return `<html><head><meta charset="utf-8"><title>relatorio</title><link rel="stylesheet" href="/styles.css"></head><body>
    <div class="topbar">
      <div class="brand"><span class="brand-mark">A</span><span>Portal Aula Acessivel</span></div>
      <div class="menu"><span class="fake-link" onclick="location.href='/'">Formulario</span><span class="fake-link" onclick="location.href='/respostas.json'">JSON</span></div>
    </div>
    <div class="site-shell">
      <div class="section">
        <div class="section-heading">
          <div class="eyebrow">Relatorio</div>
          <div class="title">Respostas dos estudantes</div>
          <p>Cada bloco mostra a pergunta e a resposta enviada.</p>
        </div>
        <div class="fake-table">
          <div class="fake-caption">Total de respostas registradas: ${responses.length}</div>
          <div class="fake-row fake-head">
            <div>#</div><div>Data</div><div>Nome</div><div>E-mail</div><div>Tipo</div><div>Mensagem</div>
          </div>
          ${rows || "<div class=\"fake-row\"><div>Nenhuma resposta registrada.</div><div></div><div></div><div></div><div></div><div></div></div>"}
        </div>
      </div>
    </div>
  </body></html>`;
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (request.method === "POST" && url.pathname === "/respostas") {
      const body = await collectBody(request);
      const params = new URLSearchParams(body);
      const responses = await readResponses();
      responses.push(toRecord(params, request));
      await writeResponses(responses);
      redirect(response, "/obrigado");
      return;
    }

    if (request.method === "GET" && url.pathname === "/obrigado") {
      send(response, 200, "text/html; charset=utf-8", renderThanks());
      return;
    }

    if (request.method === "GET" && url.pathname === "/relatorio") {
      const responses = await readResponses();
      send(response, 200, "text/html; charset=utf-8", renderReport(responses));
      return;
    }

    if (request.method === "GET" && url.pathname === "/respostas.json") {
      const responses = await readResponses();
      send(response, 200, "application/json; charset=utf-8", `${JSON.stringify(responses, null, 2)}\n`);
      return;
    }

    if (request.method === "GET" && await serveStatic(request, response)) {
      return;
    }

    send(response, 404, "text/plain; charset=utf-8", "Rota nao encontrada");
  } catch (error) {
    send(response, 500, "text/plain; charset=utf-8", `Erro interno: ${error.message}`);
  }
});

server.listen(PORT, () => {
  console.log(`Projeto inacessivel: http://localhost:${PORT}`);
  console.log(`Relatorio: http://localhost:${PORT}/relatorio`);
});
