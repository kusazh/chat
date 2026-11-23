import { BASE_URL, complete } from './api.js?v=api-domain-1';

const $ = id => document.getElementById(id);
const HISTORY_KEY = 'kus-chat-history-v1';
let chats = [];
let currentId;
let activeRequest = null;
let storageWarning = false;
let toastTimer;

try {
  localStorage.removeItem('kus-chat-api-key');
  sessionStorage.removeItem('kus-chat-api-key');
} catch { /* Public chat works without browser credential storage. */ }

function storageGet(storage, key) {
  try { return storage.getItem(key); } catch { return null; }
}

function toast(text) {
  $('toast').textContent = text;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3500);
}

function save() {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify({ chats, currentId }));
  } catch {
    if (!storageWarning) toast('浏览器无法保存记录；当前对话仍可继续使用。');
    storageWarning = true;
  }
}

function current() { return chats.find(chat => chat.id === currentId); }

function createChat() {
  const chat = { id: crypto.randomUUID(), title: '新对话', messages: [], draft: '', updated: Date.now() };
  chats.unshift(chat);
  currentId = chat.id;
  save();
  return chat;
}

function closeSidebar() {
  $('sidebar').classList.remove('open');
  $('shade').hidden = true;
  $('menu').setAttribute('aria-expanded', 'false');
}

function newChat() {
  if (activeRequest) return toast('请先等待回复，或停止当前请求。');
  if (current()?.messages.length) createChat();
  render();
  closeSidebar();
  $('prompt').focus();
}

function history() {
  $('history').replaceChildren();
  const query = $('search').value.trim().toLowerCase();
  const visible = chats.filter(chat => chat.messages.length && (!query
    || chat.title.toLowerCase().includes(query)
    || chat.messages.some(message => message.content.toLowerCase().includes(query))));
  if (!visible.length) {
    const empty = document.createElement('p');
    empty.className = 'history-empty';
    empty.textContent = query ? '没有找到相关聊天' : '暂无聊天记录';
    $('history').append(empty);
  }
  for (const chat of visible) {
    const row = document.createElement('div');
    row.className = `history-item${chat.id === currentId ? ' active' : ''}`;
    const title = document.createElement('button');
    title.className = 'history-title';
    title.textContent = chat.title;
    title.title = chat.title;
    title.setAttribute('aria-current', chat.id === currentId ? 'page' : 'false');
    title.onclick = () => {
      if (activeRequest) return toast('请先等待回复，或停止当前请求。');
      currentId = chat.id;
      save(); render(); closeSidebar();
    };
    const remove = document.createElement('button');
    remove.className = 'history-delete';
    remove.textContent = '×';
    remove.setAttribute('aria-label', `删除对话：${chat.title}`);
    remove.onclick = () => {
      if (activeRequest) return toast('请先停止当前请求。');
      if (!confirm(`删除“${chat.title}”？此操作会移除此浏览器中的对话记录。`)) return;
      chats = chats.filter(item => item.id !== chat.id);
      if (!chats.some(item => item.id === currentId)) currentId = chats[0]?.id;
      if (!current()) createChat();
      save(); render();
    };
    row.append(title, remove);
    $('history').append(row);
  }
}

function markdown(container, text) {
  // Build elements from text; messages never enter an HTML parser.
  const lines = text.split('\n');
  let code = null;
  let list = null;
  for (const line of lines) {
    if (line.startsWith('```')) {
      if (code) { code = null; } else {
        const pre = document.createElement('pre');
        code = document.createElement('code');
        pre.append(code); container.append(pre);
      }
      list = null;
      continue;
    }
    if (code) { code.textContent += line + '\n'; continue; }
    const bullet = line.match(/^\s*[-*] (.*)$/);
    if (bullet) {
      if (!list) { list = document.createElement('ul'); container.append(list); }
      const item = document.createElement('li');
      item.textContent = bullet[1]; list.append(item); continue;
    }
    list = null;
    const heading = line.match(/^#{1,3} (.*)$/);
    const element = document.createElement(heading ? 'h3' : 'p');
    element.textContent = heading ? heading[1] : line || '\u00a0';
    container.append(element);
  }
}

function scrollDown() {
  $('scroll-area').scrollTop = $('scroll-area').scrollHeight;
}

function renderMessages() {
  const chat = current();
  $('welcome').hidden = chat.messages.length > 0;
  $('main').classList.toggle('empty', chat.messages.length === 0);
  $('messages').replaceChildren();
  for (const [index, message] of chat.messages.entries()) {
    const article = document.createElement('article');
    article.className = `message ${message.role}`;
    article.setAttribute('aria-label', message.role === 'user' ? '你' : 'Chat');
    if (message.role === 'user') {
      const content = document.createElement('div'); content.className = 'message-content';
      content.textContent = message.content; article.append(content);
    } else {
      const heading = document.createElement('div'); heading.className = 'assistant-heading';
      const mark = document.createElement('span'); mark.textContent = '✳';
      heading.append(mark, 'Chat'); article.append(heading);
      const body = document.createElement('div'); body.className = 'assistant-body';
      if (message.status === 'waiting') {
        const wait = document.createElement('div'); wait.className = 'waiting';
        wait.append(document.createElement('i'), document.createTextNode('正在思考…'));
        body.append(wait);
      } else if (message.status === 'error' || message.status === 'stopped') {
        const notice = document.createElement('p');
        notice.className = message.status === 'error' ? 'error-message' : 'interrupted';
        notice.textContent = message.error || '已停止等待。'; body.append(notice);
      } else markdown(body, message.content);
      article.append(body);
      const actions = document.createElement('div'); actions.className = 'message-actions';
      if (message.content && !message.status) {
        const copy = document.createElement('button'); copy.textContent = '复制回复';
        copy.onclick = async () => {
          try { await navigator.clipboard.writeText(message.content); toast('已复制'); }
          catch { toast('无法复制，请手动选择文字。'); }
        };
        actions.append(copy);
      }
      if ((message.status === 'error' || message.status === 'stopped') && index === chat.messages.length - 1) {
        const retry = document.createElement('button'); retry.textContent = '重新发送 ↻';
        retry.disabled = !!activeRequest; retry.onclick = () => send(true); actions.append(retry);
      }
      article.append(actions);
    }
    $('messages').append(article);
  }
  scrollDown();
}

function resize() {
  $('prompt').style.height = 'auto';
  $('prompt').style.height = Math.min($('prompt').scrollHeight, 180) + 'px';
  $('send').disabled = !!activeRequest || !$('prompt').value.trim();
}

function render() {
  history(); renderMessages();
  $('prompt').value = current().draft || '';
  $('prompt').disabled = !!activeRequest;
  $('send').hidden = !!activeRequest;
  $('stop').hidden = !activeRequest;
  $('waiting-label').hidden = !activeRequest;
  resize();
}

function openSettings() {
  $('settings').showModal();
}

async function checkConnection(signal) {
  const response = await fetch(`${BASE_URL}/healthz`, {
    signal,
    credentials: 'omit', referrerPolicy: 'no-referrer',
  });
  if (!response.ok) throw new Error('暂时无法连接，请稍后再试。');
}

function connection(online) {
  $('connection').classList.toggle('online', online);
  $('connection').replaceChildren(document.createElement('i'), document.createTextNode(online ? '已连接' : '未连接'));
}

async function send(retry = false) {
  if (activeRequest) return;
  const chat = current();
  const prompt = $('prompt').value.trim();
  if (!retry && !prompt) return;
  if (retry) chat.messages.pop();
  else {
    if (!chat.messages.length) chat.title = prompt.slice(0, 30);
    chat.messages.push({ role: 'user', content: prompt });
    chat.draft = '';
  }
  const messages = chat.messages.filter(message => !message.status).map(({ role, content }) => ({ role, content }));
  const answer = { role: 'assistant', content: '', status: 'waiting' };
  chat.messages.push(answer); chat.updated = Date.now();
  const controller = new AbortController();
  activeRequest = controller;
  const timer = setTimeout(() => controller.abort('timeout'), 660000);
  save(); render();
  try {
    answer.content = await complete(messages, controller.signal, text => {
      answer.content = text; delete answer.status; renderMessages();
    });
    delete answer.status;
    connection(true);
  } catch (error) {
    answer.content = '';
    if (controller.signal.aborted && controller.signal.reason !== 'timeout') {
      answer.status = 'stopped'; answer.error = '已停止等待。';
    } else {
      answer.status = 'error';
      answer.error = controller.signal.reason === 'timeout' ? '等待超时了，可以重新发送。'
        : error instanceof TypeError ? '连接中断，请检查网络后重新发送。' : error.message;
    }
  } finally {
    clearTimeout(timer); activeRequest = null; save(); render(); $('prompt').focus();
  }
}

try {
  const saved = JSON.parse(storageGet(localStorage, HISTORY_KEY) || '{}');
  if (Array.isArray(saved.chats)) chats = saved.chats.filter(chat => typeof chat.id === 'string'
    && typeof chat.title === 'string' && Array.isArray(chat.messages)
    && chat.messages.every(message => ['user', 'assistant'].includes(message.role) && typeof message.content === 'string'));
  currentId = saved.currentId;
  for (const chat of chats) for (const message of chat.messages) {
    if (message.status === 'waiting') { message.status = 'stopped'; message.error = '上次等待已中断，请重新发送。'; }
  }
} catch { chats = []; }
if (!current()) currentId = chats[0]?.id;
if (!current()) createChat();

const theme = storageGet(localStorage, 'kus-chat-theme');
document.body.classList.toggle('dark', theme ? theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches);
function toggleTheme() {
  const dark = document.body.classList.toggle('dark');
  try { localStorage.setItem('kus-chat-theme', dark ? 'dark' : 'light'); } catch { /* Theme still applies for this visit. */ }
}
$('theme').onclick = toggleTheme;
$('settings-theme').onclick = toggleTheme;
$('new-chat').onclick = newChat;
$('new-inline').onclick = newChat;
$('settings-open').onclick = openSettings;
$('profile-open').onclick = openSettings;
$('settings-close').onclick = () => $('settings').close();
$('search-toggle').onclick = () => { $('search').hidden = !$('search').hidden; if (!$('search').hidden) $('search').focus(); };
$('search').oninput = history;
$('sidebar-close').onclick = () => {
  if (matchMedia('(max-width:650px)').matches) closeSidebar();
  else $('sidebar').classList.add('collapsed');
};
$('composer').onsubmit = event => { event.preventDefault(); send(); };
$('prompt').oninput = () => { current().draft = $('prompt').value; save(); resize(); };
$('prompt').onkeydown = event => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
    event.preventDefault(); send();
  }
};
$('stop').onclick = () => activeRequest?.abort('user');
$('clear-chat').onclick = () => {
  if (activeRequest) return toast('请先停止当前请求。');
  if (!current().messages.length || !confirm('清空当前对话？此操作会移除此浏览器中的消息。')) return;
  current().messages = []; current().title = '新对话'; save(); render();
};
$('menu').onclick = () => {
  if (!matchMedia('(max-width:650px)').matches) { $('sidebar').classList.remove('collapsed'); return; }
  const open = $('sidebar').classList.toggle('open');
  $('shade').hidden = !open; $('menu').setAttribute('aria-expanded', String(open));
};
$('shade').onclick = closeSidebar;
document.addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault(); if (!$('settings').open) newChat();
  }
  if (event.key === 'Escape') closeSidebar();
});
document.querySelectorAll('[data-prompt]').forEach(button => {
  button.onclick = () => {
    $('prompt').value = button.dataset.prompt; current().draft = button.dataset.prompt;
    save(); resize(); $('prompt').focus();
  };
});
render();
checkConnection(AbortSignal.timeout(15000)).then(() => connection(true)).catch(() => connection(false));
