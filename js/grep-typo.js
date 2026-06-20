(function () {
  "use strict";

  var USER = window.GREP_TYPO || {};

  var cfg = {
    root: USER.root || "body", // 적용 시작 지점
    exclude: USER.exclude || "[data-no-typo]", // 제외할 선택자
    observe: USER.observe !== false, // 동적 콘텐츠 감시 (기본 on)
    injectCSS: USER.injectCSS !== false, // 폰트 CSS 자동 주입(기본 on)
    applyBase: USER.applyBase !== false, // 기본 문자 서식 적용(기본 on)
    base: Object.assign(
      {
        target: "body",
        fontFamily: "'Arario', sans-serif",
        fontSize: null,
        lineHeight: null,
        letterSpacing: null,
        ligatures: true, // 합자
        kerning: true, // 커닝: 메트릭
      },
      USER.base,
    ),
    fonts: Object.assign(
      {
        ka: "'제주명조', serif",
        kb: "'성동명조', sans-serif",
        ea: "filosofia-unicase, serif",
        eb: "panoptica, serif",
        dash: "inherit",
        na: "cormorant-unicase, sans-serif",
        nb: "loretta-display, serif",
      },
      USER.fonts,
    ),
    weights: Object.assign(
      {
        ka: null,
        kb: null,
        ea: null,
        eb: null,
        dash: null,
        na: "500",
        nb: "400",
      },
      USER.weights,
    ),
    sizes: Object.assign(
      {
        ka: "90%",
        kb: "96%",
        ea: "70%",
        eb: "100%",
        dash: "100%",
        na: "108%",
        nb: "104%",
      },
      USER.sizes,
    ),
    baselines: Object.assign(
      {
        ka: "0px",
        kb: "-1px",
        ea: "0px",
        eb: "0px",
        dash: "-1.5px",
        na: "0px",
        nb: "0px",
      },
      USER.baselines,
    ),
    letterSpacings: Object.assign(
      {
        ka: null,
        kb: null,
        ea: "0.086em",
        eb: null,
        dash: null,
        na: null,
        nb: null,
      },
      USER.letterSpacings,
    ),
    obliqueLetterSpacings: Object.assign(
      {
        ka: null,
        kb: null,
        ea: "0.15em",
        eb: "0.0em",
        dash: null,
        na: null,
        nb: null,
      },
      USER.obliqueLetterSpacings,
    ),
    faces:
      USER.faces !== undefined
        ? USER.faces
        : [
            {
              family: "'Arario'",
              src: "url('font/Arario Regular.otf') format('opentype')",
            },
            {
              family: "'제주명조'",
              src: "url('font/JejuMyeongjoOTF.otf') format('opentype')",
            },
            {
              family: "'성동명조'",
              src: "url('font/seongdong.woff2') format('woff2')",
            },
          ],
    extraCSS: USER.extraCSS || "",
    cssLinks:
      USER.cssLinks !== undefined
        ? USER.cssLinks
        : ["https://use.typekit.net/ehy1lya.css", "style.css"],
  };

  var reHangul = /[\uAC00-\uD7A3]/;
  var reLatin = /[A-Za-zÀ-ɏ]/; // 기본 라틴 + 악센트(é à ü ñ 등)
  var reDash = /[\u2014\u2013:;\u002D]/; // — – : ; -
  var reHspace = /[ \t]/; // \h
  var reNum = /[0-9]/;

  /* ---- CSS 주입 ---- */
  function injectStyle() {
    var f = cfg.fonts,
      wt = cfg.weights,
      sz = cfg.sizes,
      bl = cfg.baselines,
      ls = cfg.letterSpacings,
      ols = cfg.obliqueLetterSpacings;
    var css = "";
    cfg.faces.forEach(function (face) {
      css +=
        "@font-face{font-family:" +
        face.family +
        ";src:" +
        face.src +
        ";font-weight:normal;font-style:normal;}";
    });
    ["ka", "kb", "ea", "eb", "dash", "na", "nb"].forEach(function (k) {
      var rule =
        ".gt-" +
        k +
        "{font-family:" +
        f[k] +
        ";font-size:" +
        sz[k] +
        ";vertical-align:" +
        bl[k];
      if (wt[k]) rule += ";font-weight:" + wt[k];
      if (ls[k]) rule += ";letter-spacing:" + ls[k];
      css += rule + "}";
    });
    Object.keys(ols).forEach(function (k) {
      if (ols[k]) css += "i .gt-" + k + "{letter-spacing:" + ols[k] + "}";
    });

    if (cfg.applyBase) {
      var b = cfg.base,
        d = "font-family:" + b.fontFamily + ";";
      if (b.fontSize) d += "font-size:" + b.fontSize + ";";
      if (b.lineHeight) d += "line-height:" + b.lineHeight + ";";
      if (b.letterSpacing) d += "letter-spacing:" + b.letterSpacing + ";";
      if (b.kerning) d += "font-kerning:normal;";
      if (b.ligatures) d += "font-variant-ligatures:common-ligatures;";
      d +=
        "-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;";
      css += b.target + "{" + d + "}";
    }
    if (cfg.extraCSS) css += cfg.extraCSS;

    var el = document.createElement("style");
    el.setAttribute("data-gt-style", "");
    el.textContent = css;
    document.head.appendChild(el);
  }

  /* ---- 텍스트 노드 1개를 글자 단위 span 으로 ---- */
  function wrapText(node) {
    var text = node.nodeValue;
    if (!text) return;

    var frag = document.createDocumentFragment();
    var runScript = null; // 현재 run 종류: 'k' | 'e' | null
    var idx = 0; // run 내 인덱스 (교대용)
    var curCls = null,
      buf = "";

    function flush() {
      if (!buf) return;
      if (curCls) {
        var s = document.createElement("span");
        s.className = curCls;
        s.setAttribute("data-gt", ""); // 재처리 방지 마커
        s.textContent = buf;
        frag.appendChild(s);
      } else {
        frag.appendChild(document.createTextNode(buf));
      }
      buf = "";
    }

    var chars = Array.from(text); // 서로게이트/이모지 안전
    for (var i = 0; i < chars.length; i++) {
      var ch = chars[i],
        cls = null;

      if (reHangul.test(ch)) {
        if (runScript !== "k") {
          runScript = "k";
          idx = 0;
        } // 종류 바뀌면 A부터
        cls = idx % 2 === 0 ? "gt-ka" : "gt-kb"; // 짝수→A, 홀수→B
        idx++;
      } else if (reLatin.test(ch)) {
        if (runScript !== "e") {
          runScript = "e";
          idx = 0;
        }
        cls = idx % 2 === 0 ? "gt-ea" : "gt-eb";
        idx++;
      } else if (reDash.test(ch)) {
        cls = "gt-dash";
        runScript = null;
        idx = 0; // run 리셋
      } else if (reNum.test(ch)) {
        if (runScript !== "n") {
          runScript = "n";
          idx = 0;
        }
        cls = idx % 2 === 0 ? "gt-na" : "gt-nb";
        idx++;
      } else if (reHspace.test(ch)) {
        cls = null; // 공백: 교대 유지
      } else {
        cls = null;
        runScript = null;
        idx = 0; // 그 외: 리셋
      }

      if (cls !== curCls) {
        flush();
        curCls = cls;
      }
      buf += ch;
    }
    flush();
    node.parentNode.replaceChild(frag, node);
  }

  /* ---- 건너뛸 노드 판별 ---- */
  function shouldSkip(parent) {
    if (!parent) return true;
    var t = parent.nodeName;
    if (t === "SCRIPT" || t === "STYLE" || t === "TEXTAREA" || t === "NOSCRIPT")
      return true;
    if (parent.closest) {
      if (parent.closest("[data-gt]")) return true; // 이미 처리됨
      if (cfg.exclude && parent.closest(cfg.exclude)) return true;
    }
    return false;
  }

  /* ---- 범위 내 모든 텍스트 노드 적용 ---- */
  function apply(root) {
    root = root || document.querySelector(cfg.root) || document.body;
    if (!root) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (shouldSkip(n.parentNode)) return NodeFilter.FILTER_REJECT;
        return n.nodeValue && n.nodeValue.trim()
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      },
    });
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode); // 수집 후 변형
    for (var i = 0; i < nodes.length; i++) wrapText(nodes[i]);
  }

  /* ---- 시작 ---- */
  var observer = null;
  function start() {
    cfg.cssLinks.forEach(function (href) {
      var l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = href;
      document.head.appendChild(l);
    });
    if (cfg.injectCSS) injectStyle();
    apply();

    if (cfg.observe) {
      observer = new MutationObserver(function (muts) {
        observer.disconnect(); // 자기 변경 무시
        for (var i = 0; i < muts.length; i++) {
          var added = muts[i].addedNodes;
          for (var j = 0; j < added.length; j++) {
            var n = added[j];
            if (n.nodeType === 1) apply(n);
            else if (n.nodeType === 3 && !shouldSkip(n.parentNode)) wrapText(n);
          }
        }
        observer.observe(document.body, { childList: true, subtree: true });
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  // 외부에서 재실행/설정 접근용
  window.GrepTypo = { apply: apply, config: cfg };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
