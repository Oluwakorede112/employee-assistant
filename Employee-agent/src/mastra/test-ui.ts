export const testUiHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AskNova · Test chat</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: #f5f7f7; color: #15312c; }
    .shell { max-width: 860px; min-height: 100vh; margin: auto; display: flex; flex-direction: column; background: #fff; box-shadow: 0 0 50px #143c3012; }
    header { padding: 25px 30px 20px; border-bottom: 1px solid #e1e9e6; }
    .eyebrow { color: #3a7964; font-size: 11px; font-weight: 800; letter-spacing: .15em; text-transform: uppercase; }
    h1 { margin: 8px 0 4px; font-size: 27px; letter-spacing: -.04em; }
    header p { margin: 0; color: #61746e; font-size: 14px; }
    .notice { margin: 20px 30px 0; padding: 12px 15px; border-radius: 12px; background: #eef6f2; color: #305b4c; font-size: 13px; line-height: 1.5; }
    #messages { flex: 1; overflow-y: auto; padding: 26px 30px; display: flex; flex-direction: column; gap: 18px; }
    .message { max-width: 82%; white-space: pre-wrap; line-height: 1.55; font-size: 15px; overflow-wrap: anywhere; }
    .message .label { margin-bottom: 6px; font-size: 11px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: #6d8179; }
    .message.user { align-self: flex-end; padding: 13px 16px; border-radius: 17px 17px 4px 17px; background: #174d3c; color: white; }
    .message.user .label { color: #bde3d1; }
    .message.assistant { align-self: flex-start; padding: 15px 18px; border: 1px solid #dfe9e4; border-radius: 17px 17px 17px 4px; background: #fbfdfc; }
    .message.error { border-color: #f1cdca; background: #fff7f6; color: #8d3029; }
    .toolbar { padding: 18px 30px 0; display: flex; align-items: center; justify-content: space-between; gap: 12px; color: #61746e; font-size: 13px; }
    .toolbar button { border: 1px solid #cbdcd3; border-radius: 9px; background: #fff; color: #174d3c; padding: 8px 11px; font-weight: 700; cursor: pointer; }
    .suggestions { padding: 0 30px 14px; display: flex; flex-wrap: wrap; gap: 8px; }
    .suggestions button { border: 1px solid #d6e4dc; background: white; border-radius: 999px; padding: 8px 11px; color: #345c4b; cursor: pointer; }
    form { display: flex; align-items: end; gap: 10px; padding: 15px 30px 27px; border-top: 1px solid #e1e9e6; }
    textarea { flex: 1; min-height: 47px; max-height: 180px; resize: vertical; padding: 12px 14px; border: 1px solid #cbdcd3; border-radius: 12px; font: inherit; outline-color: #348564; }
    form button { min-height: 47px; border: 0; border-radius: 12px; padding: 0 20px; background: #174d3c; color: white; font-weight: 700; cursor: pointer; }
    form button:disabled { opacity: .5; cursor: wait; }
    @media(max-width: 600px) { header, #messages { padding-left: 18px; padding-right: 18px; } .notice { margin-left: 18px; margin-right: 18px; } form { padding: 14px 18px 20px; } .suggestions { padding-left: 18px; padding-right: 18px; } .message { max-width: 95%; } }
  </style>
</head>
<body>
  <main class="shell">
    <header><div class="eyebrow">Local test workspace</div><h1>AskNova</h1><p>Ask a policy question and review the answer. Follow-up questions stay in this conversation.</p></header>
    <div class="notice">This page calls the same Mastra agent planned for Slack. Check every answer against the approved PDF before launch.</div>
    <div class="toolbar"><span id="conversation-label">Current conversation</span><button id="new-chat" type="button">New conversation</button></div>
    <section id="messages" aria-live="polite"></section>
    <div class="suggestions"><button type="button" data-question="How many days of annual leave are listed in the handbook?">Annual leave</button><button type="button" data-question="Does the handbook say annual leave carries over?">Unsupported question</button></div>
    <form id="chat-form"><textarea id="question" rows="1" maxlength="4000" placeholder="Ask about the employee handbook…" aria-label="Your question" required></textarea><button id="send" type="submit">Send</button></form>
  </main>
  <script>
    const messages = document.getElementById('messages');
    const form = document.getElementById('chat-form');
    const input = document.getElementById('question');
    const send = document.getElementById('send');
    const stateKey = 'asknova-test-conversation';
    let saved; try { saved = JSON.parse(localStorage.getItem(stateKey) || 'null'); } catch { saved = null; }
    let threadId = saved && /^[a-f0-9-]{36}$/.test(saved.threadId) ? saved.threadId : crypto.randomUUID();
    let displayHistory = saved && Array.isArray(saved.messages) ? saved.messages.filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string').slice(-40) : [];
    function persist() { localStorage.setItem(stateKey, JSON.stringify({ threadId, messages: displayHistory })); }
    function record(role, content) { displayHistory.push({ role, content }); displayHistory = displayHistory.slice(-40); persist(); }
    displayHistory.forEach(m => add(m.role, m.content));
    persist();
    document.getElementById('new-chat').addEventListener('click', () => { threadId = crypto.randomUUID(); displayHistory = []; messages.replaceChildren(); persist(); input.focus(); });
    function add(role, content, isError = false) {
      const article = document.createElement('article');
      article.className = 'message ' + role + (isError ? ' error' : '');
      const label = document.createElement('div'); label.className = 'label'; label.textContent = role === 'user' ? 'You' : 'AskNova';
      const body = document.createElement('div'); body.textContent = content;
      article.append(label, body); messages.append(article); messages.scrollTop = messages.scrollHeight;
      return body;
    }
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const question = input.value.trim(); if (!question || send.disabled) return;
      add('user', question); record('user', question); input.value = ''; send.disabled = true;
      const body = add('assistant', 'Thinking…');
      try {
        const response = await fetch('/test/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question, threadId }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'The request failed.');
        body.textContent = data.answer; record('assistant', data.answer);
      } catch (error) { body.parentElement.classList.add('error'); body.textContent = error.message || 'The request failed.'; }
      finally { send.disabled = false; input.focus(); }
    });
    input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); form.requestSubmit(); } });
    document.querySelectorAll('[data-question]').forEach(button => button.addEventListener('click', () => { input.value = button.dataset.question; input.focus(); }));
  </script>
</body>
</html>`
