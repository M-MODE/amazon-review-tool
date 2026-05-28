/* Amazon レビュー取得ツール v4.0 — bh life
 * 楽天と同じページ送り方式（localStorage蓄積）
 */
(function () {
  'use strict';

  var STORE_KEY = '_bhl_amz4';

  /* ── ASIN 取得 ── */
  var url = location.href, asin = null, m;
  m = url.match(/\/dp\/([A-Z0-9]{10})/i);            if (m) asin = m[1].toUpperCase();
  if (!asin) { m = url.match(/\/gp\/product\/([A-Z0-9]{10})/i);    if (m) asin = m[1].toUpperCase(); }
  if (!asin) { m = url.match(/\/product-reviews\/([A-Z0-9]{10})/i); if (m) asin = m[1].toUpperCase(); }

  if (!asin) { alert('Amazonの商品ページまたはレビューページで実行してください'); return; }

  /* ── 商品ページ → レビューページへ遷移（ストレージリセット） ── */
  if (url.indexOf('/product-reviews/') < 0) {
    try { localStorage.removeItem(STORE_KEY + '_' + asin); } catch(e) {}
    location.href = 'https://www.amazon.co.jp/product-reviews/' + asin + '/?sortBy=recent&pageNumber=1';
    return;
  }

  /* ── 現在ページ番号 ── */
  var pgM = url.match(/pageNumber=(\d+)/);
  var curPage = pgM ? parseInt(pgM[1]) : 1;

  /* ── ネガティブ辞書 ── */
  var NEG = {
    '品質不良':       ['壊れ','破損','不良品','欠陥','粗悪','チープ','すぐ壊れ','割れ','傷','錆','臭い','カビ','ひどい','変形','曲がっ','剥が','切れ','折れ','ゆるい','ガタ'],
    'サイズ・仕様違い': ['サイズが違','写真と違','説明と違','思ったより小さ','思ったより大き','色が違','イメージと違','想像より','コンパクトすぎ','大きすぎ'],
    '梱包・配送':     ['梱包が悪','梱包が雑','配送が遅','遅延','破損して届','潰れ','濡れ','箱が潰','封が開','雑に'],
    'Amazon対応':    ['対応が悪','返信','無視','クレーム','返品','交換できない','サポート','問い合わせ','偽物','中古'],
    '総合不満':       ['最悪','最低','失望','がっかり','期待外れ','不満','残念','使えない','二度と','騙され','お金の無駄','安物','ゴミ'],
  };

  function classify(text, rating) {
    var cats = {}, k, hits;
    for (k in NEG) {
      hits = NEG[k].filter(function(w) { return text.indexOf(w) >= 0; });
      if (hits.length) cats[k] = hits;
    }
    var neg = (rating <= 2) || Object.keys(cats).length > 0;
    var pos = !neg && rating >= 4;
    return { neg: neg, pos: pos, cats: cats,
      label: neg ? 'ネガティブ' : (pos ? 'ポジティブ' : 'ニュートラル'),
      color: neg ? '#FF4B4B' : (pos ? '#22C55E' : '#94A3B8') };
  }

  /* ── 現ページのレビューを取得 ── */
  function scrapeCurrentPage() {
    var reviews = [];
    document.querySelectorAll('[data-hook="review"]').forEach(function(el) {
      var rEl = el.querySelector('[data-hook="review-star-rating"] .a-icon-alt, i[data-hook="review-star-rating"] .a-icon-alt');
      var rM = (rEl ? rEl.textContent : '').match(/(\d+(\.\d+)?)/);
      var rating = rM ? parseFloat(rM[1]) : 0;

      var tEl = el.querySelector('[data-hook="review-title"] span:last-child');
      var title = tEl ? tEl.textContent.trim() : '';

      var bEl = el.querySelector('[data-hook="review-body"] span');
      var body = bEl ? bEl.textContent.trim() : '';

      var dEl = el.querySelector('[data-hook="review-date"]');
      var date = dEl ? dEl.textContent.replace('日本でレビュー済み -', '').trim() : '';

      var isVine = !!(el.querySelector('[data-hook="avp-badge-linkless"],[data-hook="avp-badge"]')
        || el.innerHTML.indexOf('Vine') >= 0);

      if (body || title) {
        reviews.push({ rating: rating, title: title, body: body, date: date, vine: isVine,
          cls: classify(title + ' ' + body, rating) });
      }
    });
    return reviews;
  }

  /* ── 総ページ数を推定 ── */
  function getTotalPages() {
    /* ページネーションから最大ページ番号を取得 */
    var max = curPage;
    document.querySelectorAll('.a-pagination li').forEach(function(li) {
      var n = parseInt(li.textContent.trim());
      if (!isNaN(n) && n > max) max = n;
    });
    if (max > curPage) return max;

    /* レビュー総件数テキストから計算 */
    var countEl = document.querySelector('[data-hook="cr-filter-info-review-count"], #filter-info-section');
    if (countEl) {
      var cm = countEl.textContent.match(/(\d[\d,]*)\s*件/);
      if (cm) return Math.ceil(parseInt(cm[1].replace(/,/g,'')) / 10);
    }
    /* "44件のカスタマーレビュー" など */
    var bodyText = document.body.innerText;
    var bm = bodyText.match(/(\d+)\s*件のカスタマーレビュー/);
    if (bm) return Math.ceil(parseInt(bm[1]) / 10);

    return 999; /* 不明なら多めに設定 */
  }

  /* ── 次ページがあるか ── */
  function hasNext() {
    /* 「次へ」リンクが存在するか */
    var nextLink = document.querySelector('.a-pagination .a-last:not(.a-disabled) a');
    if (nextLink) return true;
    /* 現ページのレビュー件数が10件あれば次があると仮定 */
    var cnt = document.querySelectorAll('[data-hook="review"]').length;
    return cnt >= 10;
  }

  /* ── localStorage 読み書き ── */
  var stKey = STORE_KEY + '_' + asin;
  var stored;
  try { stored = JSON.parse(localStorage.getItem(stKey) || 'null'); } catch(e) { stored = null; }
  if (!stored || stored.asin !== asin) {
    stored = { asin: asin, reviews: [], pages: 0, productTitle: '' };
  }

  /* 商品名取得 */
  var ptEl = document.querySelector('#productTitle, h1.a-size-large');
  if (ptEl && !stored.productTitle) stored.productTitle = ptEl.textContent.trim();

  /* 1ページ目ならリセット */
  if (curPage === 1) { stored.reviews = []; }

  /* 現ページのレビューを追加 */
  var newRevs = scrapeCurrentPage();
  stored.reviews = stored.reviews.concat(newRevs);
  stored.pages = curPage;
  try { localStorage.setItem(stKey, JSON.stringify(stored)); } catch(e) {}

  /* ── 進捗バー表示 ── */
  function showProgress() {
    var ex = document.getElementById('_bhl_amz_prog');
    if (ex) ex.remove();
    var div = document.createElement('div');
    div.id = '_bhl_amz_prog';
    div.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#0F172A;color:#fff;padding:8px 16px;font-family:sans-serif;font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,.5);display:flex;align-items:center;gap:12px';
    if (!document.getElementById('_bhl_amz_sty')) {
      var s = document.createElement('style');
      s.id = '_bhl_amz_sty';
      s.textContent = '@keyframes _bhl_p{0%{opacity:.4}50%{opacity:1}100%{opacity:.4}}';
      document.head.appendChild(s);
    }
    div.innerHTML = '<span style="color:#FF9900;font-weight:700">★ Amazonレビュー取得中</span>'
      + '<span style="color:#94A3B8">' + curPage + 'ページ目　累計 <strong style="color:#fff;font-size:15px">' + stored.reviews.length + '</strong> 件</span>'
      + '<div style="flex:1;height:6px;background:#1E3A5F;border-radius:3px;overflow:hidden">'
      + '<div style="height:100%;width:60%;background:linear-gradient(90deg,#FF9900,#FFD700);border-radius:3px;animation:_bhl_p 1s ease-in-out infinite"></div></div>'
      + '<span style="color:#FF9900;font-size:11px">次のページへ移動中…</span>';
    document.body.appendChild(div);
  }

  /* ── 完了音 ── */
  function playDone() {
    try {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      [[523,0],[659,0.15],[784,0.3],[1047,0.5]].forEach(function(n) {
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.frequency.value = n[0]; o.type = 'sine';
        g.gain.setValueAtTime(0.3, ctx.currentTime + n[1]);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + n[1] + 0.4);
        o.start(ctx.currentTime + n[1]); o.stop(ctx.currentTime + n[1] + 0.5);
      });
    } catch(e) {}
  }

  /* ── CSV ── */
  window._bhlAmzCSV = function(reviews) {
    var rows = [['評価','ラベル','Vine','タイトル','本文','ネガ要因','日付']];
    reviews.forEach(function(r) {
      rows.push([r.rating, r.cls.label, r.vine?'Vine':'', r.title, r.body.replace(/\n/g,' '), Object.keys(r.cls.cats).join('/'), r.date]);
    });
    var csv = rows.map(function(r) {
      return r.map(function(c){ return '"'+String(c||'').replace(/"/g,'""')+'"'; }).join(',');
    }).join('\n');
    var a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,\uFEFF'+encodeURIComponent(csv);
    a.download = 'amazon_reviews_'+asin+'.csv';
    a.click();
  };

  /* ── フィルター ── */
  window._bhlAmzFilter = function(f, btn) {
    document.querySelectorAll('#_bhl_amz_panel button[data-f]').forEach(function(b) {
      var c = {all:'#FF9900',pos:'#22C55E',neu:'#94A3B8',neg:'#FF4B4B',vine:'#8B5CF6'}[b.getAttribute('data-f')];
      b.style.background='transparent'; b.style.color=c; b.style.borderColor=c;
    });
    var ac = {all:'#FF9900',pos:'#22C55E',neu:'#94A3B8',neg:'#FF4B4B',vine:'#8B5CF6'}[f];
    btn.style.background=ac; btn.style.color='#fff';
    if(f==='all') btn.style.color='#000';
    document.querySelectorAll('#_bhl_amz_list [data-type]').forEach(function(el) {
      if(f==='all'){ el.style.display=''; return; }
      if(f==='vine'){ el.style.display=el.getAttribute('data-vine')==='1'?'':'none'; return; }
      el.style.display=el.getAttribute('data-type')===f?'':'none';
    });
  };

  /* ── パネル描画 ── */
  function showPanel(reviews) {
    var negC=reviews.filter(function(r){return r.cls.neg;}).length;
    var posC=reviews.filter(function(r){return r.cls.pos;}).length;
    var neuC=reviews.length-negC-posC;
    var vineC=reviews.filter(function(r){return r.vine;}).length;
    var avg=reviews.length?(reviews.reduce(function(s,r){return s+r.rating;},0)/reviews.length).toFixed(1):'?';

    var dist={1:0,2:0,3:0,4:0,5:0};
    reviews.forEach(function(r){var s=Math.round(r.rating);if(dist[s]!==undefined)dist[s]++;});
    var maxD=Math.max.apply(null,[1,2,3,4,5].map(function(s){return dist[s];})) || 1;

    var distBars=[5,4,3,2,1].map(function(s){
      var cnt=dist[s],pct=Math.round(cnt/maxD*100);
      var color=s>=4?'#22C55E':(s===3?'#94A3B8':'#FF4B4B');
      return '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">'
        +'<span style="color:#FF9900;font-size:11px;width:14px;text-align:right">'+s+'</span>'
        +'<span style="color:#FF9900;font-size:10px">★</span>'
        +'<div style="flex:1;height:10px;background:#1E3A5F;border-radius:3px;overflow:hidden">'
        +'<div style="height:100%;width:'+pct+'%;background:'+color+';border-radius:3px"></div></div>'
        +'<span style="font-size:11px;color:#64748B;width:28px;text-align:right">'+cnt+'</span></div>';
    }).join('');

    var catC={};
    reviews.forEach(function(r){Object.keys(r.cls.cats).forEach(function(c){catC[c]=(catC[c]||0)+1;});});
    var catHTML=Object.keys(catC).length>0
      ?'<div style="padding:10px 16px;background:#1A0F0F;border-bottom:1px solid #2D1515">'
        +'<div style="font-size:11px;font-weight:700;color:#FF4B4B;margin-bottom:6px">⚠️ ネガティブ分類</div>'
        +'<div style="display:flex;flex-wrap:wrap;gap:5px">'
        +Object.keys(catC).map(function(c){return'<span style="background:#2D1515;color:#FCA5A5;padding:3px 8px;border-radius:20px;font-size:11px">'+c+' <strong>'+catC[c]+'件</strong></span>';}).join('')
        +'</div></div>':'';

    var listHTML=reviews.slice(0,300).map(function(r){
      var stars='★'.repeat(Math.round(r.rating))+'☆'.repeat(5-Math.round(r.rating));
      var catTags=Object.keys(r.cls.cats).map(function(c){
        return'<span style="background:#2D1515;color:#FCA5A5;padding:2px 6px;border-radius:10px;font-size:10px;margin-right:3px">'+c+'</span>';
      }).join('');
      var vb=r.vine?'<span style="background:#3B1E6E;color:#C4B5FD;padding:2px 6px;border-radius:10px;font-size:10px;margin-right:3px">Vine</span>':'';
      return'<div data-type="'+(r.cls.neg?'neg':(r.cls.pos?'pos':'neu'))+'" data-vine="'+(r.vine?'1':'0')+'" style="border-left:3px solid '+r.cls.color+';padding:10px 10px 10px 12px;margin-top:8px;background:#162032;border-radius:0 6px 6px 0">'
        +'<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;margin-bottom:4px">'
        +'<div><span style="color:#FF9900;letter-spacing:1px">'+stars+'</span>'
        +' <span style="background:'+r.cls.color+'22;color:'+r.cls.color+';font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px">'+r.cls.label+'</span></div>'
        +'<span style="font-size:10px;color:#475569;white-space:nowrap;flex-shrink:0">'+r.date+'</span></div>'
        +(r.title?'<div style="font-weight:600;color:#CBD5E1;margin-bottom:3px;font-size:12px">'+r.title+'</div>':'')
        +(vb+catTags?'<div style="margin-bottom:4px">'+vb+catTags+'</div>':'')
        +'<div style="color:#94A3B8;font-size:12px;line-height:1.6">'+r.body.replace(/\n/g,'<br>').substring(0,280)+(r.body.length>280?'…':'')+'</div>'
        +'</div>';
    }).join('');

    var panel=document.createElement('div');
    panel.id='_bhl_amz_panel';
    panel.style.cssText='position:fixed;top:16px;right:16px;z-index:2147483647;width:460px;max-height:90vh;overflow-y:auto;background:#0F172A;color:#E2E8F0;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.7);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:13px;line-height:1.5';

    panel.innerHTML=
      '<div style="background:#1E3A5F;padding:14px 16px;border-radius:12px 12px 0 0;display:flex;align-items:center;gap:10px">'
      +'<div style="background:#FF9900;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0">★</div>'
      +'<div style="flex:1;min-width:0"><div style="font-weight:700;font-size:14px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+stored.productTitle+'</div>'
      +'<div style="font-size:11px;color:#94A3B8;margin-top:2px">ASIN: '+asin+'　<span style="color:#FF9900">'+stored.pages+'ページ / '+reviews.length+'件</span></div></div>'
      +'<button onclick="document.getElementById(\'_bhl_amz_panel\').remove()" style="background:none;border:none;color:#94A3B8;font-size:22px;cursor:pointer;padding:0 0 0 8px;line-height:1">&times;</button></div>'

      +'<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;padding:12px 16px;background:#162032;border-bottom:1px solid #1E3A5F">'
      +'<div style="text-align:center;background:#0F172A;padding:8px 4px;border-radius:8px"><div style="font-size:18px;font-weight:700;color:#FF9900">'+avg+'</div><div style="font-size:9px;color:#64748B;margin-top:2px">平均評価</div></div>'
      +'<div style="text-align:center;background:#0F172A;padding:8px 4px;border-radius:8px"><div style="font-size:18px;font-weight:700;color:#22C55E">'+posC+'</div><div style="font-size:9px;color:#64748B;margin-top:2px">ポジティブ</div></div>'
      +'<div style="text-align:center;background:#0F172A;padding:8px 4px;border-radius:8px"><div style="font-size:18px;font-weight:700;color:#94A3B8">'+neuC+'</div><div style="font-size:9px;color:#64748B;margin-top:2px">ニュートラル</div></div>'
      +'<div style="text-align:center;background:#0F172A;padding:8px 4px;border-radius:8px"><div style="font-size:18px;font-weight:700;color:#FF4B4B">'+negC+'</div><div style="font-size:9px;color:#64748B;margin-top:2px">ネガティブ</div></div>'
      +'<div style="text-align:center;background:#0F172A;padding:8px 4px;border-radius:8px;border:1px solid #3B1E6E"><div style="font-size:18px;font-weight:700;color:#C4B5FD">'+vineC+'</div><div style="font-size:9px;color:#64748B;margin-top:2px">Vine</div></div></div>'

      +(vineC>0?'<div style="padding:6px 16px;background:#1A1230;border-bottom:1px solid #2D1A5F;font-size:11px;color:#C4B5FD">うち Amazon Vine レビュー <strong>'+vineC+'件</strong>（全体の'+Math.round(vineC/reviews.length*100)+'%）</div>':'')

      +'<div style="padding:12px 16px;background:#162032;border-bottom:1px solid #1E3A5F">'
      +'<div style="font-size:11px;font-weight:700;color:#94A3B8;margin-bottom:8px;text-transform:uppercase;letter-spacing:.05em">★ 評価分布</div>'
      +distBars+'</div>'
      +catHTML
      +'<div style="padding:10px 16px;display:flex;gap:5px;flex-wrap:wrap;border-bottom:1px solid #1E3A5F">'
      +'<button data-f="all"  onclick="_bhlAmzFilter(\'all\',this)"  style="padding:4px 10px;border-radius:20px;border:1px solid #FF9900;background:#FF9900;color:#000;font-size:11px;font-weight:700;cursor:pointer">全て('+reviews.length+')</button>'
      +'<button data-f="pos"  onclick="_bhlAmzFilter(\'pos\',this)"  style="padding:4px 10px;border-radius:20px;border:1px solid #22C55E;background:transparent;color:#22C55E;font-size:11px;cursor:pointer">良い('+posC+')</button>'
      +'<button data-f="neu"  onclick="_bhlAmzFilter(\'neu\',this)"  style="padding:4px 10px;border-radius:20px;border:1px solid #94A3B8;background:transparent;color:#94A3B8;font-size:11px;cursor:pointer">普通('+neuC+')</button>'
      +'<button data-f="neg"  onclick="_bhlAmzFilter(\'neg\',this)"  style="padding:4px 10px;border-radius:20px;border:1px solid #FF4B4B;background:transparent;color:#FF4B4B;font-size:11px;cursor:pointer">悪い('+negC+')</button>'
      +'<button data-f="vine" onclick="_bhlAmzFilter(\'vine\',this)" style="padding:4px 10px;border-radius:20px;border:1px solid #8B5CF6;background:transparent;color:#C4B5FD;font-size:11px;cursor:pointer">Vine('+vineC+')</button>'
      +'<button onclick="_bhlAmzCSV(window._bhlAmzAllReviews)" style="margin-left:auto;padding:4px 10px;border-radius:20px;border:1px solid #3B82F6;background:transparent;color:#3B82F6;font-size:11px;cursor:pointer">📥 CSV</button></div>'
      +'<div id="_bhl_amz_list" style="padding:8px 16px 16px">'+listHTML+'</div>'
      +'<div style="padding:10px 16px;background:#162032;border-top:1px solid #1E3A5F;border-radius:0 0 12px 12px;text-align:center;font-size:11px;color:#475569">'
      +(reviews.length>300?reviews.length+'件中300件表示。全件はCSVで確認できます。':'全'+reviews.length+'件を表示中')+'</div>';

    document.body.appendChild(panel);
    window._bhlAmzAllReviews = reviews;
  }

  /* ── 次ページへ or 完了 ── */
  if (newRevs.length > 0 && hasNext()) {
    showProgress();
    setTimeout(function() {
      location.href = 'https://www.amazon.co.jp/product-reviews/' + asin
        + '/?sortBy=recent&pageNumber=' + (curPage + 1);
    }, 500);
  } else {
    /* 完了 */
    try { localStorage.removeItem(stKey); } catch(e) {}
    showPanel(stored.reviews);
    playDone();
    setTimeout(function() {
      var vc = stored.reviews.filter(function(r){return r.vine;}).length;
      alert('✅ レビュー取得完了！\n\n合計 ' + stored.reviews.length + ' 件（' + stored.pages + 'ページ）\nうち Amazon Vine: ' + vc + ' 件\n\n「📥 CSV」でダウンロードしてClaudeにアップロードしてください。');
    }, 500);
  }

})();
