import test from "node:test";
import assert from "node:assert/strict";
import { renderMarkdown } from "./markdown.js";

test("assistant markdown renders formatting, lists, code and links", () => {
  const html = renderMarkdown("# Заголовок\n\n**Жирный** и *курсив*.\n\n- пункт\n\n```js\nconst x = 1;\n```\n\n[Источник](https://example.org)");
  assert.match(html, /<h1>Заголовок<\/h1>/);
  assert.match(html, /<strong>Жирный<\/strong>/);
  assert.match(html, /<em>курсив<\/em>/);
  assert.match(html, /<li>пункт<\/li>/);
  assert.match(html, /<pre><code class="language-js">/);
  assert.match(html, /href="https:\/\/example\.org"/);
});

test("assistant markdown escapes HTML and blocks unsafe links and remote images", () => {
  const html = renderMarkdown('<script>alert(1)</script>\n\n[bad](javascript:alert(1))\n\n![tracker](https://example.org/tracker.png)');
  assert.doesNotMatch(html, /<script|<img|href="javascript:/);
  assert.match(html, /&lt;script&gt;/);
});
