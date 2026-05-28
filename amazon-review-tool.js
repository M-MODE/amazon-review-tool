/* Amazon レビュー取得ツール v1.0 — bh life
 * GitHub Pages: https://m-mode.github.io/amazon-review-tool/amazon-review-tool.js
 * ブックマークレット経由で Amazon の商品ページ / レビューページ上で実行
 */
(function () {
  'use strict';

  /* ── 既に開いていたら閉じる ── */
  var existing = document.getElementById('_bhl_amz');
  if (existing) { existing.remove(); return; }

  /* ── ASIN を URL から取得 ── */
  var url = location.href;
  var asin = null;
  var m;

  // /dp/{ASIN}
  m = url.match(/\/dp\/([A-Z0-9]{10})/i);
  if (m) asin = m[1].toUpperCase();

  // /gp/product/{ASIN}
  if (!asin) {
    m = url.match(/\/gp\/product\/([A-Z0-9]{10})/i);
    if (m) asin = m[1].toUpperCase();
  }

  // /product-reviews/{ASIN}
  if (!asin) {
    m = url.match(/\/product-reviews\/([A-Z0-9]{10})/i);
    if (m) asin = m[1].toUpperCase();
  }

  // /ASIN/{ASIN}（一部のURL形式）
  if (!asin) {
    m = url.match(/\/ASIN\/([A-Z0-9]{10})/i);
    if (m) asin = m[1].toUpperCase();
  }

  if (!asin) {
    alert('Amazonの商品ページまたはレビューページで実行してください\n\n例: https://www.amazon.co.jp/dp/XXXXXXXXXX');
    return;
  }

  /* ── ネガティブキーワード辞書 ── */
  var NEG = {
    '品質不良':       ['壊れ','破損','不良品','欠陥','粗悪','チープ','すぐ壊れ','割れ','傷','錆','臭い','カビ','ひどい','変形','曲がっ','剥が','切れ','折れ','ゆるい','ガタ'],
    'サイズ・仕様違い': ['サイズが違','写真と違','説明と違','思ったより小さ','思ったより大き','色が違','イメージと違','思っていたより','想像より','コンパクトすぎ','大きすぎ'],
    '梱包・配送':     ['梱包が悪','梱包が雑','配送が遅','遅延','破損して届','潰れ','濡れ','箱が潰','封が開','雑に','丁寧でない'],
    'Amazon対応':    ['対応が悪','返信','無視','クレーム','返品','交換できない','サポート','問い合わせ','キャンセル','偽物','中古'],
    '総合不満':       ['最悪','最低','失望','がっかり','期待外れ','不満','残念','使えない','二度と','騙され','お金の無駄','クオリティ低','安物','ゴミ'],
  };

  /* ── ポジティブキーワード辞書 ── */
  var POS_KEYWORDS = ['良い','素晴らしい','最高','おすすめ','気に入っ','満足','ちょうどいい','丁寧','しっかり','使いやす','綺麗','かわいい','便利','コスパ','品質がいい','リピート','また買'];

  function classify(text, rating) {
    var cats = {}, k, hits;
    for (k in NEG) {
      hits = NEG[k].filter(function (w) { return text.indexOf(w) >= 0; });
      if (hits.length) cats[k] = hits;
    }
    var isNeg = (rating <= 2) || Object.keys(cats).length > 0;
    var isPos = !isNeg && rating >= 4;
    var label = isNeg ? 'ネガティブ' : (isPos ? 'ポジティブ' : 'ニュートラル');
    var color = isNeg ? '#FF4B4B' : (isPos ? '#22C55E' : '#94A3B8');
    return { neg: isNeg, pos: isPos, cats: cats, label: label, color: color };
  }

  /* ── ページ上のレビューを読み取る ── */
  function scrapeCurrentPageReviews() {
    var reviews = [];

    // Amazon のレビューコンテナ（複数のクラス名に対応）
    var reviewEls = document.querySelectorAll(
      '[data-hook="review"], .review, .cr-review, [id^="customer_review"]'
    );

    reviewEls.forEach(function (el) {
      // 評価
      var ratingEl = el.querySelector('[data-hook="review-star-rating"] .a-icon-alt, .review-rating .a-icon-alt, [class*="star-rating"] .a-icon-alt');
      var ratingText = ratingEl ? ratingEl.textContent : '';
      var ratingMatch = ratingText.match(/(\d+(\.\d+)?)/);
      var rating = ratingMatch ? parseFloat(ratingMatch[1]) : 0;

      // タイトル
      var titleEl = el.querySelector('[data-hook="review-title"] span:not([class]), [data-hook="review-title"]');
      var title = titleEl ? titleEl.textContent.trim() : '';

      // 本文
      var bodyEl = el.querySelector('[data-hook="review-body"] span, .review-text span, .review-text');
      var body = bodyEl ? bodyEl.textContent.trim() : '';

      // 日付
      var dateEl = el.querySelector('[data-hook="review-date"]');
      var date = dateEl ? dateEl.textContent.replace('日本でレビュー済み -', '').trim() : '';

      // レビューID
      var reviewId = el.id || el.getAttribute('data-hook-id') || Math.random().toString(36).substr(2, 9);

      // 役立ち票
      var helpfulEl = el.querySelector('[data-hook="helpful-vote-statement"]');
      var helpful = helpfulEl ? helpfulEl.textContent.trim() : '';

      if (body || title) {
        var fullText = title + ' ' + body;
        var cls = classify(fullText, rating);
        reviews.push({
          id: reviewId,
          rating: rating,
          title: title,
          body: body,
          date: date,
          helpful: helpful,
          cls: cls,
        });
      }
    });

    return reviews;
  }

  /* ── 商品名を取得 ── */
  function getProductTitle() {
    var el = document.querySelector('#productTitle, .product-title-word-break, h1.a-size-large');
    return el ? el.textContent.trim() : 'ASIN: ' + asin;
  }

  /* ── 星評価サマリーを取得 ── */
  function getRatingSummary() {
    var avgEl = document.querySelector('[data-hook="average-star-rating"] .a-icon-alt, #averageCustomerReviews .a-icon-alt, .reviewCountTextLinkedHistogram .a-icon-alt');
    var avg = avgEl ? (avgEl.textContent.match(/(\d+(\.\d+)?)/) || [null, '?'])[1] : '?';

    var totalEl = document.querySelector('[data-hook="total-review-count"], #acrCustomerReviewText');
    var total = totalEl ? totalEl.textContent.replace(/[^0-9,]/g, '') : '?';

    return { avg: avg, total: total };
  }

  /* ── パネル構築 ── */
  var reviews = scrapeCurrentPageReviews();
  var productTitle = getProductTitle();
  var ratingSummary = getRatingSummary();

  /* 統計 */
  var negCount  = reviews.filter(function (r) { return r.cls.neg; }).length;
  var posCount  = reviews.filter(function (r) { return r.cls.pos; }).length;
  var neuCount  = reviews.length - negCount - posCount;
  var avgRating = reviews.length > 0
    ? (reviews.reduce(function (s, r) { return s + r.rating; }, 0) / reviews.length).toFixed(1)
    : '?';

  /* カテゴリ集計 */
  var catCounts = {};
  reviews.forEach(function (r) {
    Object.keys(r.cls.cats).forEach(function (cat) {
      catCounts[cat] = (catCounts[cat] || 0) + 1;
    });
  });

  /* ── パネル DOM 作成 ── */
  var panel = document.createElement('div');
  panel.id = '_bhl_amz';
  panel.style.cssText = [
    'position:fixed','top:16px','right:16px','z-index:2147483647',
    'width:440px','max-height:88vh','overflow-y:auto',
    'background:#0F172A','color:#E2E8F0',
    'border-radius:12px','box-shadow:0 8px 32px rgba(0,0,0,.6)',
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    'font-size:13px','line-height:1.5',
  ].join(';');

  /* ── フィルター状態 ── */
  var currentFilter = 'all';

  /* ── ヘッダー ── */
  var reviewPageUrl = 'https://www.amazon.co.jp/product-reviews/' + asin + '/?sortBy=recent&pageNumber=1';

  panel.innerHTML = [
    /* ヘッダー */
    '<div style="background:#1E3A5F;padding:14px 16px;border-radius:12px 12px 0 0;display:flex;align-items:center;gap:10px">',
      '<div style="background:#FF9900;border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">&#9733;</div>',
      '<div style="flex:1;min-width:0">',
        '<div style="font-weight:700;font-size:14px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="' + productTitle + '">' + productTitle + '</div>',
        '<div style="font-size:11px;color:#94A3B8;margin-top:2px">ASIN: ' + asin + ' &nbsp;|&nbsp; <a href="' + reviewPageUrl + '" target="_blank" style="color:#FF9900;text-decoration:none">全レビューを開く ↗</a></div>',
      '</div>',
      '<button id="_bhl_amz_close" style="background:none;border:none;color:#94A3B8;font-size:20px;cursor:pointer;padding:0 0 0 8px;line-height:1">&times;</button>',
    '</div>',

    /* サマリーカード */
    '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:12px 16px;background:#162032;border-bottom:1px solid #1E3A5F">',
      '<div style="text-align:center;background:#0F172A;padding:8px;border-radius:8px">',
        '<div style="font-size:20px;font-weight:700;color:#FF9900">' + avgRating + '</div>',
        '<div style="font-size:10px;color:#64748B;margin-top:2px">平均評価</div>',
      '</div>',
      '<div style="text-align:center;background:#0F172A;padding:8px;border-radius:8px">',
        '<div style="font-size:20px;font-weight:700;color:#22C55E">' + posCount + '</div>',
        '<div style="font-size:10px;color:#64748B;margin-top:2px">ポジティブ</div>',
      '</div>',
      '<div style="text-align:center;background:#0F172A;padding:8px;border-radius:8px">',
        '<div style="font-size:20px;font-weight:700;color:#94A3B8">' + neuCount + '</div>',
        '<div style="font-size:10px;color:#64748B;margin-top:2px">ニュートラル</div>',
      '</div>',
      '<div style="text-align:center;background:#0F172A;padding:8px;border-radius:8px">',
        '<div style="font-size:20px;font-weight:700;color:#FF4B4B">' + negCount + '</div>',
        '<div style="font-size:10px;color:#64748B;margin-top:2px">ネガティブ</div>',
      '</div>',
    '</div>',

    /* カテゴリ別ネガティブ集計（あれば表示） */
    Object.keys(catCounts).length > 0 ? [
      '<div style="padding:10px 16px;background:#1A0F0F;border-bottom:1px solid #2D1515">',
        '<div style="font-size:11px;font-weight:700;color:#FF4B4B;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em">⚠️ ネガティブ分類</div>',
        '<div style="display:flex;flex-wrap:wrap;gap:6px">',
          Object.keys(catCounts).map(function (cat) {
            return '<span style="background:#2D1515;color:#FCA5A5;padding:3px 8px;border-radius:20px;font-size:11px">' + cat + ' <strong>' + catCounts[cat] + '件</strong></span>';
          }).join(''),
        '</div>',
      '</div>',
    ].join('') : '',

    /* フィルターボタン */
    '<div style="padding:10px 16px;display:flex;gap:6px;border-bottom:1px solid #1E3A5F" id="_bhl_amz_filters">',
      '<button data-filter="all"    style="padding:5px 12px;border-radius:20px;border:1px solid #FF9900;background:#FF9900;color:#000;font-size:12px;font-weight:700;cursor:pointer">すべて (' + reviews.length + ')</button>',
      '<button data-filter="pos"    style="padding:5px 12px;border-radius:20px;border:1px solid #22C55E;background:transparent;color:#22C55E;font-size:12px;cursor:pointer">良い (' + posCount + ')</button>',
      '<button data-filter="neu"    style="padding:5px 12px;border-radius:20px;border:1px solid #94A3B8;background:transparent;color:#94A3B8;font-size:12px;cursor:pointer">普通 (' + neuCount + ')</button>',
      '<button data-filter="neg"    style="padding:5px 12px;border-radius:20px;border:1px solid #FF4B4B;background:transparent;color:#FF4B4B;font-size:12px;cursor:pointer">悪い (' + negCount + ')</button>',
    '</div>',

    /* レビューリスト */
    '<div id="_bhl_amz_list" style="padding:8px 16px 16px">',
    reviews.length === 0
      ? '<div style="text-align:center;padding:24px;color:#64748B">このページにレビューが見つかりません。<br>商品のレビューページを開いてから<br>再度実行してください。<br><br><a href="' + reviewPageUrl + '" target="_blank" style="color:#FF9900">レビューページを開く ↗</a></div>'
      : reviews.map(function (r) {
          var stars = '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating);
          var catTags = Object.keys(r.cls.cats).map(function (c) {
            return '<span style="background:#2D1515;color:#FCA5A5;padding:2px 6px;border-radius:10px;font-size:10px;margin-right:4px">' + c + '</span>';
          }).join('');
          return [
            '<div data-type="' + (r.cls.neg ? 'neg' : (r.cls.pos ? 'pos' : 'neu')) + '" style="border-left:3px solid ' + r.cls.color + ';padding:10px 10px 10px 12px;margin-top:8px;background:#162032;border-radius:0 6px 6px 0">',
              '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:4px">',
                '<div>',
                  '<span style="color:#FF9900;letter-spacing:1px;font-size:13px">' + stars + '</span>',
                  ' <span style="background:' + r.cls.color + '22;color:' + r.cls.color + ';font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px;vertical-align:middle">' + r.cls.label + '</span>',
                '</div>',
                '<span style="font-size:10px;color:#475569;white-space:nowrap">' + r.date + '</span>',
              '</div>',
              r.title ? '<div style="font-weight:600;color:#CBD5E1;margin-bottom:4px;font-size:12px">' + r.title + '</div>' : '',
              catTags ? '<div style="margin-bottom:5px">' + catTags + '</div>' : '',
              '<div style="color:#94A3B8;font-size:12px;line-height:1.6">' + r.body.replace(/\n/g, '<br>').substring(0, 300) + (r.body.length > 300 ? '<span style="color:#475569">…</span>' : '') + '</div>',
              r.helpful ? '<div style="margin-top:6px;font-size:10px;color:#475569">' + r.helpful + '</div>' : '',
            '</div>',
          ].join('');
        }).join(''),
    '</div>',

    /* フッター：次ページ誘導 */
    '<div style="padding:10px 16px;background:#162032;border-top:1px solid #1E3A5F;border-radius:0 0 12px 12px;text-align:center;font-size:11px;color:#475569">',
      'このページのレビューを表示中。次ページは <a href="' + reviewPageUrl + '" target="_blank" style="color:#FF9900;text-decoration:none">レビューページ ↗</a> で確認してください。',
    '</div>',
  ].join('');

  document.body.appendChild(panel);

  /* ── イベント：閉じる ── */
  document.getElementById('_bhl_amz_close').addEventListener('click', function () {
    panel.remove();
  });

  /* ── イベント：フィルター ── */
  var filterBtns = panel.querySelectorAll('#_bhl_amz_filters button');
  filterBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var filter = btn.getAttribute('data-filter');
      currentFilter = filter;

      /* ボタンスタイル切替 */
      filterBtns.forEach(function (b) {
        var f = b.getAttribute('data-filter');
        var colors = { all: '#FF9900', pos: '#22C55E', neu: '#94A3B8', neg: '#FF4B4B' };
        var c = colors[f];
        if (f === filter) {
          b.style.background = c;
          b.style.color = f === 'all' ? '#000' : '#fff';
        } else {
          b.style.background = 'transparent';
          b.style.color = c;
        }
      });

      /* レビュー表示切替 */
      var items = panel.querySelectorAll('#_bhl_amz_list [data-type]');
      items.forEach(function (item) {
        var type = item.getAttribute('data-type');
        if (filter === 'all') {
          item.style.display = '';
        } else if (filter === 'pos' && type === 'pos') {
          item.style.display = '';
        } else if (filter === 'neu' && type === 'neu') {
          item.style.display = '';
        } else if (filter === 'neg' && type === 'neg') {
          item.style.display = '';
        } else {
          item.style.display = 'none';
        }
      });
    });
  });

})();
