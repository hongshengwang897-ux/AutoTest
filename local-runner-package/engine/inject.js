/**
 * Injection script injected into the target page via Playwright.
 * Creates a floating "识别" button and scans DOM on click.
 * The report URL is patched in at injection time.
 */
export function buildInjectionScript(reportEndpoint) {
    return `
(function() {
  if (window.__autoDetectInjected) return;
  window.__autoDetectInjected = true;

  const REPORT_URL = ${JSON.stringify(reportEndpoint)};

  /* ---- Floating Button ---- */
  const btn = document.createElement('div');
  btn.id = '__autoDetectBtn';
  btn.innerHTML = '<span style="font-size:18px;margin-right:6px;">🔍</span>识别元素';
  btn.style.cssText = [
    'position:fixed',
    'bottom:24px',
    'right:24px',
    'z-index:2147483647',
    'display:flex',
    'align-items:center',
    'padding:12px 20px',
    'background:linear-gradient(135deg, #3B82F6, #8B5CF6)',
    'color:#fff',
    'border:none',
    'border-radius:28px',
    'font-size:15px',
    'font-weight:600',
    'font-family:"PingFang SC","Microsoft YaHei",sans-serif',
    'cursor:pointer',
    'box-shadow:0 4px 16px rgba(59,130,246,0.45)',
    'transition:transform 0.2s, box-shadow 0.2s',
    'user-select:none',
    'letter-spacing:0.5px',
  ].join(';');
  btn.onmouseenter = function() {
    btn.style.transform = 'translateY(-2px)';
    btn.style.boxShadow = '0 6px 24px rgba(59,130,246,0.55)';
  };
  btn.onmouseleave = function() {
    btn.style.transform = 'translateY(0)';
    btn.style.boxShadow = '0 4px 16px rgba(59,130,246,0.45)';
  };

  /* ---- Toast ---- */
  function showToast(msg, isOk) {
    var t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = [
      'position:fixed',
      'top:20px',
      'left:50%',
      'transform:translateX(-50%)',
      'z-index:2147483647',
      'padding:10px 24px',
      'border-radius:20px',
      'font-size:14px',
      'font-family:"PingFang SC","Microsoft YaHei",sans-serif',
      'font-weight:500',
      'color:#fff',
      'background:' + (isOk ? '#10B981' : '#EF4444'),
      'box-shadow:0 4px 12px rgba(0,0,0,0.25)',
      'animation:__detectFadeIn 0.3s ease',
    ].join(';');
    document.body.appendChild(t);
    setTimeout(function() { t.remove(); }, 2500);
  }

  var style = document.createElement('style');
  style.textContent = '@keyframes __detectFadeIn { from{opacity:0;transform:translateX(-50%) translateY(-10px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }';
  document.head.appendChild(style);

  /* ---- Element Type Detection ---- */
  function getType(el) {
    var tag = el.tagName.toLowerCase();
    var role = el.getAttribute('role');
    var typeAttr = (el.getAttribute('type') || '').toLowerCase();

    if (tag === 'button' || role === 'button' || typeAttr === 'submit' || typeAttr === 'button') return 'button';
    if (tag === 'a' || role === 'link') return 'link';
    if (tag === 'img') return 'image';
    if (tag === 'select' || role === 'listbox' || role === 'combobox') return 'select';
    if (typeAttr === 'checkbox' || role === 'checkbox') return 'checkbox';
    if (typeAttr === 'radio' || role === 'radio') return 'radio';
    if (tag === 'input' || tag === 'textarea') return 'input';
    if (tag === 'label' || tag === 'span' || tag === 'p' || tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4' || tag === 'h5' || tag === 'h6') return 'text';
    return 'container';
  }

  function getAttrs(el) {
    var attrs = {};
    var names = ['id','name','type','placeholder','aria-label','data-testid','data-name','title','alt','role','href','value','class'];
    for (var i = 0; i < names.length; i++) {
      var v = el.getAttribute(names[i]);
      if (v) attrs[names[i]] = v;
    }
    return attrs;
  }

  function buildSelector(el) {
    var attrs = getAttrs(el);
    var tag = el.tagName.toLowerCase();

    if (attrs['data-testid']) return { s: '[data-testid="' + attrs['data-testid'].replace(/"/g,'\\\\"') + '"]', t: 'css' };
    if (attrs['id'] && /^[a-zA-Z_][\w.:-]*$/.test(attrs['id'])) return { s: '#' + attrs['id'], t: 'css' };
    if (attrs['name'] && tag === 'input') return { s: tag + '[name="' + attrs['name'].replace(/"/g,'\\\\"') + '"]', t: 'css' };

    // nth-of-type fallback
    var parent = el.parentElement;
    if (parent) {
      var siblings = Array.from(parent.children).filter(function(c) { return c.tagName === el.tagName; });
      var idx = siblings.indexOf(el);
      if (idx >= 0) return { s: tag + ':nth-of-type(' + (idx + 1) + ')', t: 'css' };
    }
    return { s: tag, t: 'css' };
  }

  function suggestName(el, type) {
    var attrs = getAttrs(el);
    var text = (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 30);

    var label = attrs['aria-label'] || attrs['data-testid'] || attrs['data-name'] || attrs['placeholder'] || attrs['title'] || attrs['alt'] || attrs['name'] || attrs['id'];
    if (label && label.length <= 30) return label;
    if (text) return text;
    var map = { button:'按钮', input:'输入框', text:'文本', link:'链接', image:'图片', select:'下拉选择', checkbox:'复选框', radio:'单选框', container:'容器' };
    return (map[type] || '元素') + ' (' + el.tagName.toLowerCase() + ')';
  }

  function describeElement(el, type) {
    var attrs = getAttrs(el);
    var text = (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 50);
    if (type === 'button') return text ? '按钮: "' + text + '"' : '按钮元素';
    if (type === 'input') return attrs['placeholder'] ? '输入框: ' + attrs['placeholder'] : '输入框';
    if (type === 'link') return text ? '链接: ' + text : '链接元素';
    if (type === 'image') return attrs['alt'] ? '图片: ' + attrs['alt'] : '图片元素';
    if (type === 'select') return '下拉选择框';
    return text || '页面元素';
  }

  function isVisible(el) {
    var style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    var rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    return true;
  }

  /* ---- Scan Logic ---- */
  function scanPage() {
    var selectors = [
      'button, [role="button"], input[type="submit"], input[type="button"]',
      'input:not([type="submit"]):not([type="button"]):not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea',
      'a[href]',
      'img',
      'select',
      'input[type="checkbox"]',
      'input[type="radio"]',
      'nav, header, footer, main, section, [role="navigation"], [role="banner"]',
    ];

    var raw = [];
    var seenTags = {};

    for (var s = 0; s < selectors.length; s++) {
      try {
        var nodes = document.querySelectorAll(selectors[s]);
        for (var i = 0; i < nodes.length; i++) {
          var el = nodes[i];
          if (!isVisible(el)) continue;

          var type = getType(el);
          var sel = buildSelector(el);
          var name = suggestName(el, type);
          var desc = describeElement(el, type);

          raw.push({
            id: 'det-' + raw.length,
            suggestedName: name,
            type: type,
            selector: sel.s,
            selectorType: sel.t,
            description: desc,
            tag: null,
            checked: true,
          });

          // track tag frequency for container type tagging
          var tagName = el.tagName.toLowerCase();
          seenTags[tagName] = (seenTags[tagName] || 0) + 1;

          // limit total
          if (raw.length >= 200) break;
        }
      } catch(e) {}
      if (raw.length >= 200) break;
    }

    return raw;
  }

  /* ---- Click handler ---- */
  btn.onclick = function() {
    btn.innerHTML = '<span style="display:inline-block;width:16px;height:16px;border:2px solid #fff;border-top-color:transparent;border-radius:50%;animation:spin 0.6s linear infinite;margin-right:8px;"></span>识别中...';
    btn.style.pointerEvents = 'none';
    btn.style.opacity = '0.85';

    var spinStyle = document.createElement('style');
    spinStyle.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
    document.head.appendChild(spinStyle);

    setTimeout(function() {
      var elements = scanPage();

      fetch(REPORT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ elements: elements, url: location.href }),
      })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        showToast('识别完成: 共 ' + data.afterDedup + ' 个唯一元素 (原始 ' + data.totalFound + ' 个)', true);
        btn.innerHTML = '<span style="font-size:18px;margin-right:6px;">✅</span>识别完成 (' + data.afterDedup + ')';
        btn.style.background = 'linear-gradient(135deg, #10B981, #059669)';
        setTimeout(function() {
          btn.innerHTML = '<span style="font-size:18px;margin-right:6px;">🔍</span>识别元素';
          btn.style.background = 'linear-gradient(135deg, #3B82F6, #8B5CF6)';
          btn.style.pointerEvents = 'auto';
          btn.style.opacity = '1';
        }, 3000);
      })
      .catch(function(err) {
        showToast('识别失败: ' + err.message, false);
        btn.innerHTML = '<span style="font-size:18px;margin-right:6px;">🔍</span>识别元素';
        btn.style.background = 'linear-gradient(135deg, #3B82F6, #8B5CF6)';
        btn.style.pointerEvents = 'auto';
        btn.style.opacity = '1';
      });
    }, 300);
  };

  /* ---- Mount ---- */
  document.body.appendChild(btn);
})();
`;
}
//# sourceMappingURL=inject.js.map