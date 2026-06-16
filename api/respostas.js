const { appendResponse, parseForm, toRecord } = require("./_shared");

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    response.status(405).send("Metodo nao permitido");
    return;
  }

  try {
    const params = await parseForm(request);
    await appendResponse(toRecord(params, request));
    response.writeHead(303, { Location: "/obrigado" });
    response.end();
  } catch (error) {
    response.status(500).send(`Erro ao salvar resposta: ${error.message}`);
  }
};
