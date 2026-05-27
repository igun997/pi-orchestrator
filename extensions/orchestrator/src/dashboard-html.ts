/**
 * Embedded dashboard HTML — single-file SPA with SSE client.
 * Renders task DAG, live progress, per-task logs, elapsed timers.
 */
export function getDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Orchestrator Dashboard</title>
<style>
  :root {
    --bg: #0f1117;
    --surface: #1a1d27;
    --border: #2a2d3a;
    --text: #e4e4e7;
    --muted: #71717a;
    --accent: #6366f1;
    --success: #22c55e;
    --warning: #f59e0b;
    --error: #ef4444;
    --running: #3b82f6;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
    padding: 1.5rem;
  }
  .header {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1.5rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid var(--border);
  }
  .header h1 {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--accent);
  }
  .header .phase {
    font-size: 0.875rem;
    color: var(--muted);
    padding: 0.25rem 0.75rem;
    background: var(--surface);
    border-radius: 4px;
    border: 1px solid var(--border);
  }
  .header .connection {
    margin-left: auto;
    font-size: 0.75rem;
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    background: var(--success);
    animation: pulse 2s infinite;
  }
  .dot.disconnected { background: var(--error); animation: none; }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }

  /* Progress bar */
  .progress-section {
    margin-bottom: 1.5rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1rem 1.25rem;
  }
  .progress-bar-wrap {
    height: 6px;
    background: var(--border);
    border-radius: 3px;
    overflow: hidden;
    margin-bottom: 0.75rem;
  }
  .progress-bar {
    height: 100%;
    background: linear-gradient(90deg, var(--accent), var(--success));
    border-radius: 3px;
    transition: width 0.4s ease;
  }
  .stats {
    display: flex;
    gap: 1.5rem;
    font-size: 0.8rem;
  }
  .stat { display: flex; align-items: center; gap: 0.3rem; }
  .stat .label { color: var(--muted); }
  .stat.complete .value { color: var(--success); }
  .stat.running .value { color: var(--running); }
  .stat.pending .value { color: var(--muted); }
  .stat.failed .value { color: var(--error); }

  /* Task grid */
  .tasks-section {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 0.75rem;
    margin-bottom: 1.5rem;
  }
  .task-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.75rem 1rem;
    transition: border-color 0.3s, box-shadow 0.3s;
    position: relative;
    overflow: hidden;
  }
  .task-card::before {
    content: '';
    position: absolute;
    left: 0; top: 0; bottom: 0;
    width: 3px;
    border-radius: 3px 0 0 3px;
  }
  .task-card.pending::before { background: var(--muted); }
  .task-card.running::before { background: var(--running); }
  .task-card.running { border-color: var(--running); box-shadow: 0 0 12px rgba(59,130,246,0.1); }
  .task-card.complete::before { background: var(--success); }
  .task-card.complete { opacity: 0.7; }
  .task-card.failed::before { background: var(--error); }
  .task-card.failed { border-color: var(--error); }

  .task-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.4rem;
  }
  .task-name {
    font-size: 0.8rem;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .task-time {
    font-size: 0.7rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .task-status {
    font-size: 0.7rem;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .task-card.running .task-status { color: var(--running); }
  .task-card.complete .task-status { color: var(--success); }
  .task-card.failed .task-status { color: var(--error); }

  .task-logs {
    margin-top: 0.5rem;
    max-height: 80px;
    overflow-y: auto;
    font-size: 0.65rem;
    color: var(--muted);
    border-top: 1px solid var(--border);
    padding-top: 0.4rem;
  }
  .task-logs p { margin-bottom: 0.2rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  /* Log stream */
  .log-section {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1rem;
    max-height: 300px;
    overflow-y: auto;
  }
  .log-section h3 {
    font-size: 0.8rem;
    color: var(--muted);
    margin-bottom: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .log-entry {
    font-size: 0.7rem;
    padding: 0.2rem 0;
    border-bottom: 1px solid var(--border);
    display: flex;
    gap: 0.5rem;
  }
  .log-entry .time { color: var(--muted); flex-shrink: 0; }
  .log-entry .msg { color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .log-entry.error .msg { color: var(--error); }
</style>
</head>
<body>
<div class="header">
  <h1>⚡ Orchestrator</h1>
  <span class="phase" id="phase">waiting…</span>
  <div class="connection">
    <div class="dot" id="connDot"></div>
    <span id="connLabel">connected</span>
  </div>
</div>

<div class="progress-section">
  <div class="progress-bar-wrap">
    <div class="progress-bar" id="progressBar" style="width: 0%"></div>
  </div>
  <div class="stats">
    <div class="stat complete"><span class="value" id="statComplete">0</span><span class="label">done</span></div>
    <div class="stat running"><span class="value" id="statRunning">0</span><span class="label">running</span></div>
    <div class="stat pending"><span class="value" id="statPending">0</span><span class="label">pending</span></div>
    <div class="stat failed"><span class="value" id="statFailed">0</span><span class="label">failed</span></div>
  </div>
</div>

<div class="tasks-section" id="tasksGrid"></div>

<div class="log-section">
  <h3>Event Log</h3>
  <div id="logStream"></div>
</div>

<script>
const state = {
  tasks: new Map(),
  logs: new Map(),
  startTimes: new Map(),
  phase: 'waiting',
};

function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? m + ':' + String(s % 60).padStart(2, '0') : s + 's';
}

function updateStats() {
  let complete = 0, running = 0, pending = 0, failed = 0;
  for (const t of state.tasks.values()) {
    if (t.status === 'complete' || t.status === 'skipped') complete++;
    else if (t.status === 'running') running++;
    else if (t.status === 'failed') failed++;
    else pending++;
  }
  const total = state.tasks.size;
  const pct = total > 0 ? Math.round((complete / total) * 100) : 0;
  document.getElementById('statComplete').textContent = complete;
  document.getElementById('statRunning').textContent = running;
  document.getElementById('statPending').textContent = pending;
  document.getElementById('statFailed').textContent = failed;
  document.getElementById('progressBar').style.width = pct + '%';
  document.getElementById('phase').textContent = state.phase;
}

function renderTasks() {
  const grid = document.getElementById('tasksGrid');
  grid.innerHTML = '';
  // Sort: running first, then pending, then complete, then failed
  const order = { running: 0, pending: 1, complete: 2, skipped: 2, failed: 3 };
  const sorted = [...state.tasks.values()].sort((a, b) => (order[a.status] ?? 1) - (order[b.status] ?? 1));

  for (const task of sorted) {
    const card = document.createElement('div');
    card.className = 'task-card ' + task.status;
    card.id = 'task-' + task.id;

    let timeStr = '';
    if (task.status === 'running' && state.startTimes.has(task.id)) {
      timeStr = formatTime(Date.now() - state.startTimes.get(task.id));
    } else if (task.duration) {
      timeStr = formatTime(task.duration);
    }

    const logs = state.logs.get(task.id) || [];
    const logsHtml = logs.length > 0
      ? '<div class="task-logs">' + logs.slice(-5).map(l => '<p>' + escHtml(l) + '</p>').join('') + '</div>'
      : '';

    card.innerHTML =
      '<div class="task-header">' +
        '<span class="task-name">' + escHtml(task.name) + '</span>' +
        '<span class="task-time">' + timeStr + '</span>' +
      '</div>' +
      '<div class="task-status">' + task.status + '</div>' +
      logsHtml;

    grid.appendChild(card);
  }
}

function addLog(msg, isError) {
  const stream = document.getElementById('logStream');
  const entry = document.createElement('div');
  entry.className = 'log-entry' + (isError ? ' error' : '');
  const now = new Date().toLocaleTimeString();
  entry.innerHTML = '<span class="time">' + now + '</span><span class="msg">' + escHtml(msg) + '</span>';
  stream.appendChild(entry);
  stream.scrollTop = stream.scrollHeight;
  // Cap at 200 entries
  while (stream.children.length > 200) stream.removeChild(stream.firstChild);
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function handleEvent(event) {
  switch (event.type) {
    case 'pipeline-start':
      state.phase = event.phase;
      state.tasks.clear();
      for (const t of event.tasks) {
        state.tasks.set(t.id, { ...t });
      }
      addLog('Pipeline started: ' + event.tasks.length + ' tasks');
      break;

    case 'pipeline-end':
      state.phase = event.phase;
      addLog('Pipeline ended: ' + event.phase + (event.failed.length ? ' (failed: ' + event.failed.join(', ') + ')' : ''), event.failed.length > 0);
      break;

    case 'task-start':
      if (state.tasks.has(event.taskId)) {
        state.tasks.get(event.taskId).status = 'running';
      } else {
        state.tasks.set(event.taskId, { id: event.taskId, name: event.taskName, status: 'running', deps: [] });
      }
      state.startTimes.set(event.taskId, event.startedAt);
      addLog('▶ ' + event.taskName);
      break;

    case 'task-end': {
      const t = state.tasks.get(event.taskId);
      if (t) {
        t.status = event.status;
        t.duration = event.duration;
      }
      state.startTimes.delete(event.taskId);
      const icon = event.status === 'complete' ? '✓' : '✗';
      addLog(icon + ' ' + event.taskId + (event.error ? ': ' + event.error : ''), event.status === 'failed');
      break;
    }

    case 'task-log': {
      if (!state.logs.has(event.taskId)) state.logs.set(event.taskId, []);
      state.logs.get(event.taskId).push(event.message);
      break;
    }

    case 'phase-change':
      state.phase = event.phase;
      addLog('Phase: ' + event.phase);
      break;

    case 'stats':
      document.getElementById('statComplete').textContent = event.complete;
      document.getElementById('statRunning').textContent = event.running;
      document.getElementById('statPending').textContent = event.pending;
      document.getElementById('statFailed').textContent = event.failed;
      document.getElementById('progressBar').style.width = event.pct + '%';
      return; // skip full re-render
  }
  updateStats();
  renderTasks();
}

// Timer to update elapsed times
setInterval(() => {
  if (state.startTimes.size > 0) renderTasks();
}, 1000);

// SSE connection
function connect() {
  const es = new EventSource('/events');
  const dot = document.getElementById('connDot');
  const label = document.getElementById('connLabel');

  es.onopen = () => {
    dot.className = 'dot';
    label.textContent = 'connected';
  };
  es.onmessage = (e) => {
    try { handleEvent(JSON.parse(e.data)); } catch {}
  };
  es.onerror = () => {
    dot.className = 'dot disconnected';
    label.textContent = 'reconnecting…';
  };
}
connect();
</script>
</body>
</html>`;
}
