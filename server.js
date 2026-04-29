import express from "express";

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

app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "ArciGY HubSpot CRM API"
  });
});

app.post("/crm/update-client", requireAuth, async (req, res) => {
  try {
    const { contactId, dealId, contact = {}, deal = {} } = req.body;

    const results = {};

    if (contactId && Object.keys(contact).length > 0) {
      results.contact = await hubspot(`/crm/v3/objects/contacts/${contactId}`, {
        method: "PATCH",
        body: JSON.stringify({ properties: contact })
      });
    }

    if (dealId && Object.keys(deal).length > 0) {
      results.deal = await hubspot(`/crm/v3/objects/deals/${dealId}`, {
        method: "PATCH",
        body: JSON.stringify({ properties: deal })
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
