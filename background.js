/* ────────────────────────────────────────────────────────────────
   RKZ Lead Hunter v2 — BACKGROUND.JS (FIXED)
   Key fix: Google Sheet write now happens INSIDE the AI agent
   response, using the fully enriched data from Qwen/Ollama.
   ──────────────────────────────────────────────────────────────── */

const keepAlive = () => setInterval(chrome.runtime.getPlatformInfo, 20000);
chrome.runtime.onStartup.addListener(keepAlive);
keepAlive();

// Dedup for session
const _sentThisSession = new Set();

// Receive lead from content.js
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action !== "sendLead") return false;

  const postText = (msg.postText || "").trim();
  const EMPTY = ["", "no post text", "n/a", "none", "null", "undefined"];
  if (!postText || EMPTY.includes(postText.toLowerCase()) || postText.length < 30) {
    console.log("[RKZ] ⏭ Skipped empty/short lead from:", msg.posterName);
    return;
  }

  const dedupKey = (msg.profileUrl || "").trim() 
    ? (msg.profileUrl.trim() + postText.substring(0, 40) + (msg.platform || ""))
    : ((msg.posterName || "") + postText.substring(0, 40) + (msg.platform || ""));

  if (_sentThisSession.has(dedupKey)) {
    console.log("[RKZ] ⏭ Duplicate suppressed (session):", msg.posterName);
    return;
  }
  _sentThisSession.add(dedupKey);

  const payload = {
    platform:   msg.platform,
    postText:   postText,
    posterName: msg.posterName || "Unknown",
    profileUrl: msg.profileUrl || "",
    quality:    msg.quality    || 0,
    timestamp:  new Date().toISOString()
  };

  console.log("[RKZ] Sending to AI agent:", payload.posterName, "| score:", payload.quality);

  // Update dashboard stats
  chrome.storage.sync.get(["stats"], data => {
    const stats = data.stats || {
      total: 0, scores: [], recent: [],
      platforms: { linkedin: 0, facebook: 0, reddit: 0, instagram: 0, maps: 0 }
    };

    stats.total = (stats.total || 0) + 1;
    stats.scores = [...(stats.scores || []), msg.quality || 5].slice(-100);

    const key = (msg.platform || "").toLowerCase().replace(" groups","").replace("google maps","maps");
    const platformKeys = ["linkedin","facebook","reddit","instagram","maps"];
    const match = platformKeys.find(k => key.includes(k)) || "facebook";
    stats.platforms[match] = (stats.platforms[match] || 0) + 1;

    stats.recent = [{
      platform: (msg.platform || "").replace(" Groups",""),
      score:    msg.quality || 5,
      text:     postText.substring(0, 100),
      name:     msg.posterName || "Unknown",
      time:     Date.now()
    }, ...(stats.recent || [])].slice(0, 20);

    chrome.storage.sync.set({ stats });
  });

  // ─── Send to local AI agent ───────────────────────────────────
  // Sheet write is INSIDE this .then() so it uses enriched AI data
  fetch("http://localhost:8000/lead", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(payload)
  })
    .then(res => res.json())
    .then(aiData => {
      const score = aiData.lead_score_1_10 || aiData.leadScore || payload.quality || 0;
      console.log(`[RKZ] ✅ Agent processed — Score: ${score}`);

      // ── SEND TO GOOGLE SHEETS with enriched AI data ──────────
      chrome.storage.sync.get(["webhook"], data => {
        const webhookUrl = (data.webhook || "").trim();
        if (!webhookUrl || !webhookUrl.startsWith("http")) {
          console.log("[RKZ] ℹ No webhook URL saved — skipping Sheet write");
          return;
        }

        // Build payload using AI-enriched fields (snake_case to match Code.gs)
        const sheetPayload = {
          source_post_platform:          payload.platform || aiData.source_post_platform || "Unknown",
          platform:                      payload.platform || aiData.platform             || "Unknown",
          business_name:                 aiData.business_name                            || payload.posterName || "Unknown",
          owner_name_or_decision_maker:  aiData.owner_name_or_decision_maker             || payload.posterName || "Unknown",
          need_summary:                  aiData.need_summary                             || "",
          lead_score_1_10:               score,
          comment_for_post:              aiData.comment_for_post                         || "",
          email_subject:                 aiData.email_subject                            || "",
          email_body:                    aiData.email_body                               || "",
          dm_message:                    aiData.dm_message                               || "",
          website_contact_message:       aiData.website_contact_message                  || "",
          notes_for_me:                  aiData.notes_for_me                             || "",
          profile_url:                   payload.profileUrl                              || "",
          timestamp:                     payload.timestamp
        };

        fetch(webhookUrl, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify(sheetPayload)
        })
          .then(res => res.json())
          .then(result => {
            console.log("[RKZ] ✅ Google Sheet updated:", result);
          })
          .catch(err => {
            console.error("[RKZ] ❌ Webhook/Sheet write failed:", err.message);
          });
      });
    })
    .catch(err => {
      console.warn("[RKZ] ⚠ Agent not reachable (localhost:8000):", err.message);

      // ── FALLBACK: write raw lead to sheet if AI is down ──────
      chrome.storage.sync.get(["webhook"], data => {
        const webhookUrl = (data.webhook || "").trim();
        if (!webhookUrl || !webhookUrl.startsWith("http")) return;

        const fallbackPayload = {
          source_post_platform:         payload.platform  || "Unknown",
          platform:                     payload.platform  || "Unknown",
          business_name:                payload.posterName || "Unknown",
          owner_name_or_decision_maker: payload.posterName || "Unknown",
          need_summary:                 payload.postText.substring(0, 200),
          lead_score_1_10:              payload.quality   || 0,
          comment_for_post:             "",
          email_subject:                "",
          email_body:                   "",
          dm_message:                   "",
          website_contact_message:      "",
          notes_for_me:                 "⚠ AI agent was offline — raw lead saved",
          profile_url:                  payload.profileUrl || "",
          timestamp:                    payload.timestamp
        };

        fetch(webhookUrl, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify(fallbackPayload)
        })
          .then(res => res.json())
          .then(result => console.log("[RKZ] ✅ Fallback sheet write:", result))
          .catch(err  => console.error("[RKZ] ❌ Fallback sheet write failed:", err.message));
      });
    });
});
