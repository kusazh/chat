import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readEvents, complete } from '../site/api.js';

test('SSE parser preserves split UTF-8 characters and ignores waiting comments', async () => {
  const bytes = new TextEncoder().encode(': waiting\n\ndata: {"choices":[{"delta":{"content":"你好"}}]}\n\ndata: [DONE]\n\n');
  const stream = new ReadableStream({ start(controller) {
    for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
    controller.close();
  } });
  const events = [];
  for await (const event of readEvents(stream)) events.push(event);
  assert.equal(events[0].choices[0].delta.content, '你好');
  assert.equal(events.length, 1);
});

test('disconnected streams fail instead of returning partial successful answers', async () => {
  const stream = new ReadableStream({ start(controller) {
    controller.enqueue(new TextEncoder().encode('data: {"choices":[]}\n\n'));
    controller.close();
  } });
  await assert.rejects(async () => { for await (const event of readEvents(stream)) {} }, /连接意外结束/);
});

test('public chat includes prior conversation and streaming without client credentials', async () => {
  const original = globalThis.fetch;
  const messages = [{ role: 'user', content: 'first' }, { role: 'assistant', content: 'answer' }, { role: 'user', content: 'second' }];
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://api.kus.ai/web/chat/completions');
    assert.equal(options.headers.Authorization, undefined);
    assert.deepEqual(JSON.parse(options.body).messages, messages);
    assert.equal(JSON.parse(options.body).stream, true);
    return new Response('data: {"choices":[{"delta":{"content":"回复"}}]}\n\ndata: [DONE]\n\n');
  };
  try { assert.equal(await complete(messages, new AbortController().signal, () => {}), '回复'); }
  finally { globalThis.fetch = original; }
});

test('rate limits produce actionable error and no retries', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response('{}', { status: 429 }); };
  try { await assert.rejects(complete([{ role: 'user', content: 'hi' }], null, () => {}), /稍后再试/); }
  finally { globalThis.fetch = original; }
  assert.equal(calls, 1);
});
