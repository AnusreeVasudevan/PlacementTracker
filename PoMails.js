require("dotenv").config();
const axios = require("axios");

// -- PARAMETERS YOU NEED TO SET --
const PICAOS_API_KEY =
  process.env.PICAOS_API_KEY ||
  "sk_test_ON1Xslhr7OpMr848mTly5-QL0FyRioWB3CxHRvJx0Gk";
const PICAOS_CONNECTION_KEY =
  process.env.PICAOS_CONNECTION_KEY ||
  "test::outlook-mail::default::da5a297e3f704501bbaa9e772155973a";
const PICA_ACTION_ID =
  process.env.PICA_ACTION_ID ||
  "conn_mod_def::GCoq5BXDv9U::Lo_3KMz1Qkede3-2Gjbdhg";
const PICA_ACTION_ENV = process.env.PICA_ACTION_ENV || "test";

// -- API INFO --
const baseUrl =
  "https://api.picaos.com/v1/passthrough/me/mailFolders/Inbox/messages";

const headers = {
  "Content-Type": "application/json",
  "x-pica-secret": PICAOS_API_KEY,
  "x-pica-connection-key": PICAOS_CONNECTION_KEY,
  "x-pica-action-id": PICA_ACTION_ID,
  "X-Pica-Action-Environment": PICA_ACTION_ENV,
};

function toIso(value) {
  return new Date(value).toISOString();
}

function buildDateRange(daysBack) {
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - daysBack);
  return { start: toIso(start), end: toIso(end) };
}

const { start: rangeStart, end: rangeEnd } = buildDateRange(35);

const params = {
  $filter:
    "from/emailAddress/address eq 'rgahlot@silverspaceinc.com' " +
    "and contains(subject,'PO') " +
    `and receivedDateTime ge ${rangeStart} ` +
    `and receivedDateTime lt ${rangeEnd}`,
  $top: 100,
};

function normalizeText(text) {
  return String(text)
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractPoDetails(inputText) {
  const text = normalizeText(inputText);

  const find = (pattern, src = text) => {
    const match = src.match(pattern);
    return match ? match[1].trim() : null;
  };

  // isolate Interview Support section only
  let interviewSection = null;
  const interviewMatch = text.match(
    /Interview Support\s*Support by\s*(.+?)(?=\s+Marketing Application|\s+Thanks|$)/i
  );
  if (interviewMatch) {
    interviewSection = interviewMatch[1];
  }

  return {
    candidate_name: find(
      /Name of Candidate:\s*([A-Za-z\s]+?)\s+(?=SST|Location|PO)/i
    ),
    phone_number: find(/Personal Phone Number\s*([\+\d\(\)\-\.\s]+)/i),
    email: find(
      /Email ID\s*([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/i
    ),
    location: find(/Location\s*([A-Z]{2,3})/i),
    position_applied: find(
      /Position that Applied:\s*(.+?)(?=\s+Job Location)/i
    ),
    job_location: find(
      /Job Location:\s*(.+?)(?=\s+Implementation\/End Client)/i
    ),
    end_client: find(
      /Implementation\/End Client\s*(.+?)(?=\s+Vendor Details|\s+Rate:)/i
    ),
    rate: find(/Rate:\s*\$?([0-9,\.kK\/\sA-Za-z]+)/i),
    interview_support_by: find(
      /^([A-Za-z\s]+?)(?=\s+Team Lead)/i,
      interviewSection || ""
    ),
    team_lead: find(
      /Team Lead\s*([A-Za-z\s]+?)(?=\s+Manager)/i,
      interviewSection || ""
    ),
    manager: find(
      /Manager\s*([A-Za-z\s]+?)(?=\s+Marketing|$)/i,
      interviewSection || ""
    ),
  };
}

function htmlToText(htmlContent) {
  if (!htmlContent) return "";
  const stripped = String(htmlContent)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/?[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ");
  const text = normalizeText(stripped);
  return extractPoDetails(text);
}

async function fetchPoMails() {
  let nextUrl = baseUrl;
  let nextParams = { ...params };
  const allEmails = [];

  while (nextUrl) {
    const response = await axios.get(nextUrl, {
      headers,
      params: nextParams,
    });

    const data = response.data || {};
    allEmails.push(...(data.value || []));

    nextUrl = data["@odata.nextLink"] || null;
    nextParams = null;
  }

  allEmails.sort((a, b) => {
    const aDate = new Date(a.receivedDateTime || 0).getTime();
    const bDate = new Date(b.receivedDateTime || 0).getTime();
    return aDate - bDate;
  });

  return allEmails.map((email) => ({
    id: email.id || "",
    subject: email.subject || "",
    from: email.from?.emailAddress || null,
    receivedDateTime: email.receivedDateTime || "",
    bodyPreview: email.bodyPreview || "",
    webLink: email.webLink || "",
    extracted: htmlToText(email.body?.content || ""),
  }));
}

async function main() {
  const allEmails = await fetchPoMails();
  for (const email of allEmails) {
    console.log(`Subject: ${email.subject || ""}`);
    const from = email.from;
    console.log(
      `From: ${(from?.name || "").trim()} <${from?.address || ""}>`
    );
    console.log(`Received: ${email.receivedDateTime || ""}`);
    console.log(`Preview: ${JSON.stringify(email.extracted, null, 2)}`);
    console.log("---");
  }
}

module.exports = { fetchPoMails };

if (require.main === module) {
  main().catch((err) => {
    const message =
      err?.response?.data ||
      err?.response?.statusText ||
      err?.message ||
      String(err);
    console.error("Request failed:", message);
    process.exit(1);
  });
}
