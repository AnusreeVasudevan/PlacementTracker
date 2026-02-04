const { fetchPoMails } = require("../PoMails");

module.exports = async function handler(_req, res) {
  try {
    const data = await fetchPoMails();
    res.status(200).json({
      count: data.length,
      generatedAt: new Date().toISOString(),
      items: data,
    });
  } catch (err) {
    const message =
      err?.response?.data ||
      err?.response?.statusText ||
      err?.message ||
      String(err);
    res.status(500).json({ error: "Failed to fetch emails", detail: message });
  }
};
