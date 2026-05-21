(function () {
  const processedPosts = new Set();
  let autoScrollTimeout = null;
  let isScrolling = false;

  const MIN_SCORE = 5;

  function detectPlatform() {
    const url = window.location.href;
    if (url.includes("linkedin.com/groups")) return "LinkedIn Groups";
    if (url.includes("linkedin.com"))        return "LinkedIn";
    if (url.includes("facebook.com"))        return "Facebook Groups";
    if (url.includes("instagram.com"))       return "Instagram";
    if (url.includes("reddit.com"))          return "Reddit";
    if (url.includes("google.com/maps"))     return "Google Maps";
    return "Unknown";
  }

  function extractFacebookProfileUrl(postEl) {
    const anchors = postEl.querySelectorAll("a[href]");
    for (const a of anchors) {
      const href = a.href || "";
      if (
        href.includes("/groups/") || href.includes("/photo") || href.includes("/video") ||
        href.includes("/hashtag/") || href.includes("?__cft__") || href.includes("reaction") ||
        href.includes("/events/") || href.includes("/marketplace/") ||
        href.includes("l.facebook.com") || href === "" || href === "#"
      ) continue;
      if (
        href.match(/facebook\.com\/[a-zA-Z0-9._]+\/?$/) ||
        href.includes("facebook.com/profile.php") ||
        href.match(/facebook\.com\/people\/[^/]+\/[^/]+/)
      ) {
        return href.split("?")[0];
      }
    }
    return window.location.href.split("?")[0];
  }

  function getScrollContainer() {
    const platform = detectPlatform();
    if (platform === "LinkedIn" || platform === "LinkedIn Groups") {
      return document.querySelector("div.scaffold-layout__main")
          || document.querySelector("div[class*='scaffold-layout__main']")
          || document.scrollingElement || window;
    }
    if (platform === "Facebook Groups") {
      return document.querySelector('[role="feed"]')
          || document.querySelector('div[class*="feed"]')
          || document.querySelector('main')
          || document.scrollingElement || window;
    }
    if (platform === "Google Maps") {
      return document.querySelector('div[role="feed"]')
          || document.querySelector('.m6QErb.WsfKOd')
          || document.querySelector('.m6QErb') || window;
    }
    if (platform === "Instagram") {
      return document.querySelector('main[role="main"]')
          || document.querySelector('div._aano')
          || document.scrollingElement || window;
    }
    if (platform === "Reddit") {
      return document.querySelector('shreddit-app')
          || document.querySelector('main[id="main-content"]')
          || document.scrollingElement || window;
    }
    return window;
  }

  function scrollBy(target, amount) {
    if (!target || target === window || target === document.scrollingElement) {
      window.scrollBy({ top: amount, behavior: "smooth" });
    } else {
      target.scrollBy({ top: amount, behavior: "smooth" });
      window.scrollBy({ top: amount * 0.4, behavior: "smooth" });
    }
  }

  const INTENT_KEYWORDS = [
    "looking for", "need help", "need a", "anyone recommend", "can anyone",
    "struggling", "advice", "suggest", "hire", "want to", "how do i",
    "how to", "can someone", "recommendation", "best way", "tips for",
    "newbie", "beginner", "problem with", "issue with", "failing",
    "not working", "can't figure", "cannot", "help me", "anyone know",
    "who can", "where can", "what should", "should i", "is there a",
    "looking to", "trying to", "want help", "need advice", "confused",
    "frustrated", "anyone else", "does anyone", "has anyone", "getting clients",
    "no clients", "consistent clients", "grow my", "start my", "launch my",
    "find clients", "get more", "increase my", "improve my", "fix my",
    "build my", "scale my", "automate", "affordable", "budget", "cost",
    "price", "quote", "proposal", "freelancer", "agency", "consultant",
    "marketing agency", "web design", "seo agency", "digital marketing",
    "social media marketing", "branding agency", "content agency",
    "video production", "lead generation", "email marketing", "ecommerce",
    "shopify", "wordpress", "app development", "mobile agency"
  ];

  const SPAM_KEYWORDS = [
    "dm me for", "link in bio", "buy now", "limited offer", "flash sale",
    "discount code", "apply now", "sign up today", "register now",
    "join our team", "we are hiring", "job opening", "vacancy",
    "congratulations", "happy birthday", "rip ", "rest in peace",
    "giveaway", "contest", "win a", "follow us", "follow me",
    "check out my page", "visit my website", "click the link"
  ];

  function scorePost(text) {
    const lower = text.toLowerCase();
    for (const spam of SPAM_KEYWORDS) { if (lower.includes(spam)) return 0; }
    if (text.length < 30) return 0;
    let score = 0;
    for (const kw of INTENT_KEYWORDS) { if (lower.includes(kw)) score += 2; }
    score += (text.match(/\?/g) || []).length * 3;
    if (text.length > 200) score += 2;
    if (text.length > 400) score += 2;
    return Math.min(score, 10);
  }

  function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

  function expandSeeMore(post) {
    post.querySelectorAll('div[role="button"], span[role="button"], button').forEach(btn => {
      const t = btn.innerText?.toLowerCase().trim() || "";
      if (t === "see more" || t === "more" || t === "…more") try { btn.click(); } catch(e) {}
    });
  }

  function postCommentFacebook(postEl, commentText) {
    try {
      const commentBtn = postEl.querySelector('[aria-label*="comment"], [aria-label*="Comment"]');
      if (commentBtn) commentBtn.click();
      setTimeout(() => {
        const box = postEl.querySelector('[contenteditable="true"][aria-label*="comment"]')
                 || postEl.querySelector('[contenteditable="true"]');
        if (!box) return;
        box.focus();
        box.innerText = commentText;
        box.dispatchEvent(new InputEvent("input", { bubbles: true }));
        setTimeout(() => {
          const submit = postEl.querySelector('[aria-label="Comment"]')
                       || postEl.querySelector('div[aria-label*="Post"]');
          if (submit) submit.click();
          else box.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        }, 2000 + Math.random() * 2000);
      }, 1000);
    } catch(e) { console.log("[RKZ] FB comment error:", e.message); }
  }

  function postCommentLinkedIn(postEl, commentText) {
    try {
      const btn = postEl.querySelector('button[aria-label*="comment"], .comment-button');
      if (btn) btn.click();
      setTimeout(() => {
        const box = document.querySelector('.ql-editor[contenteditable="true"]')
                 || postEl.querySelector('[contenteditable="true"]');
        if (!box) return;
        box.focus();
        box.innerText = commentText;
        box.dispatchEvent(new InputEvent("input", { bubbles: true }));
        setTimeout(() => {
          const submit = document.querySelector('button.comments-comment-box__submit-button')
                       || document.querySelector('[data-control-name="comment.post"]');
          if (submit) submit.click();
        }, 2000 + Math.random() * 2000);
      }, 1000);
    } catch(e) { console.log("[RKZ] LI comment error:", e.message); }
  }

  function scrapeFacebook() {
    const leads = [];
    const postSelectors = ['div[role="article"]', 'div[data-pagelet="FeedUnit"]', 'div.x1yztbdb'].join(', ');
    document.querySelectorAll(postSelectors).forEach(post => {
      console.log("[RKZ] 🔎 FB article found, checking text...");
      expandSeeMore(post);
      let postText = '';
      const textSelectors = [
        'div[data-ad-comet-preview="message"]', 'div[data-ad-preview="message"]',
        '[data-testid="post_message"]', 'div[dir="auto"] span[dir="auto"]',
        'div[dir="auto"] > div > span', 'div[dir="auto"]',
      ];
      for (const sel of textSelectors) {
        const found = post.querySelector(sel);
        if (found) {
          const text = found.innerText?.trim() || '';
          if (text.length > 30 && !text.match(/^(Like|Comment|Share|more|See|...)$/i)) {
            postText = text; break;
          }
        }
      }
      if (!postText || postText.length < 30) return;
      const quality = scorePost(postText);
      if (quality < MIN_SCORE) return;
      const key = postText.substring(0, 60);
      if (processedPosts.has(key)) return;
      processedPosts.add(key);
      let posterName = 'Unknown';
      const nameSelectors = ['h2 a', 'h3 a', 'strong a', 'a[role="link"][tabindex="0"]', 'span > a[role="link"]', 'h5 a', 'h4 a'];
      for (const sel of nameSelectors) {
        const found = post.querySelector(sel);
        if (found?.innerText?.trim() && found.innerText.trim() !== 'Like') {
          posterName = found.innerText.trim(); break;
        }
      }
      const linkEl = post.querySelector("a[href*='/posts/']") || post.querySelector("a[href*='story_fbid']") || post.querySelector("a[href*='permalink']");
      const profileUrl = linkEl ? linkEl.href.split("?")[0] : window.location.href.split("?")[0];
      leads.push({ postText, posterName, profileUrl, quality, element: post });
    });
    return leads;
  }

  function scrapeLinkedIn() {
    const leads = [];
    document.querySelectorAll([
      ".feed-shared-inline-show-more-text__see-more-less-toggle",
      "button[aria-label='see more']"
    ].join(", ")).forEach(btn => { try { btn.click(); } catch(e) {} });
    document.querySelectorAll([
      ".feed-shared-update-v2", ".occludable-update", "li[data-urn]", "div[data-urn]",
    ].join(", ")).forEach(post => {
      const textEl =
        post.querySelector(".feed-shared-inline-show-more-text span[dir='ltr']") ||
        post.querySelector(".update-components-text span[dir='ltr']") ||
        post.querySelector(".feed-shared-text span[dir='ltr']") ||
        post.querySelector(".update-components-text") ||
        post.querySelector(".feed-shared-text");
      const postText = textEl ? textEl.innerText.trim() : "";
      if (!postText) return;
      const quality = scorePost(postText);
      if (quality < MIN_SCORE) return;
      const key = postText.substring(0, 60);
      if (processedPosts.has(key)) return;
      processedPosts.add(key);
      const nameEl =
        post.querySelector(".feed-shared-actor__name") ||
        post.querySelector(".update-components-actor__name") ||
        post.querySelector("span.hoverable-link-text span[aria-hidden='true']");
      const linkEl =
        post.querySelector(".feed-shared-actor__container-link") ||
        post.querySelector(".update-components-actor__container-link") ||
        post.querySelector("a[href*='/in/']") ||
        post.querySelector("a[href*='/company/']");
      const profileUrl = linkEl ? linkEl.href.split("?")[0] : window.location.href.split("?")[0];
      leads.push({ postText, posterName: nameEl ? nameEl.innerText.trim() : "Unknown", profileUrl, quality, element: post });
    });
    return leads;
  }

  function scrapeLinkedInGroups() {
    const leads = [];
    document.querySelectorAll([
      ".feed-shared-inline-show-more-text__see-more-less-toggle",
      "button[aria-label='see more']"
    ].join(", ")).forEach(btn => { try { btn.click(); } catch(e) {} });
    const seenUrns = new Set();
    const postEls  = [];
    document.querySelectorAll("[data-urn]").forEach(el => {
      const urn = el.getAttribute("data-urn") || "";
      if (!urn.startsWith("urn:li:activity") && !urn.startsWith("urn:li:ugcPost") && !urn.startsWith("urn:li:share")) return;
      if (el.parentElement && el.parentElement.closest("[data-urn]")) return;
      if (seenUrns.has(urn)) return;
      seenUrns.add(urn); postEls.push(el);
    });
    postEls.forEach(post => {
      let postText = "";
      for (const sel of [
        ".feed-shared-inline-show-more-text span[dir='ltr']",
        ".update-components-text span[dir='ltr']",
        ".feed-shared-text span[dir='ltr']",
        ".update-components-text", ".feed-shared-text",
      ]) {
        const el = post.querySelector(sel);
        if (el && el.innerText.trim().length >= 30) { postText = el.innerText.trim(); break; }
      }
      if (!postText) return;
      const quality = scorePost(postText);
      if (quality < MIN_SCORE) return;
      const key = postText.substring(0, 60);
      if (processedPosts.has(key)) return;
      processedPosts.add(key);
      const nameEl =
        post.querySelector(".feed-shared-actor__name span[aria-hidden='true']") ||
        post.querySelector(".update-components-actor__name span[aria-hidden='true']") ||
        post.querySelector("span.hoverable-link-text span[aria-hidden='true']");
      const linkEl =
        post.querySelector("a[href*='/in/']") ||
        post.querySelector("a[href*='/company/']") ||
        post.querySelector(".feed-shared-actor__container-link");
      const profileUrl = linkEl ? linkEl.href.split("?")[0] : window.location.href.split("?")[0];
      leads.push({ postText, posterName: nameEl ? nameEl.innerText.trim() : "Unknown", profileUrl, quality, element: post });
    });
    return leads;
  }

  function scrapeInstagram() {
    const leads = [];
    document.querySelectorAll(["article", "div._aabd._aa8k._aanf"].join(", ")).forEach(post => {
      const textEl =
        post.querySelector("div._a9zs h1") || post.querySelector("div._a9zr span") ||
        post.querySelector("h1._ap3a") ||
        post.querySelector("span._ap3a._aaco._aacu._aacx._aad7._aade") || post.querySelector("h1");
      const postText = textEl ? textEl.innerText.trim() : "";
      if (!postText) return;
      const quality = scorePost(postText);
      if (quality < MIN_SCORE) return;
      const key = postText.substring(0, 60);
      if (processedPosts.has(key)) return;
      processedPosts.add(key);
      const nameEl =
        post.querySelector("header a.x1i10hfl") ||
        post.querySelector("header a[role='link']") ||
        post.querySelector("header a");
      const profileUrl = nameEl ? nameEl.href.split("?")[0] : window.location.href.split("?")[0];
      leads.push({ postText, posterName: nameEl ? nameEl.innerText.trim() : "Unknown", profileUrl, quality, element: post });
    });
    return leads;
  }

  function scrapeReddit() {
    const leads = [];
    document.querySelectorAll([
      "shreddit-post", "article[data-testid='post-container']",
      "[data-testid='post-container']", ".Post", "div[data-fullname]",
    ].join(", ")).forEach(post => {
      const titleEl =
        post.querySelector("[slot='title']") || post.querySelector("a[slot='full-post-link']") ||
        post.querySelector("h3") || post.querySelector("h1");
      const bodyEl =
        post.querySelector("[data-click-id='text'] p") ||
        post.querySelector("div[slot='text-body'] p");
      const postText = [titleEl?.innerText?.trim(), bodyEl?.innerText?.trim()].filter(Boolean).join(" — ");
      if (!postText) return;
      const quality = scorePost(postText);
      if (quality < MIN_SCORE) return;
      const key = postText.substring(0, 60);
      if (processedPosts.has(key)) return;
      processedPosts.add(key);
      const authorEl =
        post.querySelector("a[href*='/user/']") ||
        post.querySelector("[data-testid='post_author_link']") ||
        post.querySelector("span[slot='authorName']");
      let profileUrl = "";
      if (authorEl?.href) {
        profileUrl = authorEl.href.split("?")[0];
      } else if (authorEl?.innerText) {
        profileUrl = `https://www.reddit.com/user/${authorEl.innerText.trim().replace("u/", "")}`;
      } else {
        profileUrl = window.location.href.split("?")[0];
      }
      leads.push({ postText, posterName: authorEl ? authorEl.innerText.trim() : "Unknown", profileUrl, quality, element: post });
    });
    return leads;
  }

  function extractReviewCount(listing) {
    const ratingEl = listing.querySelector("span[aria-label*='star'], span[aria-label*='review']");
    if (ratingEl) {
      const ariaLabel = ratingEl.getAttribute("aria-label") || "";
      const match = ariaLabel.match(/(\d[\d,]*)\s*review/i);
      if (match) return parseInt(match[1].replace(/,/g, ""), 10);
    }
    const reviewEl = listing.querySelector(".UY7F9, .MW4etd");
    if (reviewEl) {
      const txt = reviewEl.innerText.replace(/[(),\s]/g, "");
      const num = parseInt(txt);
      if (!isNaN(num) && num > 0) return num;
    }
    return 0;
  }

  function extractWebsiteFromListing(listing) {
    const websiteEl =
      listing.querySelector("a[data-value='Website']") ||
      listing.querySelector("a[aria-label*='website' i]") ||
      listing.querySelector("a[aria-label*='Visit' i]");
    return websiteEl ? websiteEl.href : "";
  }

  // ─── FIX: filter out rating/number-only spans before picking category ─────
  function extractCategoryAndAddress(listing) {
    const spans = listing.querySelectorAll(".W4Efsd span, .fontBodyMedium span");
    let category = "";
    let address  = "";
    const spanTexts = Array.from(spans)
      .map(s => s.innerText?.trim())
      .filter(t =>
        t &&
        t !== "·" &&
        t.length > 2 &&
        !/^[\d\s\.\(\),★·]+$/.test(t)
      );
    if (spanTexts.length > 0) category = spanTexts[0];
    for (const t of spanTexts) {
      if (/\d/.test(t) && t.length > 5) { address = t; break; }
    }
    return { category, address };
  }

  function scrapeGoogleMaps() {
    const leads = [];
    document.querySelectorAll('div[role="feed"] > div, .Nv2PK, [data-result-index]').forEach(listing => {
      const nameEl = listing.querySelector(".qBF1Pd, .fontHeadlineSmall, h3");
      const descEl = listing.querySelector(".W4Efsd, .fontBodyMedium");
      const postText = [nameEl?.innerText?.trim(), descEl?.innerText?.trim()].filter(Boolean).join(" — ");
      if (!postText || postText.length < 30) return;
      const quality = scorePost(postText);
      if (quality < MIN_SCORE) return;
      const key = postText.substring(0, 60);
      if (processedPosts.has(key)) return;
      processedPosts.add(key);
      const linkEl = listing.querySelector("a[href*='/maps/place']")
                  || listing.querySelector("a[href*='google.com/maps']")
                  || listing.querySelector("a[href]");
      const profileUrl = linkEl ? linkEl.href : window.location.href;
      const reviewCount = extractReviewCount(listing);
      const website     = extractWebsiteFromListing(listing);
      const { category, address } = extractCategoryAndAddress(listing);
      console.log(`[RKZ] ✅ Maps Lead | ${nameEl?.innerText?.trim()} | Cat: ${category} | Addr: ${address} | Reviews: ${reviewCount}`);
      leads.push({ postText, posterName: nameEl ? nameEl.innerText.trim() : "Unknown", profileUrl, quality, element: listing, reviewCount, website, category, address });
    });
    document.querySelectorAll(".jftiEf, [data-review-id]").forEach(review => {
      const textEl = review.querySelector(".wiI7pd") || review.querySelector(".MyEned span");
      const postText = textEl ? textEl.innerText.trim() : "";
      if (!postText) return;
      const quality = scorePost(postText);
      if (quality < MIN_SCORE) return;
      const key = postText.substring(0, 60);
      if (processedPosts.has(key)) return;
      processedPosts.add(key);
      const nameEl = review.querySelector(".d4r55") || review.querySelector(".TSUbDb");
      leads.push({ postText, posterName: nameEl ? nameEl.innerText.trim() : "Unknown", profileUrl: window.location.href.split("?")[0], quality, element: review, reviewCount: 0, website: "", category: "", address: "" });
    });
    return leads;
  }

  function scrapeAndSend() {
    const platform = detectPlatform();
    let leads = [];
    switch (platform) {
      case "Facebook Groups":  leads = scrapeFacebook();       break;
      case "LinkedIn":         leads = scrapeLinkedIn();       break;
      case "LinkedIn Groups":  leads = scrapeLinkedInGroups(); break;
      case "Instagram":        leads = scrapeInstagram();      break;
      case "Reddit":           leads = scrapeReddit();         break;
      case "Google Maps":      leads = scrapeGoogleMaps();     break;
      default:
        console.log("[RKZ] Unsupported page:", window.location.href);
        return 0;
    }
    leads.sort((a, b) => b.quality - a.quality);
    if (leads.length > 0) console.log(`[RKZ] 🚀 Sending ${leads.length} lead(s) from ${platform}`);
    leads.forEach(lead => {
      chrome.runtime.sendMessage({
        action:      "sendLead",
        platform,
        postText:    lead.postText,
        posterName:  lead.posterName,
        profileUrl:  lead.profileUrl,
        quality:     lead.quality,
        reviewCount: lead.reviewCount || 0,
        website:     lead.website     || "",
        category:    lead.category    || "",
        address:     lead.address     || ""
      });
    });
    return leads.length;
  }

  function startAutoScroll() {
    if (isScrolling) return;
    isScrolling = true;
    console.log("[RKZ] ▶ Auto-scroll started");
    function humanScroll() {
      if (!isScrolling) return;
      const container = getScrollContainer();
      const amt = rand(300, 800);
      if (Math.random() < 0.2) {
        scrollBy(container, -rand(50, 150));
        setTimeout(() => scrollBy(container, amt), rand(400, 800));
      } else {
        scrollBy(container, amt);
      }
      setTimeout(() => { if (isScrolling) scrapeAndSend(); }, rand(2000, 3500));
      if (isScrolling) autoScrollTimeout = setTimeout(humanScroll, rand(4000, 9000));
    }
    autoScrollTimeout = setTimeout(humanScroll, rand(1000, 2500));
  }

  function stopAutoScroll() {
    isScrolling = false;
    if (autoScrollTimeout) { clearTimeout(autoScrollTimeout); autoScrollTimeout = null; }
    console.log("[RKZ] ⏹ Auto-scroll stopped");
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "startScroll") {
      startAutoScroll(); sendResponse({ success: true }); return true;
    }
    if (msg.action === "extract") {
      setTimeout(() => {
        const count = scrapeAndSend();
        chrome.storage.sync.get(["autoscroll"], data => {
          if (data.autoscroll) startAutoScroll();
        });
        sendResponse({ success: true, count });
      }, 800);
      return true;
    }
    if (msg.action === "stopScroll") {
      stopAutoScroll(); sendResponse({ success: true }); return true;
    }
    if (msg.action === "postComment") {
      const { commentText, profileUrl } = msg;
      const platform = detectPlatform();
      const delay = 3000 + Math.random() * 5000;
      if (platform === "Facebook Groups") {
        const posts = document.querySelectorAll('div[role="article"]');
        let target = null;
        posts.forEach(p => { if (p.querySelector(`a[href*="${profileUrl}"]`)) target = p; });
        if (!target && posts.length) target = posts[0];
        if (target) {
          setTimeout(() => postCommentFacebook(target, commentText), delay);
          sendResponse({ success: true, delay: Math.round(delay / 1000) });
        } else {
          sendResponse({ success: false, reason: "Post not found" });
        }
      } else if (platform === "LinkedIn" || platform === "LinkedIn Groups") {
        const posts = document.querySelectorAll(".feed-shared-update-v2, .occludable-update, div[data-urn]");
        if (posts[0]) {
          setTimeout(() => postCommentLinkedIn(posts[0], commentText), delay);
          sendResponse({ success: true, delay: Math.round(delay / 1000) });
        } else {
          sendResponse({ success: false, reason: "Post not found" });
        }
      } else {
        sendResponse({ success: false, reason: `Not supported on ${platform}` });
      }
      return true;
    }
  });

})();
