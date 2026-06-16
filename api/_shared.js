const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const PROJECT_NAME = "Projeto inacessivel";
const RESPONSES_KEY = process.env.RESPONSES_KEY || "respostas:projeto-inacessivel";
const DATA_FILE = path.join(__dirname, "..", "respostas.json");

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

function redisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

async function redisCommand(command) {
  const config = redisConfig();
  if (!config) {
    throw new Error("Configure UPSTASH_REDIS_REST_URL e UPSTASH_REDIS_REST_TOKEN na Vercel.");
  }

  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });

  if (!response.ok) {
    throw new Error(`Redis respondeu ${response.status}`);
  }

  const payload = await response.json();
  if (payload.error) {
    throw new Error(payload.error);
  }
  return payload.result;
}

async function ensureLocalDataFile() {
  if (!fsSync.existsSync(DATA_FILE)) {
    await fs.writeFile(DATA_FILE, "[]\n", "utf8");
  }
}

async function readLocalResponses() {
  await ensureLocalDataFile();
  const raw = await fs.readFile(DATA_FILE, "utf8");
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeLocalResponses(responses) {
  await fs.writeFile(DATA_FILE, `${JSON.stringify(responses, null, 2)}\n`, "utf8");
}

async function readResponses() {
  if (redisConfig()) {
    const values = await redisCommand(["LRANGE", RESPONSES_KEY, 0, -1]);
    return (values || [])
      .map((value) => {
        try {
          return typeof value === "string" ? JSON.parse(value) : value;
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }

  if (process.env.VERCEL) {
    throw new Error("Armazenamento persistente nao configurado. Adicione Upstash Redis ao projeto.");
  }

  return readLocalResponses();
}

async function appendResponse(record) {
  if (redisConfig()) {
    await redisCommand(["RPUSH", RESPONSES_KEY, JSON.stringify(record)]);
    return;
  }

  if (process.env.VERCEL) {
    throw new Error("Armazenamento persistente nao configurado. Adicione Upstash Redis ao projeto.");
  }

  const responses = await readLocalResponses();
  responses.push(record);
  await writeLocalResponses(responses);
}

function getIp(request) {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return request.socket?.remoteAddress || "";
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
      ip: getIp(request),
      userAgent: request.headers["user-agent"] || "",
    },
  };
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

async function parseForm(request) {
  if (typeof request.body === "string") {
    return new URLSearchParams(request.body);
  }
  if (Buffer.isBuffer(request.body)) {
    return new URLSearchParams(request.body.toString("utf8"));
  }
  if (request.body && typeof request.body === "object") {
    return new URLSearchParams(request.body);
  }
  return new URLSearchParams(await collectBody(request));
}

function renderThanks() {
  return `<html><head><meta charset="utf-8"><title>ok</title><link rel="stylesheet" href="/styles.css"></head><body>
    <div class="topbar"><div class="brand"><span class="brand-mark">A</span><span>Portal Aula Acessivel</span></div></div>
    <div class="site-shell"><div class="hero"><div class="hero-copy">
      <div class="eyebrow">Confirmacao</div>
      <div class="title">Resposta enviada</div>
      <p>Sua resposta foi gravada no banco persistente deste projeto.</p>
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

module.exports = {
  appendResponse,
  readResponses,
  renderReport,
  renderThanks,
  toRecord,
  parseForm,
};
