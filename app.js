const API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-opus-4-8";
const STORAGE_KEY = "untangle_api_key";

const SYSTEM_PROMPT = `You are Untangle, an assistant that helps everyday people understand confusing bills, letters, and official notices — medical bills, insurance EOBs, collection notices, subscription or billing disputes, government benefit letters, and similar paperwork.

Given the document the user provides, do all of the following:
1. Identify what kind of document this is.
2. Explain in plain, friendly language what it says, what it is asking the recipient to do, and any deadline or amount owed.
3. Carefully look for red flags: billing errors, duplicate or padded charges, claims denied without a clear reason, unreasonably short deadlines, requests for sensitive information, scam indicators, fees that may be disputable, or inconsistencies within the document itself. If you genuinely find none, return an empty list rather than inventing one.
4. Draft a complete, ready-to-send response (letter or email) written in first person on behalf of the recipient — a dispute, appeal, request for clarification, or cancellation, whichever fits the situation. Keep it polite, factual, and specific. Use placeholders like [ACCOUNT NUMBER] or [YOUR NAME] for any information you don't have rather than inventing facts.
5. Suggest concrete next steps beyond sending the letter (a number to call, a document to gather, a deadline to track).

Never invent facts that aren't in the document or notes provided. If something is unclear, say so rather than guessing. Always finish by calling the record_analysis tool exactly once with your complete findings.`;

const ANALYSIS_TOOL = {
  name: "record_analysis",
  description: "Record the structured analysis of the bill, letter, or notice the user provided.",
  input_schema: {
    type: "object",
    properties: {
      document_type: {
        type: "string",
        description: "Short label for the kind of document, e.g. 'Medical bill', 'Insurance EOB', 'Collections notice', 'Subscription renewal notice', 'Government benefits letter'.",
      },
      summary: {
        type: "string",
        description: "2-4 sentence plain-language explanation of what the document is, what it wants from the recipient, and any deadline or amount owed.",
      },
      red_flags: {
        type: "array",
        items: {
          type: "object",
          properties: {
            issue: { type: "string" },
            why_it_matters: { type: "string" },
          },
          required: ["issue", "why_it_matters"],
        },
      },
      draft_response: {
        type: "string",
        description: "A complete, ready-to-send draft letter or email responding to, disputing, or appealing the document, written in first person on behalf of the recipient.",
      },
      suggested_next_steps: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: ["document_type", "summary", "red_flags", "draft_response", "suggested_next_steps"],
  },
};

const el = (id) => document.getElementById(id);

const docTextEl = el("docText");
const docImageEl = el("docImage");
const imagePreviewEl = el("imagePreview");
const dropzoneTextEl = el("dropzoneText");
const notesEl = el("notes");
const analyzeBtn = el("analyzeBtn");
const statusText = el("statusText");
const resultsEl = el("results");

let selectedImage = null; // { base64, mediaType }

// Tabs
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => {
      t.classList.remove("active");
      t.setAttribute("aria-selected", "false");
    });
    tab.classList.add("active");
    tab.setAttribute("aria-selected", "true");
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.add("hidden"));
    el(`panel-${tab.dataset.tab}`).classList.remove("hidden");
  });
});

// Image upload
docImageEl.addEventListener("change", () => {
  const file = docImageEl.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = reader.result;
    const base64 = dataUrl.split(",")[1];
    selectedImage = { base64, mediaType: file.type };
    imagePreviewEl.src = dataUrl;
    imagePreviewEl.classList.remove("hidden");
    dropzoneTextEl.classList.add("hidden");
  };
  reader.readAsDataURL(file);
});

// Settings modal
const settingsBackdrop = el("settingsBackdrop");
const apiKeyInput = el("apiKeyInput");

function openSettings() {
  apiKeyInput.value = localStorage.getItem(STORAGE_KEY) || "";
  settingsBackdrop.classList.remove("hidden");
}
function closeSettings() {
  settingsBackdrop.classList.add("hidden");
}

el("settingsBtn").addEventListener("click", openSettings);
el("closeModalBtn").addEventListener("click", closeSettings);
el("saveKeyBtn").addEventListener("click", () => {
  const key = apiKeyInput.value.trim();
  if (key) localStorage.setItem(STORAGE_KEY, key);
  else localStorage.removeItem(STORAGE_KEY);
  closeSettings();
});
settingsBackdrop.addEventListener("click", (e) => {
  if (e.target === settingsBackdrop) closeSettings();
});

function getApiKey() {
  return localStorage.getItem(STORAGE_KEY) || "";
}

function setStatus(msg, isError) {
  statusText.textContent = msg;
  statusText.style.color = isError ? "var(--danger)" : "var(--text-dim)";
}

function friendlyErrorMessage(status, body) {
  const apiMsg = body && body.error && body.error.message;
  switch (status) {
    case 401:
      return "Your API key was rejected. Check it in Settings (⚙) — it should start with sk-ant-.";
    case 403:
      return "That API key doesn't have access to this model.";
    case 404:
      return "The API couldn't be reached at the expected address.";
    case 413:
      return "That document is too large to send. Try a shorter excerpt or a smaller image.";
    case 429:
      return "Rate limited — wait a moment and try again.";
    case 500:
    case 529:
      return "Anthropic's API is temporarily unavailable. Try again shortly.";
    default:
      return apiMsg || `Request failed (HTTP ${status}).`;
  }
}

async function analyze() {
  const apiKey = getApiKey();
  if (!apiKey) {
    setStatus("Add your Anthropic API key first.", true);
    openSettings();
    return;
  }

  const text = docTextEl.value.trim();
  if (!text && !selectedImage) {
    setStatus("Paste some text or upload a photo first.", true);
    return;
  }

  const content = [];
  if (selectedImage) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: selectedImage.mediaType, data: selectedImage.base64 },
    });
  }
  let instruction = "Analyze this document.";
  if (text) instruction += `\n\nDocument text:\n${text}`;
  const notes = notesEl.value.trim();
  if (notes) instruction += `\n\nAdditional context from the recipient: ${notes}`;
  content.push({ type: "text", text: instruction });

  analyzeBtn.disabled = true;
  resultsEl.classList.add("hidden");
  setStatus("Reading carefully…");

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 16000,
        system: SYSTEM_PROMPT,
        thinking: { type: "adaptive" },
        output_config: { effort: "high" },
        tools: [ANALYSIS_TOOL],
        messages: [{ role: "user", content }],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      setStatus(friendlyErrorMessage(response.status, data), true);
      return;
    }

    if (data.stop_reason === "refusal") {
      setStatus("Claude declined to analyze this document. Try rephrasing or removing sensitive details.", true);
      return;
    }

    const toolUse = (data.content || []).find(
      (block) => block.type === "tool_use" && block.name === "record_analysis"
    );

    if (!toolUse) {
      setStatus("Didn't get a structured result back — try again.", true);
      return;
    }

    renderResults(toolUse.input);
    setStatus("Done.");
  } catch (err) {
    setStatus(`Network error: ${err.message}`, true);
  } finally {
    analyzeBtn.disabled = false;
  }
}

function renderResults(result) {
  el("docType").textContent = result.document_type || "";
  el("summary").textContent = result.summary || "";

  const redFlagsEl = el("redFlags");
  redFlagsEl.innerHTML = "";
  if (!result.red_flags || result.red_flags.length === 0) {
    const li = document.createElement("li");
    li.className = "none";
    li.textContent = "No red flags found — this looks routine.";
    redFlagsEl.appendChild(li);
  } else {
    result.red_flags.forEach((flag) => {
      const li = document.createElement("li");
      const strong = document.createElement("strong");
      strong.textContent = flag.issue;
      li.appendChild(strong);
      li.appendChild(document.createElement("br"));
      li.appendChild(document.createTextNode(flag.why_it_matters));
      redFlagsEl.appendChild(li);
    });
  }

  const stepsEl = el("nextSteps");
  stepsEl.innerHTML = "";
  (result.suggested_next_steps || []).forEach((step) => {
    const li = document.createElement("li");
    li.textContent = step;
    stepsEl.appendChild(li);
  });

  el("draftResponse").value = result.draft_response || "";

  resultsEl.classList.remove("hidden");
  resultsEl.scrollIntoView({ behavior: "smooth", block: "start" });
}

analyzeBtn.addEventListener("click", analyze);

el("copyBtn").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(el("draftResponse").value);
    el("copyStatus").textContent = "Copied!";
    setTimeout(() => (el("copyStatus").textContent = ""), 2000);
  } catch {
    el("copyStatus").textContent = "Couldn't copy — select and copy manually.";
  }
});
