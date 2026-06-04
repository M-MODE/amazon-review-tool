/* Amazon レビューページ診断ツール */
(function(){
  var results = [];
  
  // 1. URL確認
  results.push('=== URL ===');
  results.push(location.href);
  
  // 2. ASIN検出
  var url = location.href, asin = null, m;
  m = url.match(/\/dp\/([A-Z0-9]{10})/i); if(m) asin = m[1];
  if(!asin){ m = url.match(/\/product-reviews\/([A-Z0-9]{10})/i); if(m) asin = m[1]; }
  results.push('\n=== ASIN ===');
  results.push(asin ? asin : '検出できず');
  
  // 3. レビュー要素の確認
  results.push('\n=== レビュー要素 ===');
  var hookReviews = document.querySelectorAll('[data-hook="review"]');
  results.push('data-hook="review": ' + hookReviews.length + '件');
  
  var cmReviews = document.querySelectorAll('.review');
  results.push('.review クラス: ' + cmReviews.length + '件');
  
  var reviewCards = document.querySelectorAll('[id^="customer_review"]');
  results.push('id^="customer_review": ' + reviewCards.length + '件');
  
  // 4. 各data-hook属性の確認
  results.push('\n=== data-hook属性 ===');
  var hooks = ['review', 'review-star-rating', 'review-title', 'review-body', 'review-date', 'cr-filter-info-review-rating-count'];
  hooks.forEach(function(h){
    var els = document.querySelectorAll('[data-hook="'+h+'"]');
    results.push('data-hook="'+h+'": ' + els.length + '件');
    if(els.length > 0 && els[0]){
      results.push('  → タグ: ' + els[0].tagName + ', クラス: ' + (els[0].className||'').substring(0,80));
      results.push('  → テキスト(先頭50文字): ' + (els[0].textContent||'').trim().substring(0,50));
    }
  });
  
  // 5. ページネーション確認
  results.push('\n=== ページネーション ===');
  var lastLink = document.querySelector('.a-pagination .a-last a') || document.querySelector('li.a-last a');
  results.push('.a-last a: ' + (lastLink ? lastLink.getAttribute('href') : 'なし'));
  
  var tokenLinks = document.querySelectorAll('a[href*="nextPageToken"]');
  results.push('nextPageTokenリンク: ' + tokenLinks.length + '件');
  if(tokenLinks.length > 0){
    results.push('  → href: ' + (tokenLinks[0].getAttribute('href')||'').substring(0,120));
  }
  
  var pageLinks = document.querySelectorAll('a[href*="pageNumber"]');
  results.push('pageNumberリンク: ' + pageLinks.length + '件');
  
  // 6. localStorage確認
  results.push('\n=== localStorage ===');
  var navKey = '_bhl_nav_';
  if(asin){
    var saved = localStorage.getItem(navKey + asin);
    results.push('保存データ: ' + (saved ? saved.length + '文字' : 'なし'));
  }
  
  // 7. ページ内の主要構造
  results.push('\n=== ページ構造 ===');
  results.push('#cm_cr-review_list: ' + (document.getElementById('cm_cr-review_list') ? 'あり' : 'なし'));
  results.push('#reviewsMedley: ' + (document.getElementById('reviewsMedley') ? 'あり' : 'なし'));
  results.push('.cr-widget-FocalReviews: ' + (document.querySelector('.cr-widget-FocalReviews') ? 'あり' : 'なし'));
  
  // 8. shadow DOM確認
  results.push('\n=== Shadow DOM ===');
  var allEls = document.querySelectorAll('*');
  var shadowCount = 0;
  for(var i=0; i<Math.min(allEls.length,5000); i++){
    if(allEls[i].shadowRoot) shadowCount++;
  }
  results.push('Shadow Root要素: ' + shadowCount + '件');
  
  // 結果表示
  var output = results.join('\n');
  console.log(output);
  
  // パネル表示
  var panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;top:10px;right:10px;z-index:2147483647;width:500px;max-height:80vh;overflow-y:auto;background:#0F172A;color:#E2E8F0;border-radius:12px;padding:16px;font-family:monospace;font-size:12px;white-space:pre-wrap;box-shadow:0 8px 32px rgba(0,0,0,.7)';
  panel.innerHTML = '<div style="display:flex;justify-content:space-between;margin-bottom:10px"><b style="color:#FF9900">Amazon レビューページ診断結果</b><button onclick="this.parentElement.parentElement.remove()" style="background:none;border:none;color:#94A3B8;font-size:18px;cursor:pointer">×</button></div><div style="display:flex;gap:8px;margin-bottom:10px"><button onclick="navigator.clipboard.writeText(document.getElementById(\'_diag_text\').textContent).then(function(){alert(\'コピーしました\')})" style="background:#3B82F6;border:none;color:#fff;padding:4px 12px;border-radius:4px;cursor:pointer;font-size:11px">📋 コピー</button></div><div id="_diag_text">' + output.replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</div>';
  document.body.appendChild(panel);
})();
