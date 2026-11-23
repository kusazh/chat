# Chat

A small ChatGPT-style chat interface at **https://kus.ai/chat/**.

The static site lives in `site/`. Push to `main` to test and deploy through GitHub Pages. The account's main Pages site owns `kus.ai`; this project intentionally has no CNAME file, so it inherits that domain under `/chat/`.

Open settings and enter your API key. It is kept in session storage by default. Enable “在此浏览器记住密钥” to persist it in local storage. Messages and drafts are stored locally; requests send the conversation to `https://chat.kus.ai/v1/chat/completions`. No credentials belong in this repository or the Pages bundle.

Features: multiple conversations, saved drafts/history, streamed responses, cancellation/retry, basic safe Markdown rendering, copy replies, light/dark themes and mobile navigation. Enter sends; Shift+Enter inserts a line break. Cmd/Ctrl+K starts a new conversation.

The API must allow CORS for `https://kus.ai`, including Authorization and Content-Type request headers. The backend is maintained separately in `kusazh/human-telegram-api`.

Run `npm run check && npm test`. To preview, run `python3 -m http.server 8080 --directory site` and open localhost:8080. API calls from localhost require a separate development CORS configuration; production allows only kus.ai.
