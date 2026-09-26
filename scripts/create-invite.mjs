import { createHash, randomBytes, randomUUID } from "node:crypto";

const siteUrl = process.argv[2];
const isAdmin = process.argv.includes("--admin");
if (!siteUrl || !/^https:\/\//.test(siteUrl)) {
  console.error("Usage: node scripts/create-invite.mjs https://username.github.io/project/");
  process.exit(1);
}

const token = randomBytes(32).toString("base64url");
const hash = createHash("sha256").update(token).digest("hex");
const userId = randomUUID();
const url = new URL(siteUrl);
if (isAdmin) url.pathname = url.pathname.replace(/(?:index\.html)?$/, "admin.html");
url.hash = `invite=${token}`;

console.log("1. Add this user to Cloudflare D1 with the SQL below:");
const createdAt = Date.now();
console.log(`INSERT INTO users (id, token_hash, role, reset_last_grant_at, created_at) VALUES ('${userId}', '${hash}', '${isAdmin ? "admin" : "user"}', ${createdAt}, ${createdAt});`);
console.log("\n2. Send this personal link to the user privately:");
console.log(url.toString());
console.log("\nKeep the link private. It grants access to this user's chats and daily quota.");
