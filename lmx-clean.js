(function () {
  'use strict';

  var NAME = 'LMX Clean';
  var VERSION = '0.1.2';
  var COMPONENT = 'lmx_clean';
  var started = false;
  var patched = {
    ajax: false,
    fetch: false,
    xhr: false,
    media: false,
    player: false,
    utils: false,
    ima: false,
    account: false,
    storage: false,
    accountApi: false
  };

  var PREMIUM_UNTIL = 4102444800000;

  var manifest = {
    type: 'other',
    version: VERSION,
    name: NAME,
    description: 'Blocks LAMPA CUB ads and forces premium checks to pass.',
    component: COMPONENT
  };

  function log() {
    try {
      var args = Array.prototype.slice.call(arguments);
      args.unshift(NAME);
      console.log.apply(console, args);
    } catch (e) {}
  }

  function toUrl(value) {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (value.url) return String(value.url);
    if (value.src) return String(value.src);
    try { return String(value); } catch (e) { return ''; }
  }

  function isAdUrl(value) {
    var url = toUrl(value);
    if (!url) return false;

    return /\/api\/ad\/get\/(preroll|banner)/i.test(url) ||
      /imasdk\.googleapis\.com\/js\/sdkloader\/ima3\.js/i.test(url) ||
      /(^|\/\/|\.)(doubleclick\.net|googlesyndication\.com|googleadservices\.com)\b/i.test(url) ||
      /googleads\.g\.doubleclick\.net/i.test(url);
  }

  function isAdMedia(el) {
    if (!el) return false;

    var src = '';
    try { src = el.currentSrc || el.src || ''; } catch (e) {}

    if (src && isAdUrl(src)) return true;

    try {
      if (el.closest && el.closest('.ad-video-block,.ad-preroll')) return true;
    } catch (e) {}

    return false;
  }

  function finishMedia(el) {
    try { el.pause(); } catch (e) {}
    try { el.currentTime = el.duration || 999999; } catch (e) {}

    ['ended', 'pause', 'abort', 'emptied'].forEach(function (name) {
      try { el.dispatchEvent(new Event(name)); } catch (e) {}
    });
  }

  function sanitizeAdFields(data) {
    if (!data || typeof data !== 'object') return data;

    Object.keys(data).forEach(function (key) {
      if (/^vast(?:_|$)/i.test(key) || /^ad_(?:url|tag|region|screen|platform)/i.test(key)) {
        try { delete data[key]; } catch (e) { data[key] = ''; }
      }
    });

    if (Array.isArray(data.playlist)) {
      data.playlist.forEach(sanitizeAdFields);
    }

    return data;
  }

  function isAdStack() {
    try {
      var stack = String((new Error()).stack || '');
      return /getMediaType|canShow|Preroll|Banner|Vast|IMA|advert|ad_/i.test(stack);
    } catch (e) {
      return false;
    }
  }

  function markPlayerData(data) {
    if (!data || typeof data !== 'object') return data;

    sanitizeAdFields(data);

    if (data.__lmx_clean_marked || data.iptv === true) return data;

    try {
      var state = {
        value: !!data.iptv,
        reads: 0
      };

      Object.defineProperty(data, '__lmx_clean_marked', {
        value: true,
        configurable: true
      });

      Object.defineProperty(data, 'iptv', {
        configurable: true,
        enumerable: true,
        get: function () {
          state.reads += 1;

          if (isAdStack() || state.reads === 1) return true;

          return state.value;
        },
        set: function (value) {
          state.value = !!value;
        }
      });
    } catch (e) {
      log('player data mark failed:', e.message || e);
    }

    return data;
  }

  function patchJqueryAjax() {
    if (patched.ajax || !window.$ || !$.ajax) return;

    var originalAjax = $.ajax;

    $.ajax = function (options) {
      var url = typeof options === 'string' ? options : options && options.url;

      if (isAdUrl(url)) {
        log('blocked ajax:', url);

        var fake = {
          status: 200,
          readyState: 4,
          responseJSON: { ad: [] },
          responseText: '{"ad":[]}',
          abort: function () {}
        };

        setTimeout(function () {
          if (options && typeof options.success === 'function') options.success({ ad: [] }, 'success', fake);
          if (options && typeof options.complete === 'function') options.complete(fake, 'success');
        }, 0);

        return fake;
      }

      return originalAjax.apply(this, arguments);
    };

    $.ajax.__lmx_clean = true;
    patched.ajax = true;
    log('jquery ajax patched');
  }

  function patchFetch() {
    if (patched.fetch || !window.fetch) return;

    var originalFetch = window.fetch;

    window.fetch = function (input, init) {
      if (isAdUrl(input)) {
        log('blocked fetch:', toUrl(input));

        if (window.Response) {
          return Promise.resolve(new Response('{"ad":[]}', {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }));
        }

        return Promise.reject(new Error('Blocked by ' + NAME));
      }

      return originalFetch.apply(this, arguments);
    };

    patched.fetch = true;
    log('fetch patched');
  }

  function patchXhr() {
    if (patched.xhr || !window.XMLHttpRequest) return;

    var originalOpen = XMLHttpRequest.prototype.open;
    var originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url) {
      this.__lmx_clean_blocked = isAdUrl(url);
      this.__lmx_clean_url = url;

      if (this.__lmx_clean_blocked) {
        log('blocked xhr:', url);
        arguments[1] = 'about:blank';
      }

      return originalOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function () {
      if (this.__lmx_clean_blocked) {
        try { this.abort(); } catch (e) {}
        return;
      }

      return originalSend.apply(this, arguments);
    };

    patched.xhr = true;
    log('xhr patched');
  }

  function patchMedia() {
    if (patched.media || !window.HTMLMediaElement) return;

    var originalPlay = HTMLMediaElement.prototype.play;

    HTMLMediaElement.prototype.play = function () {
      if (isAdMedia(this)) {
        log('blocked media play');
        finishMedia(this);

        if (window.Promise) return Promise.resolve();
        return undefined;
      }

      return originalPlay.apply(this, arguments);
    };

    patched.media = true;
    log('media patched');
  }

  function patchUtils() {
    if (patched.utils || !window.Lampa || !Lampa.Utils) return;

    if (typeof Lampa.Utils.countDays === 'function') {
      var originalCountDays = Lampa.Utils.countDays;

      Lampa.Utils.countDays = function () {
        var result = originalCountDays.apply(this, arguments);

        return result > 0 ? result : 36500;
      };
    }

    if (Lampa.Utils.putScriptAsync) {
      var originalPutScriptAsync = Lampa.Utils.putScriptAsync;

      Lampa.Utils.putScriptAsync = function (urls, progress, reject, resolve) {
        var list = Array.isArray(urls) ? urls : [urls];
        var blocked = list.some(function (url) {
          return isAdUrl(url) || /\/vender\/vast\/vast\.js/i.test(toUrl(url));
        });

        if (blocked) {
          log('blocked script:', list.join(', '));

          setTimeout(function () {
            if (typeof reject === 'function') reject(new Error('Blocked by ' + NAME));
          }, 0);

          return;
        }

        return originalPutScriptAsync.apply(this, arguments);
      };
    }

    patched.utils = true;
    log('utils patched');
  }

  function patchIma() {
    if (patched.ima || !window.google || !google.ima || !google.ima.AdsLoader) return;

    var proto = google.ima.AdsLoader.prototype;
    var originalRequestAds = proto.requestAds;

    proto.requestAds = function (request) {
      log('blocked IMA request:', request && request.adTagUrl);
      return undefined;
    };

    proto.requestAds.__lmx_clean_original = originalRequestAds;
    patched.ima = true;
    log('IMA patched');
  }

  function patchAccount() {
    if (!window.Lampa || !Lampa.Account) return;

    var account = Lampa.Account;

    try {
      forcePermitPremium(account);
      patchAccountApi(account);

      if (!account.__lmx_clean_forcedHasPremium) {
        Object.defineProperty(account, '__lmx_clean_forcedHasPremium', {
          value: function () {
            forcePermitPremium(window.Lampa && Lampa.Account);
            return true;
          },
          configurable: true
        });
      }

      if (account.hasPremium !== account.__lmx_clean_forcedHasPremium) {
        try {
          Object.defineProperty(account, 'hasPremium', {
            value: account.__lmx_clean_forcedHasPremium,
            configurable: true,
            writable: true
          });
        } catch (e) {
          account = replaceAccountObject(account);
        }
      }

      forcePermitPremium(account);

      if (!patched.account) {
        patched.account = true;
        log('account premium patched globally');
      }
    } catch (e) {
      if (!patched.accountErrorLogged) {
        patched.accountErrorLogged = true;
        log('account patch failed:', e.message || e);
      }
    }
  }

  function forcePermitPremium(account) {
    if (!account || !account.Permit) return;

    try {
      if (account.Permit.user && typeof account.Permit.user === 'object') {
        forceUserPremium(account.Permit.user);
      }
    } catch (e) {}

    try {
      if (account.Permit.account && typeof account.Permit.account === 'object') {
        forceUserPremium(account.Permit.account);
      }
    } catch (e) {}

    try { account.Permit.premium = true; } catch (e) {}
  }

  function forceUserPremium(user) {
    if (!user || typeof user !== 'object') user = {};

    if (!user.id) user.id = 'lmx_clean';

    user.premium = PREMIUM_UNTIL;
    user.premium_at = PREMIUM_UNTIL;
    user.premium_to = PREMIUM_UNTIL;

    return user;
  }

  function patchStorage() {
    if (patched.storage || !window.Lampa || !Lampa.Storage || !Lampa.Storage.get) return;

    var originalGet = Lampa.Storage.get;
    var originalSet = Lampa.Storage.set;

    Lampa.Storage.get = function (name, empty) {
      if (name === 'developer_nopremium') return false;

      var value = originalGet.apply(this, arguments);

      if (name === 'account_user') {
        value = forceUserPremium(value && typeof value === 'object' ? value : {});
      }

      return value;
    };

    if (typeof originalSet === 'function') {
      Lampa.Storage.set = function (name, value) {
        if (name === 'developer_nopremium') value = false;
        if (name === 'account_user') value = forceUserPremium(typeof value === 'string' ? safeJson(value) : value);

        return originalSet.call(this, name, value, arguments[2], arguments[3]);
      };

      try {
        Lampa.Storage.set('developer_nopremium', false, true);
        Lampa.Storage.set('account_user', forceUserPremium(Lampa.Storage.get('account_user', '{}')), true);
      } catch (e) {}
    }

    patched.storage = true;
    log('storage premium patched');
  }

  function safeJson(value) {
    try { return JSON.parse(value); } catch (e) { return {}; }
  }

  function patchAccountApi(account) {
    if (patched.accountApi || !account || !account.Api || typeof account.Api.user !== 'function') return;

    var originalUser = account.Api.user;

    account.Api.user = function (success, error) {
      var args = Array.prototype.slice.call(arguments);

      if (typeof success === 'function') {
        args[0] = function (user) {
          return success(forceUserPremium(user));
        };
      }

      return originalUser.apply(this, args);
    };

    patched.accountApi = true;
    log('account api patched');
  }

  function replaceAccountObject(account) {
    if (account.__lmx_clean_proxy) return account;

    var copy = {};

    Object.keys(account).forEach(function (key) {
      copy[key] = account[key];
    });

    Object.getOwnPropertyNames(account).forEach(function (key) {
      if (key === 'hasPremium') return;
      if (Object.prototype.hasOwnProperty.call(copy, key)) return;

      try {
        Object.defineProperty(copy, key, Object.getOwnPropertyDescriptor(account, key));
      } catch (e) {}
    });

    Object.defineProperty(copy, '__lmx_clean_originalAccount', {
      value: account,
      configurable: true
    });

    Object.defineProperty(copy, '__lmx_clean_proxy', {
      value: true,
      configurable: true
    });

    Object.defineProperty(copy, 'hasPremium', {
      value: function () {
        forcePermitPremium(copy);
        return true;
      },
      configurable: true,
      writable: true
    });

    Lampa.Account = copy;

    return copy;
  }

  function patchPlayer() {
    if (patched.player || !window.Lampa || !Lampa.Player) return;

    if (Lampa.Player.listener && Lampa.Player.listener.follow) {
      Lampa.Player.listener.follow('create,start,ready', function (event) {
        if (event && event.data) markPlayerData(event.data);
        if (Lampa.Player.playdata) markPlayerData(Lampa.Player.playdata());
        cleanupDom();
      });
    }

    ['play', 'iptv'].forEach(function (name) {
      if (typeof Lampa.Player[name] !== 'function') return;

      var original = Lampa.Player[name];

      Lampa.Player[name] = function (data) {
        markPlayerData(data);
        return original.apply(this, arguments);
      };
    });

    patched.player = true;
    log('player patched');
  }

  function cleanupDom() {
    var selectors = [
      '.ad-preroll',
      '.ad-video-block',
      'iframe[src*="doubleclick.net"]',
      'iframe[src*="googlesyndication.com"]',
      'iframe[src*="googleads.g.doubleclick.net"]',
      'script[src*="imasdk.googleapis.com/js/sdkloader/ima3.js"]'
    ];

    selectors.forEach(function (selector) {
      var nodes;

      try { nodes = document.querySelectorAll(selector); } catch (e) { nodes = []; }

      Array.prototype.forEach.call(nodes, function (node) {
        if (node.tagName && node.tagName.toLowerCase() === 'video') finishMedia(node);
        try { node.parentNode && node.parentNode.removeChild(node); } catch (e) {}
      });
    });
  }

  function addCss() {
    if (document.getElementById('lmx-clean-style')) return;

    var style = document.createElement('style');
    style.id = 'lmx-clean-style';
    style.type = 'text/css';
    style.textContent = [
      '.ad-preroll,',
      '.ad-video-block,',
      'iframe[src*="doubleclick.net"],',
      'iframe[src*="googlesyndication.com"],',
      'iframe[src*="googleads.g.doubleclick.net"]{',
      'display:none!important;',
      'visibility:hidden!important;',
      'opacity:0!important;',
      'pointer-events:none!important;',
      '}'
    ].join('');

    document.head.appendChild(style);
  }

  function observeDom() {
    if (!window.MutationObserver || !document.body) return;

    var observer = new MutationObserver(function () {
      cleanupDom();
      patchIma();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  function patchAll() {
    patchJqueryAjax();
    patchFetch();
    patchXhr();
    patchMedia();
    patchUtils();
    patchIma();
    patchStorage();
    patchAccount();
    patchPlayer();
    cleanupDom();
  }

  function start() {
    if (started) return;
    started = true;

    if (window.Lampa && Lampa.Manifest) {
      Lampa.Manifest.plugins = manifest;
    }

    addCss();
    observeDom();
    patchAll();

    setInterval(patchAll, 1000);
    log('started', VERSION);
  }

  patchFetch();
  patchXhr();
  patchMedia();

  if (window.appready) {
    start();
  } else if (window.Lampa && Lampa.Listener && Lampa.Listener.follow) {
    Lampa.Listener.follow('app', function (event) {
      if (event && event.type === 'ready') start();
    });
  } else {
    var wait = setInterval(function () {
      if (window.Lampa && Lampa.Listener && Lampa.Manifest) {
        clearInterval(wait);

        if (window.appready) start();
        else Lampa.Listener.follow('app', function (event) {
          if (event && event.type === 'ready') start();
        });
      }
    }, 250);
  }
})();
