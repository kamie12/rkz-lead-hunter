document.addEventListener("DOMContentLoaded", () => {

  const agentUrlInput   = document.getElementById("agentUrl");
  const webhookInput    = document.getElementById("webhook");
  const autoScrollInput = document.getElementById("autoscroll");
  const saveBtn         = document.getElementById("save");
  const sendBtn         = document.getElementById("send");
  const stopBtn         = document.getElementById("stopScroll");
  const clearBtn        = document.getElementById("clearStats");
  const findGroupsBtn   = document.getElementById("findGroups");
  const statusEl        = document.getElementById("status");
  const groupStatusEl   = document.getElementById("groupStatus");
  const scrollDot       = document.getElementById("scrollDot");
  const scrollStatusEl  = document.getElementById("scrollStatus");

  const totalLeadsEl   = document.getElementById("totalLeads");
  const sessionLeadsEl = document.getElementById("sessionLeads");
  const avgScoreEl     = document.getElementById("avgScore");
  const topScoreEl     = document.getElementById("topScore");
  const recentListEl   = document.getElementById("recentList");

  const platformKeys = ["linkedin", "facebook", "reddit", "instagram", "maps"];

  const SUPPORTED = [
    "facebook.com",
    "linkedin.com",
    "instagram.com",
    "reddit.com",
    "google.com/maps"
  ];

  function isSupportedUrl(url) {
    return SUPPORTED.some(s => url.includes(s));
  }

  let sessionLeadCount = 0;
  let isScrolling = false;

  // ── Tab switching ──────────────────────────────────────────────────────
  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById("tab-" + tab.dataset.tab).classList.add("active");
    });
  });

  // ── Group keywords ─────────────────────────────────────────────────────────
  const GROUP_KEYWORDS = {
    usa:       ["small business owners USA","entrepreneurs USA help","need a website USA","SEO help small business USA","digital marketing help USA"],
    uk:        ["small business owners UK","entrepreneurs UK help","need a website UK","SEO help UK small business","digital marketing UK help"],
    canada:    ["small business owners Canada","entrepreneurs Canada help","need a website Canada","SEO help Canada","digital marketing Canada"],
    australia: ["small business owners Australia","entrepreneurs Australia help","need a website Australia","SEO help Australia","digital marketing Australia"],
    singapore: ["small business Singapore","startup founders Singapore","digital marketing Singapore","SEO Singapore help","ecommerce Singapore help"],
    malaysia:  ["small business Malaysia","startup founders Malaysia","digital marketing Malaysia","SEO Malaysia help","website help Malaysia"]
  };

  let selectedRegion = "usa";

  // ── Load saved settings ────────────────────────────────────────────────
  chrome.storage.sync.get(["agentUrl", "webhook", "autoscroll", "stats"], data => {
    if (data.agentUrl)             agentUrlInput.value     = data.agentUrl;
    if (data.webhook)              webhookInput.value      = data.webhook;
    if (data.autoscroll !== undefined) autoScrollInput.checked = data.autoscroll;
    renderStats(data.stats || defaultStats());
  });

  // Auto-save agentUrl as user types
  let agentSaveTimer = null;
  agentUrlInput.addEventListener("input", () => {
    clearTimeout(agentSaveTimer);
    agentUrlInput.style.borderColor = "var(--muted)";
    agentSaveTimer = setTimeout(() => {
      const url = agentUrlInput.value.trim();
      chrome.storage.sync.set({ agentUrl: url }, () => {
        if (chrome.runtime.lastError) return;
        agentUrlInput.style.borderColor = "var(--green)";
        setTimeout(() => { agentUrlInput.style.borderColor = ""; }, 1200);
      });
    }, 800);
  });

  // Auto-save webhook URL as user types
  let webhookSaveTimer = null;
  webhookInput.addEventListener("input", () => {
    clearTimeout(webhookSaveTimer);
    webhookInput.style.borderColor = "var(--muted)";
    webhookSaveTimer = setTimeout(() => {
      const url = webhookInput.value.trim();
      chrome.storage.sync.set({ webhook: url }, () => {
        if (chrome.runtime.lastError) return;
        webhookInput.style.borderColor = "var(--green)";
        setTimeout(() => { webhookInput.style.borderColor = ""; }, 1200);
      });
    }, 800);
  });

  function defaultStats() {
    return {
      total: 0,
      scores: [],
      platforms: { linkedin: 0, facebook: 0, reddit: 0, instagram: 0, maps: 0 },
      recent: []
    };
  }

  function renderStats(stats) {
    totalLeadsEl.textContent   = stats.total || 0;
    sessionLeadsEl.textContent = sessionLeadCount;

    const scores = stats.scores || [];
    if (scores.length) {
      avgScoreEl.textContent = (scores.reduce((a,b) => a+b, 0) / scores.length).toFixed(1);
      topScoreEl.textContent = Math.max(...scores);
    } else {
      avgScoreEl.textContent = "—";
      topScoreEl.textContent = "—";
    }

    const platforms = stats.platforms || {};
    const maxCount = Math.max(...Object.values(platforms), 1);
    platformKeys.forEach(key => {
      const count = platforms[key] || 0;
      const pct = Math.round((count / maxCount) * 100);
      const bar = document.getElementById("bar-" + key);
      const cnt = document.getElementById("cnt-" + key);
      if (bar) bar.style.width = pct + "%";
      if (cnt) cnt.textContent = count;
    });

    const recent = (stats.recent || []).slice(0, 5);
    if (recent.length === 0) {
      recentListEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📭</div>
          No leads yet — go scan a page
        </div>`;
    } else {
      recentListEl.innerHTML = recent.map(lead => {
        const scoreClass = lead.score >= 7 ? "score-high" : lead.score >= 5 ? "score-mid" : "score-low";
        return `
          <div class="lead-item">
            <div class="lead-top">
              <span class="lead-platform">${lead.platform || "?"}</span>
              <span class="lead-score ${scoreClass}">${lead.score}/10</span>
            </div>
            <div class="lead-text">${lead.text || ""}</div>
            <div class="lead-name">👤 ${lead.name || "Unknown"}</div>
          </div>`;
      }).join("");
    }
  }

  function recordLead(platform, score, text, name) {
    chrome.storage.sync.get(["stats"], data => {
      const stats = data.stats || defaultStats();
      stats.total = (stats.total || 0) + 1;
      stats.scores = [...(stats.scores || []), score].slice(-100);

      const key = platform.toLowerCase().replace(" groups","").replace("google maps","maps");
      const match = platformKeys.find(k => key.includes(k)) || "facebook";
      stats.platforms[match] = (stats.platforms[match] || 0) + 1;

      stats.recent = [{
        platform: platform.replace(" Groups",""),
        score,
        text: (text || "").substring(0, 100),
        name: name || "Unknown",
        time: Date.now()
      }, ...(stats.recent || [])].slice(0, 20);

      chrome.storage.sync.set({ stats }, () => renderStats(stats));
    });
  }

  // ── Region selector ────────────────────────────────────────────────────────
  document.querySelectorAll(".region-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".region-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      selectedRegion = btn.dataset.region;
    });
  });

  findGroupsBtn.addEventListener("click", () => {
    const keywords = GROUP_KEYWORDS[selectedRegion] || [];
    if (!keywords.length) return;
    groupStatusEl.textContent = "Opening searches...";
    groupStatusEl.style.color = "var(--green)";
    keywords.slice(0, 3).forEach((kw, i) => {
      setTimeout(() => {
        chrome.tabs.create({ url: `https://www.facebook.com/groups/search/?q=${encodeURIComponent(kw)}`, active: i === 0 });
      }, i * 800);
    });
    setTimeout(() => {
      groupStatusEl.textContent = `✓ Opened 3 searches for ${selectedRegion.toUpperCase()}`;
    }, 2500);
  });

  // ── Save button ────────────────────────────────────────────────────────────
  saveBtn.addEventListener("click", () => {
    chrome.storage.sync.set({
      agentUrl:   agentUrlInput.value.trim(),
      webhook:    webhookInput.value.trim(),
      autoscroll: autoScrollInput.checked
    }, () => {
      if (chrome.runtime.lastError) {
        setStatus("❌ Save failed", "error");
        return;
      }
      const orig = saveBtn.textContent;
      saveBtn.textContent = "✓ Saved!";
      setStatus("Settings saved", "success");
      setTimeout(() => { saveBtn.textContent = orig; clearStatus(); }, 1500);
    });
  });

  // ── Send / Extract button ──────────────────────────────────────────────────
  sendBtn.addEventListener("click", () => {
    setStatus("Scanning page...", "");

    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      const tab = tabs[0];

      if (!isSupportedUrl(tab.url || "")) {
        setStatus("❌ Not on a supported page", "error");
        return;
      }

      chrome.scripting.executeScript(
        { target: { tabId: tab.id }, files: ["content.js"] },
        () => {
          setTimeout(() => {
            chrome.tabs.sendMessage(tab.id, { action: "extract" }, res => {
              if (chrome.runtime.lastError) {
                setStatus("❌ Could not scan page — try refreshing", "error");
                return;
              }
              if (res && res.count !== undefined) {
                sessionLeadCount += res.count;
                sessionLeadsEl.textContent = sessionLeadCount;

                if (res.count > 0) {
                  setStatus(`✅ Found ${res.count} lead(s)!${autoScrollInput.checked ? " Scrolling..." : ""}`, "success");
                  if (autoScrollInput.checked) {
                    chrome.tabs.sendMessage(tab.id, { action: "startScroll" }, () => {
                      setScrolling(true);
                    });
                  }
                } else {
                  setStatus("⏭ Scrolling to find leads...", "");
                  if (autoScrollInput.checked) {
                    chrome.tabs.sendMessage(tab.id, { action: "startScroll" }, () => {
                      setScrolling(true);
                    });
                  }
                }

                chrome.storage.sync.get(["stats"], data => {
                  renderStats(data.stats || defaultStats());
                });
              }
            });
          }, 500);
        }
      );
    });
  });

  // ── Stop button ────────────────────────────────────────────────────────────
  stopBtn.addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      chrome.tabs.sendMessage(tabs[0].id, { action: "stopScroll" }, res => {
        if (chrome.runtime.lastError) {
          setStatus("❌ Could not stop", "error");
          return;
        }
        setScrolling(false);
        setStatus("⏹ Scroll stopped", "");
      });
    });
  });

  autoScrollInput.addEventListener("change", () => {
    if (!autoScrollInput.checked && isScrolling) {
      chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        chrome.tabs.sendMessage(tabs[0].id, { action: "stopScroll" }, () => {
          setScrolling(false);
        });
      });
    }
  });

  document.getElementById("openDashboard").addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
  });

  clearBtn.addEventListener("click", () => {
    chrome.storage.sync.set({ stats: defaultStats() }, () => {
      sessionLeadCount = 0;
      renderStats(defaultStats());
      setStatus("Stats cleared", "");
      setTimeout(clearStatus, 1500);
    });
  });

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.stats) renderStats(changes.stats.newValue || defaultStats());
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "leadRecorded") {
      recordLead(msg.platform, msg.quality || 5, msg.postText, msg.posterName);
    }
  });

  function setScrolling(active) {
    isScrolling = active;
    if (active) {
      scrollDot.classList.add("active");
      scrollStatusEl.textContent = "Auto-scroll: active";
      stopBtn.style.display = "block";
    } else {
      scrollDot.classList.remove("active");
      scrollStatusEl.textContent = "Auto-scroll: inactive";
      stopBtn.style.display = "none";
    }
  }

  function setStatus(msg, type) {
    statusEl.textContent = msg;
    statusEl.className   = type;
  }

  function clearStatus() {
    statusEl.textContent = "";
    statusEl.className   = "";
  }

});