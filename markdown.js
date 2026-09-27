import MarkdownIt from "./vendor/markdown-it.js";

const markdown = new MarkdownIt({ html: false, linkify: true, breaks: true, typographer: true });

// Model output is untrusted. Display image syntax as text and allow web links only.
markdown.renderer.rules.image = (tokens, index) => markdown.utils.escapeHtml(tokens[index].content);
markdown.validateLink = (url) => /^https?:\/\//i.test(url);

export function renderMarkdown(value) {
  return markdown.render(String(value || ""));
}
