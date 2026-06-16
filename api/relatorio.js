const { readResponses, renderReport } = require("./_shared");

module.exports = async function handler(request, response) {
  try {
    const responses = await readResponses();
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.status(200).send(renderReport(responses));
  } catch (error) {
    response.status(500).send(`Erro ao carregar relatorio: ${error.message}`);
  }
};
