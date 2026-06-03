/* amazon-review-tool.js  v10.1
   M-MODE Amazon レビュー収集ツール
   変更点 v10.1:
   - CSPブロック回避：script要素でのロードをやめ、fetch+evalで実行する方式を廃止
     → ブックマークレット自体がすでにAmazonドメイン上で動いているので問題ないはず
   - 「何も起きない」デバッグ用：実行開始をalertで通知（確認後に削除可）
   - Object.values()をMath.max.apply()対応に変更（念のため）
   - startCollect冒頭にalert追加でどこまで動いているか確認
*/

(function(){
  var GAS_URL = 'https://script.google.com/macros/s/AKfycbyX-zgbwe6pWC5GIQpAmbK7IqTkP9QuHdzBh9j9rcVlBmJxfrEFuNVTpN8PaaJp4SQb/exec';
  var MAX_PAGES = 100;
  var REQ_INTERVAL = 1000;

  /* ── 二重起動防止 ── */
  if(window._bhlAmzRunning){
    if(confirm('取得中です。中断しますか？')){window._bhlAmzRunning=false;}
    return;
  }

  /* ── 起動確認（デバッグ用） ── */
  alert('🔧 Amazonレビューツール v10.1 起動確認\n\nこのアラートが出たらスクリプト読み込みOKです。\nOKを押して認証に進みます。');

  /* ── 認証 ── */
  var email = (localStorage.getItem('_bhlAmzEmail')||'').trim();
  if(!email){
    email = (prompt('登録メールアドレスを入力してください')||'').trim();
    if(!email) return;
  }

  fetch(GAS_URL+'?tool=amazon&email='+encodeURIComponent(email))
    .then(function(r){return r.json();})
    .then(function(d){
      if(d.ok){
        localStorage.setItem('_bhlAmzEmail', email);
        startCollect();
      } else {
        localStorage.removeItem('_bhlAmzEmail');
        alert('❌ 認証失敗：'+email+'\n登録メールアドレスをご確認ください。');
      }
    })
    .catch(function(e){
      alert('❌ 認証サーバーエラー\n'+e.message+'\n\nF12コンソールでエラーを確認してください。');
    });

  function startCollect(){
    var asin = location.pathname.match(/\/(?:product-reviews|dp|gp\/product)\/([A-Z0-9]{10})/);
    if(!asin){alert('Amazon商品ページ（レビューページ）で実行してください。\n現在のURL: '+location.href);return;}
    asin = asin[1];

    var productTitle = document.querySelector('[data-hook="product-link"]')
                    || document.querySelector('.a-text-bold');
    productTitle = productTitle ? productTitle.textContent.trim() : asin;

    window._bhlAmzRunning = true;
    var allReviews = [];
    var seenKeys = {};
    var pageCount = 0;

    showProgress(0, 0);

    /* 1ページ目：現在のDOMから直接パース */
    var firstRevs = parseReviews(document);
    firstRevs.forEach(function(r){
      var k = r.title+'|'+r.date;
      if(!seenKeys[k]){seenKeys[k]=1; allReviews.push(r);}
    });
    pageCount = 1;
    updateProgress(pageCount, allReviews.length);

    var nextUrl = getNextUrl(document);
    if(nextUrl){
      fetchNext(nextUrl);
    } else {
      finish();
    }

    function fetchNext(url){
      if(!window._bhlAmzRunning || pageCount >= MAX_PAGES){finish();return;}
      if(url.startsWith('/')){url = 'https://www.amazon.co.jp' + url;}

      fetch(url, {credentials:'include'})
        .then(function(res){
          if(!res.ok) throw new Error('HTTP '+res.status);
          return res.text();
        })
        .then(function(html){
          if(!window._bhlAmzRunning) return;
          var doc = (new DOMParser()).parseFromString(html, 'text/html');
          var revs = parseReviews(doc);
          var added = 0;
          revs.forEach(function(r){
            var k = r.title+'|'+r.date;
            if(!seenKeys[k]){seenKeys[k]=1; allReviews.push(r); added++;}
          });
          pageCount++;
          updateProgress(pageCount, allReviews.length);

          var next = getNextUrl(doc);
          if(next && added > 0){
            setTimeout(function(){fetchNext(next);}, REQ_INTERVAL);
          } else {
            finish();
          }
        })
        .catch(function(e){
          console.warn('fetch error:', e);
          finish();
        });
    }

    function finish(){
      window._bhlAmzRunning = false;
      removeProgress();
      showPanel(allReviews, productTitle);
      playDone();
      var vc = allReviews.filter(function(r){return r.vine;}).length;
      setTimeout(function(){
        alert('✅ レビュー取得完了！\n\n合計 '+allReviews.length+' 件\n├ Vine（Amazonで購入なし）: '+vc+' 件\n└ 非Vine（Amazonで購入）: '+(allReviews.length-vc)+' 件');
      }, 500);
    }
  }

  /* ── 次ページURL取得 ── */
  function getNextUrl(doc){
    /* パターン1: li.a-last > a（標準ページネーション） */
    var lastLi = doc.querySelector('li.a-last');
    if(lastLi && !lastLi.classList.contains('a-disabled')){
      var a = lastLi.querySelector('a');
      if(a && a.getAttribute('href')) return a.getAttribute('href');
    }

    /* パターン2: pagination-bar内の最大pageNumberリンク */
    var curPage = 1;
    var cm = location.href.match(/pageNumber=(\d+)/);
    if(cm) curPage = parseInt(cm[1]);

    var allLinks = doc.querySelectorAll('a[href*="pageNumber="]');
    var maxPage = curPage, bestHref = null;
    for(var i=0;i<allLinks.length;i++){
      var lh = allLinks[i].getAttribute('href')||'';
      var m = lh.match(/pageNumber=(\d+)/);
      if(m){
        var pg = parseInt(m[1]);
        if(pg > maxPage){ maxPage = pg; bestHref = lh; }
      }
    }
    if(bestHref) return bestHref;

    /* パターン3: 次のpageNumber = curPage+1 を直接構築 */
    var base = 'https://www.amazon.co.jp/product-reviews/';
    var asinM = location.pathname.match(/\/(?:product-reviews|dp)\/([A-Z0-9]{10})/);
    if(asinM){
      return '/product-reviews/'+asinM[1]+'/?sortBy=recent&pageNumber='+(curPage+1);
    }

    return null;
  }

  /* ── レビューパース ── */
  function parseReviews(doc){
    var items = doc.querySelectorAll('[data-hook="review"]');
    var results = [];
    for(var i=0;i<items.length;i++){
      var el = items[i];

      var starEl = el.querySelector('[class*="a-star-"]');
      var star = 0;
      if(starEl){
        var sc = starEl.className.match(/a-star-(\d)/);
        if(sc) star = parseInt(sc[1]);
      }
      if(!star){
        var altEl = el.querySelector('.a-icon-alt');
        if(altEl){var am=altEl.textContent.match(/(\d)/);if(am)star=parseInt(am[1]);}
      }

      var titleEl = el.querySelector('[data-hook="review-title"] span:not(.a-icon-alt)');
      var title = titleEl ? titleEl.textContent.trim() : '';
      if(!title){
        var te2 = el.querySelector('[data-hook="review-title"]');
        if(te2) title = te2.textContent.replace(/[★☆\d\.]+\s*out of.*?stars?\s*/i,'').trim();
      }

      var bodyEl = el.querySelector('[data-hook="review-body"] span');
      var body = bodyEl ? bodyEl.textContent.trim() : '';

      var dateEl = el.querySelector('[data-hook="review-date"]');
      var dateRaw = dateEl ? dateEl.textContent.trim() : '';
      var dateStr = '';
      var dm = dateRaw.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
      if(dm) dateStr = dm[1]+'/'+(dm[2].length<2?'0':'')+dm[2]+'/'+(dm[3].length<2?'0':'')+dm[3];

      var verified = el.querySelector('[data-hook="avp-badge"]');
      var vine = !verified;

      var varEl = el.querySelector('[data-hook="format-strip"]');
      var variant = varEl ? varEl.textContent.trim() : '';

      results.push({star:star, title:title, body:body, date:dateStr, vine:vine, variant:variant});
    }
    return results;
  }

  /* ── プログレス ── */
  function showProgress(pages, count){
    var old = document.getElementById('_bhlAmzProg');
    if(old) old.remove();
    var div = document.createElement('div');
    div.id = '_bhlAmzProg';
    div.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#232f3e;color:#fff;'
      +'padding:12px 18px;border-radius:8px;font-size:13px;z-index:99999;'
      +'box-shadow:0 4px 12px rgba(0,0,0,.4);min-width:200px;';
    div.innerHTML = '<div style="font-weight:700;margin-bottom:4px;">🔄 Amazon レビュー取得中…</div>'
      +'<div id="_bhlAmzProgTxt">ページ '+pages+' / 件数 '+count+'</div>'
      +'<div style="margin-top:8px;font-size:11px;color:#aaa;">別タブで作業していただけます</div>';
    document.body.appendChild(div);
  }
  function updateProgress(pages, count){
    var txt = document.getElementById('_bhlAmzProgTxt');
    if(txt) txt.textContent = 'ページ '+pages+' / 件数 '+count;
  }
  function removeProgress(){
    var el = document.getElementById('_bhlAmzProg');
    if(el) el.remove();
  }

  /* ── 結果パネル ── */
  function showPanel(reviews, productTitle){
    var old = document.getElementById('_bhlAmzPanel');
    if(old) old.remove();

    var activeStarFilter = 'all';
    var activeVineFilter = 'all';

    var panel = document.createElement('div');
    panel.id = '_bhlAmzPanel';
    panel.style.cssText = 'position:fixed;top:0;right:0;width:480px;height:100vh;'
      +'background:#fff;box-shadow:-4px 0 20px rgba(0,0,0,.2);z-index:99998;'
      +'overflow-y:auto;font-family:sans-serif;font-size:13px;';

    var totalVine = reviews.filter(function(r){return r.vine;}).length;
    var totalNonVine = reviews.length - totalVine;
    var avgAll = reviews.length ? (reviews.reduce(function(s,r){return s+r.star;},0)/reviews.length).toFixed(2) : '-';
    var avgNV = totalNonVine ? (reviews.filter(function(r){return !r.vine;}).reduce(function(s,r){return s+r.star;},0)/totalNonVine).toFixed(2) : '-';

    panel.innerHTML =
      '<div style="background:#232f3e;color:#fff;padding:14px 16px;position:sticky;top:0;z-index:10;">'
        +'<div style="display:flex;justify-content:space-between;align-items:center;">'
          +'<span style="font-weight:700;font-size:14px;">📊 Amazonレビュー分析</span>'
          +'<button id="_bhlAmzClose" style="background:none;border:none;color:#fff;font-size:20px;cursor:pointer;">✕</button>'
        +'</div>'
        +'<div style="font-size:11px;margin-top:4px;opacity:.8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+escH(productTitle)+'</div>'
      +'</div>'
      +'<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:6px;padding:12px;">'
        +statCard('総件数', reviews.length+'件')
        +statCard('平均★(全体)', avgAll)
        +statCard('非Vine平均★', avgNV)
        +statCard('Vine件数', totalVine+'件')
      +'</div>'
      +'<div style="padding:0 12px 8px;">'
        +'<div style="font-weight:700;margin-bottom:6px;">⭐ 星別分布</div>'
        +'<div id="_bhlAmzStarDist"></div>'
      +'</div>'
      +'<div style="padding:0 12px 8px;">'
        +'<div style="font-weight:700;margin-bottom:6px;">📅 月別レビュー数</div>'
        +'<div id="_bhlAmzMonthChart" style="overflow-x:auto;"></div>'
      +'</div>'
      +'<div style="padding:0 12px 8px;display:flex;gap:6px;flex-wrap:wrap;">'
        +'<div><span style="font-size:11px;color:#666;">星フィルタ：</span>'
          +'<button class="_bhlStarBtn" data-v="all" style="'+btnStyle(true)+'">すべて</button>'
          +'<button class="_bhlStarBtn" data-v="good" style="'+btnStyle(false)+'">★5・4</button>'
          +'<button class="_bhlStarBtn" data-v="mid" style="'+btnStyle(false)+'">★3</button>'
          +'<button class="_bhlStarBtn" data-v="bad" style="'+btnStyle(false)+'">★2・1</button>'
        +'</div>'
        +'<div><span style="font-size:11px;color:#666;">種別：</span>'
          +'<button class="_bhlVineBtn" data-v="all" style="'+btnStyle(true)+'">すべて</button>'
          +'<button class="_bhlVineBtn" data-v="nonvine" style="'+btnStyle(false)+'">非Vine</button>'
          +'<button class="_bhlVineBtn" data-v="vine" style="'+btnStyle(false)+'">Vine</button>'
        +'</div>'
      +'</div>'
      +'<div style="padding:0 12px 4px;display:flex;justify-content:space-between;align-items:center;">'
        +'<span id="_bhlAmzCount" style="font-size:12px;color:#666;"></span>'
        +'<button id="_bhlAmzCsv" style="background:#ff9900;color:#fff;border:none;border-radius:4px;padding:5px 10px;cursor:pointer;font-size:12px;">📥 CSVダウンロード</button>'
      +'</div>'
      +'<div id="_bhlAmzList" style="padding:0 12px 80px;"></div>';

    document.body.appendChild(panel);
    document.getElementById('_bhlAmzClose').onclick = function(){panel.remove();};

    renderStarDist(reviews);
    renderMonthChart(reviews);

    function renderList(){
      var filtered = reviews.filter(function(r){
        var starOk = activeStarFilter==='all'
          || (activeStarFilter==='good' && r.star>=4)
          || (activeStarFilter==='mid' && r.star===3)
          || (activeStarFilter==='bad' && r.star<=2);
        var vineOk = activeVineFilter==='all'
          || (activeVineFilter==='vine' && r.vine)
          || (activeVineFilter==='nonvine' && !r.vine);
        return starOk && vineOk;
      });
      document.getElementById('_bhlAmzCount').textContent = filtered.length+'件表示中';
      var html = filtered.map(function(r){
        return '<div style="border-bottom:1px solid #eee;padding:8px 0;">'
          +'<div style="display:flex;gap:6px;align-items:center;margin-bottom:3px;">'
            +'<span style="color:#ff9900;">'+('★'.repeat(r.star))+'</span>'
            +'<span style="font-size:11px;color:#666;">'+escH(r.date)+'</span>'
            +(r.vine ? '<span style="background:#e8f4fd;color:#2874a6;font-size:10px;padding:1px 5px;border-radius:3px;">Vine</span>'
                     : '<span style="background:#e8f5e9;color:#27ae60;font-size:10px;padding:1px 5px;border-radius:3px;">購入済</span>')
          +'</div>'
          +'<div style="font-weight:700;margin-bottom:2px;">'+escH(r.title)+'</div>'
          +(r.variant ? '<div style="font-size:11px;color:#888;margin-bottom:2px;">'+escH(r.variant)+'</div>' : '')
          +'<div style="color:#333;line-height:1.5;">'+escH(r.body)+'</div>'
        +'</div>';
      }).join('');
      document.getElementById('_bhlAmzList').innerHTML = html || '<div style="color:#999;padding:20px 0;text-align:center;">該当するレビューがありません</div>';

      document.getElementById('_bhlAmzCsv').onclick = function(){
        var rows = [['星','タイトル','本文','日付','種別','バリアント']];
        filtered.forEach(function(r){
          rows.push([r.star, r.title, r.body, r.date, r.vine?'Vine':'非Vine', r.variant]);
        });
        var csv = '\uFEFF'+rows.map(function(r){
          return r.map(function(c){return '"'+(String(c).replace(/"/g,'""'))+'"';}).join(',');
        }).join('\n');
        var a = document.createElement('a');
        a.href = 'data:text/csv;charset=utf-8,'+encodeURIComponent(csv);
        a.download = 'amazon_reviews_'+new Date().toISOString().slice(0,10)+'.csv';
        a.click();
      };
    }

    panel.querySelectorAll('._bhlStarBtn').forEach(function(btn){
      btn.onclick = function(){
        activeStarFilter = btn.dataset.v;
        panel.querySelectorAll('._bhlStarBtn').forEach(function(b){b.style.cssText=btnStyle(false);});
        btn.style.cssText = btnStyle(true);
        renderList();
      };
    });
    panel.querySelectorAll('._bhlVineBtn').forEach(function(btn){
      btn.onclick = function(){
        activeVineFilter = btn.dataset.v;
        panel.querySelectorAll('._bhlVineBtn').forEach(function(b){b.style.cssText=btnStyle(false);});
        btn.style.cssText = btnStyle(true);
        renderList();
      };
    });

    renderList();
  }

  function renderStarDist(reviews){
    var counts = {5:0,4:0,3:0,2:0,1:0};
    var vcounts = {5:0,4:0,3:0,2:0,1:0};
    reviews.forEach(function(r){
      if(counts[r.star]!==undefined){counts[r.star]++;if(!r.vine)vcounts[r.star]++;}
    });
    /* Object.values()の代わりに配列で最大値取得 */
    var vals = [counts[1],counts[2],counts[3],counts[4],counts[5]];
    var max = Math.max.apply(null, vals) || 1;
    var colors = {5:'#4CAF50',4:'#8BC34A',3:'#FFC107',2:'#FF7043',1:'#F44336'};
    var html = [5,4,3,2,1].map(function(s){
      var w = Math.round(counts[s]/max*100);
      return '<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">'
        +'<span style="width:20px;text-align:right;font-size:12px;">★'+s+'</span>'
        +'<div style="flex:1;background:#f0f0f0;border-radius:3px;height:14px;">'
          +'<div style="width:'+w+'%;background:'+colors[s]+';height:100%;border-radius:3px;"></div>'
        +'</div>'
        +'<span style="width:60px;font-size:11px;color:#666;">'+counts[s]+'件（非Vine:'+vcounts[s]+'）</span>'
      +'</div>';
    }).join('');
    var el = document.getElementById('_bhlAmzStarDist');
    if(el) el.innerHTML = html;
  }

  function renderMonthChart(reviews){
    var months = {};
    reviews.forEach(function(r){
      if(!r.date) return;
      var ym = r.date.slice(0,7);
      months[ym] = (months[ym]||0)+1;
    });
    var keys = Object.keys(months).sort();
    if(!keys.length) return;
    /* Object.values()の代わり */
    var mvals = keys.map(function(k){return months[k];});
    var maxV = Math.max.apply(null, mvals);
    var barW = Math.max(20, Math.min(40, Math.floor(340/keys.length)));
    var html = '<div style="display:flex;align-items:flex-end;gap:2px;height:80px;padding-bottom:18px;">';
    keys.forEach(function(k){
      var h = Math.round(months[k]/maxV*60);
      html += '<div style="display:flex;flex-direction:column;align-items:center;width:'+barW+'px;">'
        +'<div title="'+k+': '+months[k]+'件" style="width:'+(barW-2)+'px;height:'+h+'px;background:#FF9900;border-radius:2px 2px 0 0;"></div>'
        +'<div style="font-size:9px;color:#666;transform:rotate(-45deg);transform-origin:left;margin-top:2px;white-space:nowrap;">'+k.slice(2)+'</div>'
      +'</div>';
    });
    html += '</div>';
    var el = document.getElementById('_bhlAmzMonthChart');
    if(el) el.innerHTML = html;
  }

  function statCard(label, value){
    return '<div style="background:#f5f5f5;border-radius:6px;padding:8px;text-align:center;">'
      +'<div style="font-size:10px;color:#999;">'+label+'</div>'
      +'<div style="font-size:15px;font-weight:700;color:#222;">'+value+'</div>'
    +'</div>';
  }
  function btnStyle(active){
    return 'border:1px solid '+(active?'#ff9900':'#ccc')+';background:'+(active?'#ff9900':'#fff')
      +';color:'+(active?'#fff':'#333')+';border-radius:4px;padding:3px 8px;cursor:pointer;font-size:12px;margin:1px;';
  }
  function escH(s){
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function playDone(){
    try{
      var ctx=new(window.AudioContext||window.webkitAudioContext)();
      [523,659,784].forEach(function(f,i){
        var o=ctx.createOscillator(),g=ctx.createGain();
        o.connect(g);g.connect(ctx.destination);
        o.frequency.value=f;g.gain.setValueAtTime(0.3,ctx.currentTime+i*0.15);
        g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+i*0.15+0.3);
        o.start(ctx.currentTime+i*0.15);o.stop(ctx.currentTime+i*0.15+0.3);
      });
    }catch(e){}
  }
})();
