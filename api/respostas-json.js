const { readResponses } = require("./_shared");

module.exports = async function handler(request, response) {
  try {
    const responses = await readResponses();
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.status(200).send(`${JSON.stringify(responses, null, 2)}\n`);
  } catch (error) {
    response.status(500).json({ error: error.message });
  }
};
