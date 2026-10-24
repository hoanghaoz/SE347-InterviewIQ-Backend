export const LLM_PLAYGROUND_HTML = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>LLM Prompt Playground</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 0; background: #f5f6f8; color: #1b1f24; }
  main { max-width: 960px; margin: 0 auto; padding: 16px; }
  h1 { font-size: 22px; margin: 8px 0 12px; }
  .warn { background: #fff4ce; border: 1px solid #e5c75b; padding: 8px 12px; border-radius: 6px; font-size: 14px; }
  label { display: block; font-weight: 600; margin: 12px 0 4px; }
  textarea, select, input { width: 100%; box-sizing: border-box; padding: 8px; border: 1px solid #c5cad1; border-radius: 6px; font: inherit; }
  textarea { min-height: 110px; font-family: ui-monospace, monospace; }
  .row { display: flex; gap: 12px; flex-wrap: wrap; }
  .row > div { flex: 1; min-width: 180px; }
  button { margin-top: 16px; padding: 10px 18px; border: 0; border-radius: 6px; background: #2457d6; color: #fff; font: inherit; cursor: pointer; }
  button:disabled { opacity: 0.6; cursor: wait; }
  .results { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 12px; margin-top: 16px; }
  .card { background: #fff; border: 1px solid #d9dde3; border-radius: 8px; padding: 12px; }
  .meta { font-size: 13px; color: #4a5260; margin: 4px 0 8px; }
  pre { white-space: pre-wrap; word-break: break-word; margin: 0; }
  .error { color: #b3261e; }
  [hidden] { display: none; }
</style>
</head>
<body>
<main>
  <h1>LLM Prompt Playground</h1>
  <div class="warn">Internal tool. Every run spends real AI quota. Enabled only while ENABLE_LLM_PLAYGROUND=true.</div>

  <div class="row">
    <div>
      <label for="mode">Mode</label>
      <select id="mode">
        <option value="text">Text</option>
        <option value="json">JSON</option>
      </select>
    </div>
    <div>
      <label for="provider">Provider</label>
      <select id="provider">
        <option value="default">Default (primary + fallback)</option>
        <option value="gemini">Gemini</option>
        <option value="groq">Groq</option>
        <option value="both">Compare Gemini and Groq</option>
      </select>
    </div>
    <div>
      <label for="temperature">Temperature (0 - 2, optional)</label>
      <input id="temperature" type="number" min="0" max="2" step="0.1" />
    </div>
  </div>

  <label for="system">System prompt (optional)</label>
  <textarea id="system"></textarea>

  <label for="prompt">Prompt</label>
  <textarea id="prompt" placeholder="Viết 3 câu hỏi phỏng vấn Java cho fresher"></textarea>

  <div id="schemaWrap" hidden>
    <label for="schema">JSON Schema</label>
    <textarea id="schema">{"type":"object","properties":{"questions":{"type":"array","items":{"type":"string"}}},"required":["questions"]}</textarea>
  </div>

  <button id="run" type="button">Run</button>
  <div class="results" id="results"></div>
</main>
<script>
  var modeEl = document.getElementById('mode');
  var providerEl = document.getElementById('provider');
  var runEl = document.getElementById('run');
  var resultsEl = document.getElementById('results');
  var RUN_URL = '/api/internal/llm-playground/run';

  modeEl.addEventListener('change', function () {
    document.getElementById('schemaWrap').hidden = modeEl.value !== 'json';
  });

  function errorMessage(json, status) {
    if (json && Array.isArray(json.errors) && json.errors.length > 0) {
      return json.errors.map(function (e) { return e.field + ': ' + e.messages.join(', '); }).join('; ');
    }
    return (json && json.message) || ('HTTP ' + status);
  }

  async function runOnce(provider) {
    var body = { mode: modeEl.value, provider: provider, prompt: document.getElementById('prompt').value };
    var system = document.getElementById('system').value;
    if (system) { body.systemPrompt = system; }
    if (modeEl.value === 'json') { body.schema = document.getElementById('schema').value; }
    var temperature = document.getElementById('temperature').value;
    if (temperature !== '') { body.temperature = Number(temperature); }

    var response = await fetch(RUN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    var json = await response.json().catch(function () { return null; });
    if (!response.ok) { throw new Error(errorMessage(json, response.status)); }
    return json.data;
  }

  function renderCard(title, data, errorText) {
    var card = document.createElement('div');
    card.className = 'card';
    var heading = document.createElement('strong');
    heading.textContent = title;
    var meta = document.createElement('div');
    meta.className = 'meta';
    var output = document.createElement('pre');
    if (errorText) {
      output.className = 'error';
      output.textContent = errorText;
    } else {
      var tokens = data.usage ? ' | tokens in/out: ' + data.usage.inputTokens + '/' + data.usage.outputTokens : '';
      meta.textContent = 'answered by: ' + data.provider + ' | model: ' + data.model + ' | ' + data.latencyMs + ' ms' + tokens;
      output.textContent = data.output;
    }
    card.appendChild(heading);
    card.appendChild(meta);
    card.appendChild(output);
    resultsEl.appendChild(card);
  }

  runEl.addEventListener('click', async function () {
    var choice = providerEl.value;
    var targets = choice === 'both' ? ['gemini', 'groq'] : [choice];
    runEl.disabled = true;
    resultsEl.textContent = '';
    var settled = await Promise.allSettled(targets.map(runOnce));
    settled.forEach(function (outcome, index) {
      if (outcome.status === 'fulfilled') {
        renderCard(targets[index], outcome.value, null);
      } else {
        renderCard(targets[index], null, outcome.reason.message);
      }
    });
    runEl.disabled = false;
  });
</script>
</body>
</html>
`;
