const token = process.env.IG_ACCESS_TOKEN;
const version = process.env.IG_API_VERSION || "v25.0";
const expectedId = process.env.IG_USER_ID || "";

if (!token) throw new Error("Missing IG_ACCESS_TOKEN secret");

const url = new URL(`https://graph.instagram.com/${version}/me`);
url.searchParams.set("fields", "id,username");

const res = await fetch(url, {
  headers: { Authorization: `Bearer ${token}` },
  cache: "no-store"
});

const json = await res.json();
if (!res.ok || json.error) {
  throw new Error(`Instagram connection failed: ${JSON.stringify(json)}`);
}

if (!json.id) throw new Error("Instagram connection worked but returned no account id");
if (expectedId && String(json.id) !== String(expectedId)) {
  throw new Error(`IG_USER_ID mismatch: secret says ${expectedId}, token belongs to ${json.id}`);
}

console.log(`Instagram connection OK for @${json.username || "unknown"} (ID ${json.id})`);
console.log("No content was published by this test.");
