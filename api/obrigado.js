const { renderThanks } = require("./_shared");

module.exports = function handler(request, response) {
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  response.status(200).send(renderThanks());
};
