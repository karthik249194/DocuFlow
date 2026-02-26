// FlowDoc AI — server.js
// Vercel Serverless Function: POST /api/analyze
// Receives a base64 PNG, sends to GROQ Llama-3-Vision, returns structured doc + code

export const config = { runtime: "edge" };

const SYSTEM_PROMPT = `You are a Senior Technical Architect specializing in flowchart analysis and technical documentation.

Analyze the provided flowchart image with surgical precision:

1. **Node Mapping** — Map every rectangular node to a "State" (action/screen/step). Map every diamond/rhombus to a "Conditional" (decision point). Map cylinders to "Data Stores". Map ovals/rounded rects to "Start/End" terminators.

2. **Gap Detection** — Identify missing edge cases:
   - Dead-end paths with no error handling
   - Missing "Cancel" or "Timeout" branches
   - Loops without exit conditions
   - Undefined states between conditionals
   If found, list them as "⚠ Gap: [description]"

3. **Constructive Suggestions** — If the flow is incomplete or ambiguous, DO NOT fail. Instead provide a "Potential Logic" block explaining what the missing piece likely is, with a suggested implementation.

4. **Output Format** — Respond ONLY with valid JSON matching this schema exactly:
{
  "title": "string — inferred flow title",
  "description": "string — 2-3 sentence executive summary",
  "states": [{ "id": "S1", "label": "string", "type": "start|state|conditional|data|end", "description": "string" }],
  "transitions": [{ "from": "S1", "to": "S2", "condition": "string or null" }],
  "steps": ["string — plain English step 1", "string — step 2"],
  "gaps": [{ "node": "string", "issue": "string", "suggestion": "string" }],
  "suggestions": [{ "title": "string", "description": "string", "type": "timeout|error|cancel|retry|other" }],
  "codeLogic": {
    "react": "string — TypeScript React logic snippet",
    "vue": "string — Vue 3 Composition API snippet",
    "vanilla": "string — Plain JS/TS snippet"
  },
  "confidence": "high|medium|low",
  "noiseDetected": "string or null — describe any ignored visual noise"
}

Ignore visual noise: grid lines, cursor artifacts, annotation overlays, watermarks.
If confidence is low, still provide best-effort output with honest suggestions.`;

export default async function handler(req) {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }

  const { image, mimeType = "image/png" } = body;
  if (!image) {
    return new Response(JSON.stringify({ error: "Missing `image` field (base64 string)" }), { status: 400 });
  }

  const groqApiKey = process.env.GROQ_API_KEY;
  if (!groqApiKey) {
    return new Response(JSON.stringify({ error: "GROQ_API_KEY not configured on server" }), { status: 500 });
  }

  // Build GROQ request
  const groqPayload = {
    model: "meta-llama/llama-4-scout-17b-16e-instruct",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: `data:${mimeType};base64,${image}` },
          },
          {
            type: "text",
            text: "Analyze this flowchart. Return only valid JSON per the schema.",
          },
        ],
      },
    ],
    max_tokens: 4096,
    temperature: 0.2, // Low temp for deterministic structured output
    response_format: { type: "json_object" },
  };

  try {
    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${groqApiKey}`,
      },
      body: JSON.stringify(groqPayload),
    });

    if (!groqRes.ok) {
      const errText = await groqRes.text();
      return new Response(
        JSON.stringify({ error: "GROQ API error", details: errText }),
        { status: groqRes.status }
      );
    }

    const groqData = await groqRes.json();
    const raw = groqData.choices?.[0]?.message?.content;

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Return raw with warning if JSON parse fails
      return new Response(
        JSON.stringify({ warning: "Could not parse structured JSON — raw AI output attached", raw }),
        { status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });

  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(err) }),
      { status: 500, headers: { "Access-Control-Allow-Origin": "*" } }
    );
  }
}
