import express from "express";
import * as cheerio from "cheerio";

const app = express();
app.use(express.json());

const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;
const API_KEY = process.env.API_KEY;

function requireAuth(req, res, next) {
  const key = req.headers["x-api-key"];

  if (!API_KEY || key !== API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  next();
}

async function hubspot(path, options = {}) {
  const response = await fetch(`https://api.hubapi.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${HUBSPOT_TOKEN}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const text = await response.text();

  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    throw new Error(JSON.stringify({ status: response.status, data }));
  }

  return data;
}

function cleanString(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "ArciGY HubSpot CRM API"
  });
});

app.post("/website/extract", requireAuth, async (req, res) => {
  try {
    const { url } = req.body;

    if (!url || typeof url !== "string") {
      return res.status(400).json({
        ok: false,
        error: "Missing url"
      });
    }

    const parsedUrl = new URL(url);

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return res.status(400).json({
        ok: false,
        error: "Only http/https URLs are allowed"
      });
    }

    const response = await fetch(parsedUrl.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 ArciGY CRM Enrichment Bot"
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({
        ok: false,
        error: `Website returned status ${response.status}`
      });
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    $("script, style, noscript, svg, iframe").remove();

    const title = cleanString($("title").first().text());

    const description = cleanString(
      $('meta[name="description"]').attr("content") ||
        $('meta[property="og:description"]').attr("content") ||
        ""
    );

    const bodyText = cleanString($("body").text());

    const emails = [...html.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)]
      .map((match) => match[0])
      .filter((value, index, array) => array.indexOf(value) === index)
      .slice(0, 15);

    const phones = [...bodyText.matchAll(/(\+?\d[\d\s().-]{7,}\d)/g)]
      .map((match) => cleanString(match[0]))
      .filter((value, index, array) => array.indexOf(value) === index)
      .slice(0, 15);

    const headings = $("h1, h2, h3")
      .map((_, el) => cleanString($(el).text()))
      .get()
      .filter(Boolean)
      .slice(0, 30);

    const links = $("a[href]")
      .map((_, el) => {
        const href = $(el).attr("href");
        const text = cleanString($(el).text());

        try {
          return {
            text,
            href: new URL(href, parsedUrl.origin).toString()
          };
        } catch {
          return null;
        }
      })
      .get()
      .filter(Boolean)
      .slice(0, 50);

    res.json({
      ok: true,
      url: parsedUrl.toString(),
      title,
      description,
      emails,
      phones,
      headings,
      links,
      text: bodyText.slice(0, 12000)
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

app.post("/crm/update-client", requireAuth, async (req, res) => {
  try {
    const { contactId, dealId, contact = {}, deal = {} } = req.body;

    const results = {};

    if (contactId && Object.keys(contact).length > 0) {
      results.contact = await hubspot(`/crm/v3/objects/contacts/${contactId}`, {
        method: "PATCH",
        body: JSON.stringify({
          properties: contact
        })
      });
    }

    if (dealId && Object.keys(deal).length > 0) {
      results.deal = await hubspot(`/crm/v3/objects/deals/${dealId}`, {
        method: "PATCH",
        body: JSON.stringify({
          properties: deal
        })
      });
    }

    res.json({
      ok: true,
      results
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`CRM API running on port ${port}`);
});
