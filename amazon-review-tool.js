/* Amazon レビュー取得ツール v8.5-debug — bh life */
(function () {
  'use strict';

  var url = location.href, asin = null, m;
  m = url.match(/\/dp\/([A-Z0-9]{10})/i);            if (m) asin = m[1].toUpperCase();
  if (!asin) { m = url.match(/\/gp\/product\/([A-Z0-9]{10})/i);    if (m) asin = m[1].toUpperCase(); }
  if (!asin) { m = url.match(/\/product-reviews\/([A-Z0-9]{10})/i); if (m) asin = m[1].toUpperCase(); }
  if (!asin) { alert('Amazonの商品ページまたはレビューページで実行してください'); return; }
  if (url.indexOf('/product-reviews/') < 0) {
    location.href = 'https://www.amazon.co.jp/product-reviews/' + asin + '/?sortBy=recent&pageNumber=1';
    return;
  }

  /* ── デバッグ：ページ上の情報を収集してアラート ── */
  var debug = [];

  /* 1: ページネーションリンク */
  var paginationLinks = document.querySelectorAll('a[href*="pageNumber"]');
  debug.push('=== pageNumberリンク: ' + paginationLinks.length + '件 ===');
  for (var i = 0; i < Math.min(paginationLinks.length, 5); i++) {
    debug.push(paginationLinks[i].getAttribute('href').slice(0, 100));
  }

  /* 2: nextPageTokenリンク */
  var tokenLinks = document.querySelectorAll('a[href*="nextPageToken"]');
  debug.push('=== nextPageTokenリンク: ' + tokenLinks.length + '件 ===');
  for (var j = 0; j < Math.min(tokenLinks.length, 3); j++) {
    debug.push(tokenLinks[j].getAttribute('href').slice(0, 100));
  }

  /* 3: フォーム */
  var forms = document.querySelectorAll('form');
  debug.push('=== フォーム: ' + forms.length + '件 ===');
  for (var k = 0; k < Math.min(forms.length, 5); k++) {
    var inputs = forms[k].querySelectorAll('input');
    var names = [];
    for (var l = 0; l < inputs.length; l++) { names.push(inputs[l].name + '=' + (inputs[l].value||'').slice(0,20)); }
    debug.push('form' + k + ': ' + names.join(', '));
  }

  /* 4: data属性にnextPageTokenを含む要素 */
  var allEls = document.querySelectorAll('*');
  var tokenDataCount = 0;
  var tokenDataSample = '';
  for (var ei = 0; ei < allEls.length && tokenDataCount < 3; ei++) {
    for (var ai = 0; ai < allEls[ei].attributes.length; ai++) {
      var av = allEls[ei].attributes[ai].value;
      if (av.indexOf('nextPageToken') >= 0) {
        tokenDataCount++;
        tokenDataSample += '\n' + allEls[ei].tagName + '[' + allEls[ei].attributes[ai].name + ']: ' + av.slice(0, 80);
      }
    }
  }
  debug.push('=== data属性のnextPageToken: ' + tokenDataCount + '件 ===' + tokenDataSample);

  /* 5: .a-pagination の存在 */
  var pagination = document.querySelector('.a-pagination');
  debug.push('=== .a-pagination: ' + (pagination ? 'あり→' + pagination.innerHTML.slice(0, 100) : 'なし') + ' ===');

  /* 6: li.a-last */
  var lastLi = document.querySelector('li.a-last');
  debug.push('=== li.a-last: ' + (lastLi ? lastLi.innerHTML.slice(0, 100) : 'なし') + ' ===');

  /* 7: レビュー件数 */
  var reviews = document.querySelectorAll('[data-hook="review"]');
  debug.push('=== レビュー要素数: ' + reviews.length + ' ===');

  /* 8: scriptにnextPageToken */
  var scripts = document.querySelectorAll('script');
  var scriptTokenCount = 0;
  for (var si = 0; si < scripts.length; si++) {
    if ((scripts[si].textContent||'').indexOf('nextPageToken') >= 0) {
      scriptTokenCount++;
      debug.push('script' + si + '例: ' + (scripts[si].textContent||'').match(/nextPageToken.{0,60}/)[0]);
    }
  }
  debug.push('=== scriptのnextPageToken: ' + scriptTokenCount + '件 ===');

  alert('【デバッグ情報】\n\n' + debug.join('\n'));

})();
