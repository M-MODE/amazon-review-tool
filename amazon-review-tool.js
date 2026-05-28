/* Amazon レビュー取得ツール v5.1 — bh life
 * fetch全ページ取得 / 評価パース修正 / Vine正確検知 / Vine別平均
 */
(function () {
  'use strict';

  /* ── ASIN 取得 ── */
  var url = location.href, asin = null, m;
  m = url.match(/\/dp\/([A-Z0-9]{10})/i);            if (m) asin = m[1].toUpperCase();
  if (!asin) { m = url.match(/\/gp\/product\/([A-Z0-9]{10})/i);    if (m) asin = m[1].toUpperCase(); }
  if (!asin) { m = url.match(/\/product-reviews\/([A-Z0-9]{10})/i); if (m) asin = m[1].toUpperCase(); }
  if (!asin) { alert('Amazonの商品ページまたはレビューページで実行してください'); return; }

  /* ── 商品ページ → レビューページへ遷移 ── */
  if (url.indexOf('/product-reviews/') < 0) {
    location.href = 'https://www.amazon.co.jp/product-reviews/' + asin + '/?sortBy=recent&pageNumber=1';
    return;
  }

  /* ── 既に動いていたら止める ── */
  if (window._bhlAmzRunning) {
    window._bhlAmzRunning = false;
    var ex = document.getElementById('_bhl_amz_prog');
    if (ex) ex.remove();
    alert('取得を中断しました');
    return;
  }

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
    /* rating=0は未取得なので評価軸では判断しない */
    var neg = (rating > 0 && rating <= 2) || Object.keys(cats).length > 0;
    var pos = !neg && rating >= 4;
    return { neg: neg, pos: pos, cats: cats,
      label: neg ? 'ネガティブ' : (pos ? 'ポジティブ' : 'ニュートラル'),
      color: neg ? '#FF4B4B' : (pos ? '#22C55E' : '#94A3B8') };
  }

  /* ── 評価パース：「5つ星のうち3.0」→ 3.0 を正確に取得 ── */
  function parseRating(el) {
    if (!el) return 0;
    var text = el.textContent || '';
    /* 日本語: "5つ星のうち3.0" → "のうち" の後の数字 */
    var m1 = text.match(/のうち(\d+(?:\.\d+)?)/);
    if (m1) return parseFloat(m1[1]);
    /* 英語: "3.0 out of 5" */
    var m2 = text.match(/^(\d+(?:\.\d+)?)\s*out/);
    if (m2) return parseFloat(m2[1]);
    /* 最後の数字（フォールバック） */
    var nums = text.match(/\d+(?:\.\d+)?/g);
    if (nums && nums.length > 0) return parseFloat(nums[nums.length - 1]);
    return 0;
  }

  /* ── Vine 判定：専用バッジ要素のみ ── */
  function isVineReview(el) {
    /* data-hook でバッジ要素を確認 */
    if (el.querySelector('[data-hook="avp-badge-linkless"],[data-hook="avp-badge"]')) return true;
    /* テキストで厳格判定（Vine先取り or Vineプログラム のみ） */
    var t = el.textContent || '';
    return t.indexOf('Vine先取りプログラム') >= 0 || t.indexOf('Vineプログラムカスタマー') >= 0;
  }

  /* ── DOM からレビューをパース ── */
  function parseReviews(doc) {
    var reviews = [];
    doc.querySelectorAll('[data-hook="review"]').forEach(function(el) {
      var rEl = el.querySelector('[data-hook="review-star-rating"] .a-icon-alt, i[data-hook="review-star-rating"] .a-icon-alt');
      var rating = parseRating(rEl);

      var tEl = el.querySelector('[data-hook="review-title"] span:last-child');
      var title = tEl ? tEl.textContent.trim() : '';

      var bEl = el.querySelector('[data-hook="review-body"] span');
      var body = bEl ? bEl.textContent.trim() : '';

      var dEl = el.querySelector('[data-hook="review-date"]');
      var date = dEl ? dEl.textContent.replace('日本でレビュー済み -','').trim() : '';

      var vine = isVineReview(el);

      if (body || title) {
        reviews.push({ rating: rating, title: title, body: body, date: date, vine: vine,
          cls: classify(title + ' ' + body, rating) });
      }
    });
    return reviews;
  }

  /* ── 進捗バー ── */
  function upsertProgress(page, total, count) {
    var el = document.getElementById('_bhl_amz_prog');
    if (!el) {
      el = document.createElement('div');
      el.id = '_bhl_amz_prog';
      el.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#0F172A;color:#fff;padding:8px 16px;font-family:sans-serif;font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,.5);display:flex;align-items:center;gap:12px';
      if (!document.getElementById('_bhl_sty')) {
        var s = document.createElement('style');
        s.id = '_bhl_sty';
        s.textContent = '@keyframes _bhlp{0%{opacity:.4}50%{opacity:1}100%{opacity:.4}}';
        document.head.appendChild(s);
      }
      document.body.appendChild(el);
    }
    var pct = total > 1 ? Math.round(page / total * 100) : 0;
    el.innerHTML = '<span style="color:#FF9900;font-weight:700">★ Amazonレビュー取得中</span>'
      + '<span style="color:#94A3B8">' + page + ' / ' + (total > 1 ? total : '?') + 'ページ　累計 <strong style="color:#fff">' + count + '</strong> 件</span>'
      + '<div style="flex:1;height:6px;background:#1E3A5F;border-radius:3px;overflow:hidden">'
      + '<div style="height:100%;width:' + (pct || 15) + '%;background:linear-gradient(90deg,#FF9900,#FFD700);border-radius:3px;' + (pct ? '' : 'animation:_bhlp 1s ease-in-out infinite') + '"></div></div>'
      + '<span style="color:#64748B;font-size:10px">再クリックで中断</span>';
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
      rows.push([r.rating, r.cls.label, r.vine ? 'Vine' : '', r.title, r.body.replace(/\n/g,' '), Object.keys(r.cls.cats).join('/'), r.date]);
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
      var c = {all:'#FF9900',pos:'#22C55E',neu:'#94A3B8',neg:'#FF4B4B',vine:'#8B5CF6',novine:'#06B6D4'}[b.getAttribute('data-f')];
      b.style.background = 'transparent'; b.style.color = c; b.style.borderColor = c;
    });
    var ac = {all:'#FF9900',pos:'#22C55E',neu:'#94A3B8',neg:'#FF4B4B',vine:'#8B5CF6',novine:'#06B6D4'}[f];
    btn.style.background = ac; btn.style.color = '#fff';
    if (f === 'all') btn.style.color = '#000';
    document.querySelectorAll('#_bhl_amz_list [data-type]').forEach(function(el) {
      var t = el.getAttribute('data-type');
      var v = el.getAttribute('data-vine');
      if (f === 'all')    { el.style.display = ''; return; }
      if (f === 'vine')   { el.style.display = v === '1' ? '' : 'none'; return; }
      if (f === 'novine') { el.style.display = v === '0' ? '' : 'none'; return; }
      el.style.display = t === f ? '' : 'none';
    });
  };

  /* ── 平均値計算ヘルパー ── */
  function avgRating(list) {
    var valid = list.filter(function(r){ return r.rating > 0; });
    if (!valid.length) return '?';
    return (valid.reduce(function(s,r){ return s+r.rating; },0) / valid.length).toFixed(1);
  }

  /* ── パネル描画 ── */
  function showPanel(reviews, pages, productTitle) {
    var prog = document.getElementById('_bhl_amz_prog');
    if (prog) prog.remove();

    var negC   = reviews.filter(function(r){ return r.cls.neg; }).length;
    var posC   = reviews.filter(function(r){ return r.cls.pos; }).length;
    var neuC   = reviews.length - negC - posC;
    var vineRv = reviews.filter(function(r){ return r.vine; });
    var noVine = reviews.filter(function(r){ return !r.vine; });
    var vineC  = vineRv.length;
    var vinePct = reviews.length > 0 ? Math.round(vineC / reviews.length * 100) : 0;

    var avgAll    = avgRating(reviews);
    var avgVine   = avgRating(vineRv);
    var avgNoVine = avgRating(noVine);

    /* 評価分布（全体） */
    var dist = {1:0,2:0,3:0,4:0,5:0};
    reviews.forEach(function(r){ var s=Math.round(r.rating); if(dist[s]!==undefined) dist[s]++; });
    var maxD = Math.max.apply(null,[1,2,3,4,5].map(function(s){return dist[s];})) || 1;
    var distBars = [5,4,3,2,1].map(function(s){
      var cnt=dist[s], pct=Math.round(cnt/maxD*100);
      var color=s>=4?'#22C55E':(s===3?'#94A3B8':'#FF4B4B');
      return '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">'
        +'<span style="color:#FF9900;font-size:11px;width:14px;text-align:right">'+s+'</span>'
        +'<span style="color:#FF9900;font-size:10px">★</span>'
        +'<div style="flex:1;height:10px;background:#1E3A5F;border-radius:3px;overflow:hidden">'
        +'<div style="height:100%;width:'+pct+'%;background:'+color+';border-radius:3px"></div></div>'
        +'<span style="font-size:11px;color:#64748B;width:28px;text-align:right">'+cnt+'</span></div>';
    }).join('');

    /* ネガカテゴリ */
    var catC = {};
    reviews.forEach(function(r){ Object.keys(r.cls.cats).forEach(function(c){ catC[c]=(catC[c]||0)+1; }); });
    var catHTML = Object.keys(catC).length > 0
      ? '<div style="padding:10px 16px;background:#1A0F0F;border-bottom:1px solid #2D1515">'
        +'<div style="font-size:11px;font-weight:700;color:#FF4B4B;margin-bottom:6px">⚠️ ネガティブ分類</div>'
        +'<div style="display:flex;flex-wrap:wrap;gap:5px">'
        +Object.keys(catC).map(function(c){ return '<span style="background:#2D1515;color:#FCA5A5;padding:3px 8px;border-radius:20px;font-size:11px">'+c+' <strong>'+catC[c]+'件</strong></span>'; }).join('')
        +'</div></div>' : '';

    /* レビューリスト */
    var listHTML = reviews.slice(0,300).map(function(r){
      var stars='★'.repeat(Math.round(r.rating))+'☆'.repeat(5-Math.round(r.rating));
      var catTags=Object.keys(r.cls.cats).map(function(c){
        return '<span style="background:#2D1515;color:#FCA5A5;padding:2px 6px;border-radius:10px;font-size:10px;margin-right:3px">'+c+'</span>';
      }).join('');
      var vb=r.vine?'<span style="background:#3B1E6E;color:#C4B5FD;padding:2px 6px;border-radius:10px;font-size:10px;margin-right:3px">Vine</span>':'';
      return '<div data-type="'+(r.cls.neg?'neg':(r.cls.pos?'pos':'neu'))+'" data-vine="'+(r.vine?'1':'0')+'" style="border-left:3px solid '+r.cls.color+';padding:10px 10px 10px 12px;margin-top:8px;background:#162032;border-radius:0 6px 6px 0">'
        +'<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;margin-bottom:4px">'
        +'<div><span style="color:#FF9900;letter-spacing:1px">'+stars+'</span>'
        +' <span style="background:'+r.cls.color+'22;color:'+r.cls.color+';font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px">'+r.cls.label+'</span>'
        +(r.vine?' <span style="background:#3B1E6E;color:#C4B5FD;font-size:10px;padding:2px 6px;border-radius:10px">Vine</span>':'')+'</div>'
        +'<span style="font-size:10px;color:#475569;white-space:nowrap;flex-shrink:0">'+r.date+'</span></div>'
        +(r.title?'<div style="font-weight:600;color:#CBD5E1;margin-bottom:3px;font-size:12px">'+r.title+'</div>':'')
        +(catTags?'<div style="margin-bottom:4px">'+catTags+'</div>':'')
        +'<div style="color:#94A3B8;font-size:12px;line-height:1.6">'+r.body.replace(/\n/g,'<br>').substring(0,280)+(r.body.length>280?'…':'')+'</div>'
        +'</div>';
    }).join('');

    var panel = document.createElement('div');
    panel.id = '_bhl_amz_panel';
    panel.style.cssText = 'position:fixed;top:16px;right:16px;z-index:2147483647;width:470px;max-height:90vh;overflow-y:auto;background:#0F172A;color:#E2E8F0;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.7);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:13px;line-height:1.5';

    panel.innerHTML =
      /* ヘッダー */
      '<div style="background:#1E3A5F;padding:14px 16px;border-radius:12px 12px 0 0;display:flex;align-items:center;gap:10px">'
      +'<div style="background:#FF9900;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0">★</div>'
      +'<div style="flex:1;min-width:0"><div style="font-weight:700;font-size:14px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+productTitle+'</div>'
      +'<div style="font-size:11px;color:#94A3B8;margin-top:2px">ASIN: '+asin+'　<span style="color:#FF9900">'+pages+'ページ / '+reviews.length+'件取得</span></div></div>'
      +'<button onclick="document.getElementById(\'_bhl_amz_panel\').remove()" style="background:none;border:none;color:#94A3B8;font-size:22px;cursor:pointer;padding:0 0 0 8px;line-height:1">&times;</button></div>'

      /* サマリー上段：評価系（4列） */
      +'<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;padding:12px 16px 6px;background:#162032">'
      +'<div style="text-align:center;background:#0F172A;padding:8px 4px;border-radius:8px"><div style="font-size:18px;font-weight:700;color:#FF9900">'+avgAll+'</div><div style="font-size:9px;color:#64748B;margin-top:2px">全体平均</div></div>'
      +'<div style="text-align:center;background:#0F172A;padding:8px 4px;border-radius:8px;border:1px solid #3B1E6E"><div style="font-size:18px;font-weight:700;color:#C4B5FD">'+avgVine+'</div><div style="font-size:9px;color:#64748B;margin-top:2px">Vine平均</div></div>'
      +'<div style="text-align:center;background:#0F172A;padding:8px 4px;border-radius:8px;border:1px solid #0E7490"><div style="font-size:18px;font-weight:700;color:#67E8F9">'+avgNoVine+'</div><div style="font-size:9px;color:#64748B;margin-top:2px">非Vine平均</div></div>'
      +'<div style="text-align:center;background:#0F172A;padding:8px 4px;border-radius:8px"><div style="font-size:18px;font-weight:700;color:#FF4B4B">'+negC+'</div><div style="font-size:9px;color:#64748B;margin-top:2px">ネガティブ</div></div>'
      +'</div>'

      /* サマリー下段：件数系（4列） */
      +'<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;padding:6px 16px 12px;background:#162032;border-bottom:1px solid #1E3A5F">'
      +'<div style="text-align:center;background:#0F172A;padding:8px 4px;border-radius:8px"><div style="font-size:18px;font-weight:700;color:#22C55E">'+posC+'</div><div style="font-size:9px;color:#64748B;margin-top:2px">ポジティブ</div></div>'
      +'<div style="text-align:center;background:#0F172A;padding:8px 4px;border-radius:8px"><div style="font-size:18px;font-weight:700;color:#94A3B8">'+neuC+'</div><div style="font-size:9px;color:#64748B;margin-top:2px">ニュートラル</div></div>'
      +'<div style="text-align:center;background:#0F172A;padding:8px 4px;border-radius:8px;border:1px solid #3B1E6E"><div style="font-size:18px;font-weight:700;color:#C4B5FD">'+vineC+'</div><div style="font-size:9px;color:#64748B;margin-top:2px">Vine件数</div></div>'
      +'<div style="text-align:center;background:#0F172A;padding:8px 4px;border-radius:8px;border:1px solid #0E7490"><div style="font-size:18px;font-weight:700;color:#67E8F9">'+noVine.length+'</div><div style="font-size:9px;color:#64748B;margin-top:2px">非Vine件数</div></div>'
      +'</div>'

      /* Vine補足 */
      +(vineC > 0
        ? '<div style="padding:8px 16px;background:#1A1230;border-bottom:1px solid #2D1A5F;font-size:11px;line-height:1.8">'
          +'<span style="color:#C4B5FD">■ Vine '+vineC+'件（全体の'+vinePct+'%）　平均 <strong>'+avgVine+'★</strong></span><br>'
          +'<span style="color:#67E8F9">■ 非Vine '+noVine.length+'件　平均 <strong>'+avgNoVine+'★</strong></span>'
          +(avgVine !== '?' && avgNoVine !== '?' && parseFloat(avgVine) > parseFloat(avgNoVine)
            ? '<br><span style="color:#FCD34D;font-size:10px">⚠ VineはVine以外より '+( parseFloat(avgVine)-parseFloat(avgNoVine)).toFixed(1)+'★ 高め</span>'
            : '')
          +'</div>'
        : '')

      /* 評価分布 */
      +'<div style="padding:12px 16px;background:#162032;border-bottom:1px solid #1E3A5F">'
      +'<div style="font-size:11px;font-weight:700;color:#94A3B8;margin-bottom:8px;text-transform:uppercase;letter-spacing:.05em">★ 評価分布（全体）</div>'
      +distBars+'</div>'

      /* ネガカテゴリ */
      +catHTML

      /* フィルター */
      +'<div style="padding:10px 16px;display:flex;gap:4px;flex-wrap:wrap;border-bottom:1px solid #1E3A5F">'
      +'<button data-f="all"    onclick="_bhlAmzFilter(\'all\',this)"    style="padding:4px 9px;border-radius:20px;border:1px solid #FF9900;background:#FF9900;color:#000;font-size:11px;font-weight:700;cursor:pointer">全て('+reviews.length+')</button>'
      +'<button data-f="pos"    onclick="_bhlAmzFilter(\'pos\',this)"    style="padding:4px 9px;border-radius:20px;border:1px solid #22C55E;background:transparent;color:#22C55E;font-size:11px;cursor:pointer">良い('+posC+')</button>'
      +'<button data-f="neu"    onclick="_bhlAmzFilter(\'neu\',this)"    style="padding:4px 9px;border-radius:20px;border:1px solid #94A3B8;background:transparent;color:#94A3B8;font-size:11px;cursor:pointer">普通('+neuC+')</button>'
      +'<button data-f="neg"    onclick="_bhlAmzFilter(\'neg\',this)"    style="padding:4px 9px;border-radius:20px;border:1px solid #FF4B4B;background:transparent;color:#FF4B4B;font-size:11px;cursor:pointer">悪い('+negC+')</button>'
      +'<button data-f="vine"   onclick="_bhlAmzFilter(\'vine\',this)"   style="padding:4px 9px;border-radius:20px;border:1px solid #8B5CF6;background:transparent;color:#C4B5FD;font-size:11px;cursor:pointer">Vine('+vineC+')</button>'
      +'<button data-f="novine" onclick="_bhlAmzFilter(\'novine\',this)" style="padding:4px 9px;border-radius:20px;border:1px solid #06B6D4;background:transparent;color:#67E8F9;font-size:11px;cursor:pointer">非Vine('+noVine.length+')</button>'
      +'<button onclick="_bhlAmzCSV(window._bhlAmzAllReviews)" style="margin-left:auto;padding:4px 9px;border-radius:20px;border:1px solid #3B82F6;background:transparent;color:#3B82F6;font-size:11px;cursor:pointer">📥 CSV</button></div>'

      /* リスト */
      +'<div id="_bhl_amz_list" style="padding:8px 16px 16px">'+listHTML+'</div>'

      +'<div style="padding:10px 16px;background:#162032;border-top:1px solid #1E3A5F;border-radius:0 0 12px 12px;text-align:center;font-size:11px;color:#475569">'
      +(reviews.length>300?reviews.length+'件中300件表示。全件はCSVで確認できます。':'全'+reviews.length+'件を表示中')+'</div>';

    document.body.appendChild(panel);
    window._bhlAmzAllReviews = reviews;
  }

  /* ── 総ページ数推定 ── */
  function estimateTotalPages() {
    var max = 1;
    document.querySelectorAll('.a-pagination li').forEach(function(li) {
      var n = parseInt(li.textContent.trim());
      if (!isNaN(n) && n > max) max = n;
    });
    if (max > 1) return max;
    var t = document.body.innerText.match(/(\d+)\s*件のカスタマーレビュー/);
    if (t) return Math.ceil(parseInt(t[1]) / 10);
    var t2 = document.body.innerText.match(/(\d[\d,]*)\s*件の評価/);
    if (t2) return Math.ceil(parseInt(t2[1].replace(/,/g,'')) / 10);
    return 15;
  }

  /* ── メイン ── */
  window._bhlAmzRunning = true;
  var allReviews = parseReviews(document);
  var ptEl = document.querySelector('#productTitle, h1.a-size-large');
  var productTitle = ptEl ? ptEl.textContent.trim() : 'ASIN: ' + asin;
  var totalPages = estimateTotalPages();
  upsertProgress(1, totalPages, allReviews.length);

  var baseUrl = 'https://www.amazon.co.jp/product-reviews/' + asin + '/?sortBy=recent&pageNumber=';

  function fetchPage(page) {
    if (!window._bhlAmzRunning) return;
    if (page > totalPages + 2) { finish(); return; }

    fetch(baseUrl + page, { credentials: 'include' })
      .then(function(res) { return res.text(); })
      .then(function(html) {
        if (!window._bhlAmzRunning) return;
        var doc = (new DOMParser()).parseFromString(html, 'text/html');
        var revs = parseReviews(doc);
        if (revs.length === 0) { finish(); return; }
        allReviews = allReviews.concat(revs);
        upsertProgress(page, totalPages, allReviews.length);
        setTimeout(function() { fetchPage(page + 1); }, 300);
      })
      .catch(function() { finish(); });
  }

  function finish() {
    window._bhlAmzRunning = false;
    var pages = Math.ceil(allReviews.length / 10) || 1;
    showPanel(allReviews, pages, productTitle);
    playDone();
    var vc = allReviews.filter(function(r){ return r.vine; }).length;
    setTimeout(function() {
      alert('✅ レビュー取得完了！\n\n合計 ' + allReviews.length + ' 件\nうち Amazon Vine: ' + vc + ' 件\n\n「📥 CSV」でダウンロードしてClaudeにアップロードしてください。');
    }, 500);
  }

  if (totalPages >= 2) {
    fetchPage(2);
  } else {
    finish();
  }

})();
