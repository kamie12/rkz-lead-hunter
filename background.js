/* ────────────────────────────────────────────────────────────────
   RKZ Lead Hunter v2 — BACKGROUND.JS
   Maps leads → /enrich_maps (bs4 enrichment pipeline)
   Social leads → /analyze (AI pipeline)
   ──────────────────────────────────────────────────────────────── */

const keepAlive = () => setInterval(chrome.runtime.getPlatformInfo, 20000);
chrome.runtime.onStartup.addListener(keepAlive);
keepAlive();

const _sentThisSession = new Set();

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

  // ─── Route: Google Maps → /enrich_maps ───────────────────────
  if ((msg.platform || "").includes("Google Maps")) {

    chrome.storage.sync.get(["agentUrl", "webhook"], data => {
      const agentUrl = (data.agentUrl || "").trim();
      const sheetUrl = (data.webhook  || "").trim();

      if (!agentUrl || !agentUrl.startsWith("http")) {
        console.error("[RKZ] ❌ No agent URL set — go to Controls and save Agent URL");
        return;
      }

      const mapsPayload = {
        businessName: msg.posterName  || "Unknown",
        website:      msg.website     || "",
        category:     msg.category    || "",
        address:      msg.address     || "",
        reviewCount:  msg.reviewCount || "",
        profileUrl:   msg.profileUrl  || "",
        sheetUrl:     sheetUrl
      };

      console.log("[RKZ] 🗺 Maps lead → /enrich_maps:", mapsPayload.businessName);

      // ── 3 minute timeout — Qwen needs time ───────────────────
      const controller = new AbortController();
      const timeout = setTimeout(() => {
        controller.abort();
        console.warn("[RKZ] ⏱ Maps enrichment timed out after 3 min:", mapsPayload.businessName);
      }, 180000);

      fetch(agentUrl + "/enrich_maps", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(mapsPayload),
        signal:  controller.signal
      })
        .then(res => { clearTimeout(timeout); return res.json(); })
        .then(result => console.log("[RKZ] ✅ Maps enrichment done:", result.businessName, "| Type:", result.qualification_status))
        .catch(err  => {
          clearTimeout(timeout);
          console.error("[RKZ] ❌ Maps enrichment failed:", err.message);
        });
    });

    return;
  }

  // ─── Route: Social → /analyze ────────────────────────────────
  chrome.storage.sync.get(["agentUrl", "webhook"], data => {
    const agentUrl   = (data.agentUrl || "").trim();
    const webhookUrl = (data.webhook  || "").trim();

    if (!agentUrl || !agentUrl.startsWith("http")) {
      console.error("[RKZ] ❌ No agent URL set — go to Controls and save Agent URL");
      return;
    }

    const payload = {
      platform:             msg.platform,
      text:                 postText,
      source_post_platform: msg.platform,
      profile_url:          msg.profileUrl || "",
      posterName:           msg.posterName || "Unknown",
      quality:              msg.quality    || 0,
      timestamp:            new Date().toISOString()
    };

    console.log("[RKZ] Sending to AI agent:", payload.posterName, "| score:", payload.quality);

    // ── 3 minute timeout — Qwen needs time ───────────────────
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
      console.warn("[RKZ] ⏱ Social analysis timed out after 3 min:", payload.posterName);
    }, 180000);

    fetch(agentUrl + "/analyze", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
      signal:  controller.signal
    })
      .then(res => { clearTimeout(timeout); return res.json(); })
      .then(aiData => {
        const score = aiData.lead_score_1_10 || aiData.leadScore || payload.quality || 0;
        console.log(`[RKZ] ✅ Agent processed — Score: ${score}`);

        if (!webhookUrl || !webhookUrl.startsWith("http")) {
          console.log("[RKZ] ℹ No webhook URL saved — skipping Sheet write");
          return;
        }

        const sheetPayload = {
          source_post_platform:         payload.platform || aiData.source_post_platform || "Unknown",
          platform:                     payload.platform || aiData.platform             || "Unknown",
          business_name:                aiData.business_name                            || payload.posterName || "Unknown",
          owner_name_or_decision_maker: aiData.owner_name_or_decision_maker             || payload.posterName || "Unknown",
          need_summary:                 aiData.need_summary                             || "",
          lead_score_1_10:              score,
          qualification_status:         aiData.qualification_status                     || "standard",
          comment_for_post:             aiData.comment_for_post                         || "",
          email_subject:                aiData.email_subject                            || "",
          email_body:                   aiData.email_body                               || "",
          dm_message:                   aiData.dm_message                               || "",
          website_contact_message:      aiData.website_contact_message                  || "",
          notes_for_me:                 aiData.notes_for_me                             || "",
          profile_url:                  payload.profile_url                             || "",
          timestamp:                    payload.timestamp
        };

        fetch(webhookUrl, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify(sheetPayload)
        })
          .then(res => res.json())
          .then(result => console.log("[RKZ] ✅ Google Sheet updated:", result))
          .catch(err  => console.error("[RKZ] ❌ Sheet write failed:", err.message));
      })
      .catch(err => {
        clearTimeout(timeout);
        console.warn("[RKZ] ⚠ Agent not reachable:", err.message);

        if (!webhookUrl || !webhookUrl.startsWith("http")) return;

        const fallbackPayload = {
          source_post_platform:         payload.platform   || "Unknown",
          platform:                     payload.platform   || "Unknown",
          business_name:                payload.posterName || "Unknown",
          owner_name_or_decision_maker: payload.posterName || "Unknown",
          need_summary:                 postText.substring(0, 200),
          lead_score_1_10:              payload.quality    || 0,
          qualification_status:         "standard",
          comment_for_post:             "",
          email_subject:                "",
          email_body:                   "",
          dm_message:                   "",
          website_contact_message:      "",
          notes_for_me:                 "⚠ AI agent was offline — raw lead saved",
          profile_url:                  payload.profile_url || "",
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