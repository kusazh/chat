export const BASE_URL = 'https://chat.kus.ai/v1';

export async function* readEvents(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let boundary;
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        const event = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const data = event.split('\n').filter(line => line.startsWith('data:'))
          .map(line => line.slice(5).trimStart()).join('\n');
        if (!data) continue;
        if (data === '[DONE]') return;
        yield JSON.parse(data);
      }
      if (done) throw new Error('连接意外结束，请稍后重试。');
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function complete(messages, key, signal, onContent) {
  const payload = JSON.stringify({ model: 'human-telegram', messages, stream: true });
  if (new TextEncoder().encode(payload).length > 65536) {
    throw new Error('这段对话太长了，请开启新对话。');
  }
  if (messages.length > 200) throw new Error('这段对话已达到消息上限，请开启新对话。');
  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: payload, signal, credentials: 'omit', referrerPolicy: 'no-referrer',
  });
  if (!response.ok) {
    const errors = {
      401: 'API Key 无效，请在设置中检查。',
      429: '现在有点忙，请稍后再试。',
      503: '暂时无法连接，请稍后再试。',
      504: '等待超时了，可以再试一次。',
      413: '这段对话太长了，请开启新对话。',
    };
    throw new Error(errors[response.status] || `发送失败（${response.status}），请稍后重试。`);
  }
  let answer = '';
  for await (const event of readEvents(response.body)) {
    if (event.error) throw new Error(event.error.code === 'human_timeout'
      ? '等待超时了，可以再试一次。' : '回复暂时不可用，请稍后再试。');
    const content = event.choices?.[0]?.delta?.content;
    if (content) {
      answer += content;
      onContent(answer);
    }
  }
  if (!answer) throw new Error('没有收到回复，请再试一次。');
  return answer;
}
