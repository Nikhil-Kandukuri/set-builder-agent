const path = require("path");
const express = require("express");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const OPENAI_API_URL =
  process.env.OPENAI_API_URL || "https://api.openai.com/v1/chat/completions";

const fetch =
  global.fetch ||
  ((...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args)));

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname)));

app.post("/api/build-set", async (req, res) => {
  const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
  if (!prompt) {
    return res.status(400).json({ error: "A prompt describing the set is required." });
  }

  try {
    const items = await getSetItems(prompt);
    res.json({ items });
  } catch (error) {
    console.error("Failed to generate set items", error);
    const message =
      error?.response?.status === 401
        ? "The language model rejected the request. Check your API key and permissions."
        : error?.message || "Failed to generate set items.";
    res.status(500).json({ error: message });
  }
});

app.use((_, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Set Builder server listening on http://localhost:${PORT}`);
});

async function getSetItems(prompt) {
  if (OPENAI_API_KEY) {
    return await fetchFromOpenAI(prompt);
  }

  return buildMockItems(prompt);
}

async function fetchFromOpenAI(prompt) {
  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You expand short descriptions of kits or collections into exhaustive lists. Always respond with JSON in the shape {\"items\": [ ... ]}. Include only plain strings.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    const error = new Error(
      `Language model request failed with status ${response.status}: ${text}`
    );
    error.response = response;
    throw error;
  }

  const payload = await response.json();
  const rawContent = payload?.choices?.[0]?.message?.content;
  if (!rawContent) {
    throw new Error("Language model returned an empty response.");
  }

  let parsed;
  try {
    parsed = JSON.parse(rawContent);
  } catch (parseError) {
    throw new Error("Language model response was not valid JSON.");
  }

  const items = Array.isArray(parsed.items) ? parsed.items : [];
  if (items.length === 0) {
    throw new Error("Language model response did not include any items.");
  }

  return normalizeItems(items);
}

function buildMockItems(prompt) {
  const normalizedPrompt = prompt.toLowerCase();
  for (const [keyword, items] of Object.entries(PRESET_SETS)) {
    if (normalizedPrompt.includes(keyword)) {
      return normalizeItems(items);
    }
  }

  const derived = prompt
    .split(/[\n,]/)
    .map((value) => value.trim())
    .filter(Boolean);

  if (derived.length > 0) {
    return normalizeItems(derived);
  }

  return normalizeItems([
    "example item",
    "another example item",
    "refine your prompt for better results",
  ]);
}

function normalizeItems(items) {
  return Array.from(
    new Set(
      items
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
    )
  );
}

const PRESET_SETS = {
  ppe: [
    "N95 respirator",
    "Face shield",
    "Disposable gloves",
    "Protective gown",
    "Medical goggles",
    "Hand sanitizer",
  ],
  "first aid": [
    "Adhesive bandages",
    "Sterile gauze pads",
    "Medical tape",
    "Antiseptic wipes",
    "Elastic bandage",
    "Tweezers",
  ],
  camping: [
    "Tent",
    "Sleeping bag",
    "Camping stove",
    "Water purifier",
    "Headlamp",
    "First aid kit",
  ],
};
