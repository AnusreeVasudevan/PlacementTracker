require("dotenv").config();
const path = require("path");
const express = require("express");
const { fetchPoMails } = require("./PoMails");

const app = express();
const PORT = Number(process.env.PORT || "3000");

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/po-mails", async (_req, res) => {
  try {
    const data = await fetchPoMails();
    res.json({
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
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`PO viewer running on http://localhost:${PORT}`);
});
