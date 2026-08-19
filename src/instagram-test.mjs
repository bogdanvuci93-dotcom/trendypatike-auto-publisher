const token = process.env.IG_ACCESS_TOKEN;
const version = process.env.IG_API_VERSION || "v25.0";
const expectedId = process.env.IG_USER_ID || "";

if (!token) throw new Error("Missing IG_ACCESS_TOKEN secret");

const url = new URL(`https://graph.instagram.com/${version}/me`);
url.searchParams.set("fields", "id,user_id,username,account_type");
url.searchParams.set("access_token", token);

const res = await fetch(url, { cache: "no-store" });
let json;
try {
  json = await res.json();
} catch {
  throw new Error(`Instagram connection failed with HTTP ${res.status} and a non-JSON response`);
}

if (!res.ok || json.error) {
  const err = json.error || json;
  throw new Error(
    `Instagram connection failed (HTTP ${res.status}): ${err.message || JSON.stringify(err)}` +
    (err.code ? ` | code=${err.code}` : "") +
    (err.error_subcode ? ` | subcode=${err.error_subcode}` : "")
  );
}

const ids = [json.user_id, json.id].filter(Boolean).map(String);
if (!ids.length) {
  throw new Error(`Instagram connection worked but returned no account ID. Response keys: ${Object.keys(json).join(", ")}`);
}

if (expectedId && !ids.includes(String(expectedId))) {
  throw new Error(
    `IG_USER_ID mismatch: GitHub secret says ${expectedId}; Meta returned user_id=${json.user_id || "none"}, id=${json.id || "none"}`
  );
}

console.log(`Instagram connection OK for @${json.username || "unknown"}`);
console.log(`Account type: ${json.account_type || "not returned"}`);
console.log(`Meta user_id: ${json.user_id || "not returned"}`);
console.log(`Meta id: ${json.id || "not returned"}`);
console.log("No content was published by this test.");
