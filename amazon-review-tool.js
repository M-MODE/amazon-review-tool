/* Amazon レビュー取得ツール v9.1 — M-MODE
 * 星別フィルター方式：★5→★4→★3→★2→★1 の順にfetchで全件収集
 * 認証：Google Apps Script
 */
(function(){
  var GAS_URL = 'https://script.google.com/macros/s/AKfycbyX-zgbwe6pWC5GIQpAmbK7IqTkP9QuHdzBh9j9rcVlBmJxfrEFuNVTpN8PaaJp4SQb/exec';

  /* ── 二重起動防止 ── */
  if(window._bhlAmzRunning){
    if(confirm('取得中です。中断しますか？')){
      window._bhlAmzRunning = false;
      var pb = document.getElementById('_bhlAmzProg'); if(pb) pb.remove();
    }
    return;
  }

  /* ── ASIN取得 ── */
  var url = location.href, asin = null, m;
  m = url.match(/\/dp\/([A-Z0-9]{10})/i);             if(m) asin = m[1].toUpperCase();
  if(!asin){m = url.match(/\/gp\/product\/([A-Z0-9]{10})/i);    if(m) asin = m[1].toUpperCase();}
  if(!asin){m = url.match(/\/product-reviews\/([A-Z0-9]{10})/i); if(m) asin = m[1].toUpperCase();}
  if(!asin){alert('Amazonの商品ページまたはレビューページで実行してください'); return;}

  /* ── 認証 ── */
  var email = (localStorage.getItem('_bhlAmzEmail')||'').trim();
  if(!email){
    email = (prompt('登録メールアドレスを入力してください')||'').trim();
    if(!email) return;
  }
  fetch(GAS_URL+'?tool=amazon&email='+encodeURIComponent(email))
    .then(function(r){return r.json();})
    .then(function(d){
      if(d.ok){ localStorage.setItem('_bhlAmzEmail', email); run(); }
      else{ localStorage.removeItem('_bhlAmzEmail'); alert('❌ 認証失敗：'+email); }
    })
    .catch(function(){ alert('認証サーバーに接続できませんでした。'); });

  /* ════════════════════════════════════════
     メイン処理
  ════════════════════════════════════════ */
  function run(){
    var STAR_FILTERS = ['five_star','four_star','three_star','two_star','one_star'];
    var filterIndex  = 0;
    var allReviews   = [];
    var _fetchedUrls = {};
    var _seen        = {};
    var pageCount    = 0;
    var emptyCount   = 0;

    var ptEl = document.querySelector('[data-hook="product-link"]')
             || document.querySelector('#productTitle')
             || document.querySelector('h1.a-size-large');
    var productTitle = ptEl ? ptEl.textContent.trim() : 'ASIN: '+asin;

    window._bhlAmzRunning = true;
    showProg(0, 0);

    /* 星別フィルターURL生成 */
    function buildFilterUrl(filterName, page){
      return 'https://www.amazon.co.jp/product-reviews/'+asin
        +'/?sortBy=recent&pageNumber='+page
        +'&filterByStar='+filterName;
    }

    /* 次ページURL取得 */
    function getNextUrl(doc, cur){
      cur = cur||1;
      /* .a-last リンク */
      var lastA = doc.querySelector('.a-pagination .a-last a') || doc.querySelector('li.a-last a');
      if(lastA && !lastA.closest('li.a-disabled')){
        var h = lastA.getAttribute('href')||'';
        var pg = h.match(/pageNumber=(\d+)/);
        if(h && pg && parseInt(pg[1]) > cur) return h.startsWith('/')?'https://www.amazon.co.jp'+h:h;
      }
      /* nextPageToken付きリンクの最大ページ */
      var best=null, bestPg=cur;
      doc.querySelectorAll('a[href*="pageNumber="]').forEach(function(a){
        var lh=a.getAttribute('href')||'', lm=lh.match(/pageNumber=(\d+)/);
        if(lm && parseInt(lm[1])>bestPg){ bestPg=parseInt(lm[1]); best=lh; }
      });
      if(best) return best.startsWith('/')?'https://www.amazon.co.jp'+best:best;
      return null; /* 単純インクリメントはしない（星別方式では不要） */
    }

    /* fetch（レビューページ内なのでCORSなし） */
    function loadPage(u, cb){
      fetch(u, {credentials:'include'})
        .then(function(r){ return r.text(); })
        .then(function(html){
          var doc = (new DOMParser()).parseFromString(html,'text/html');
          cb(doc);
        })
        .catch(function(){ cb(null); });
    }

    /* レビューパース */
    var MO={January:'01',February:'02',March:'03',April:'04',May:'05',June:'06',July:'07',August:'08',September:'09',October:'10',November:'11',December:'12'};
    function cleanDate(raw){
      var j=raw.match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/); if(j) return j[1]+'/'+('0'+j[2]).slice(-2)+'/'+('0'+j[3]).slice(-2);
      var e=raw.match(/(\w+)\s+(\d+),\s+(\d{4})/); if(e&&MO[e[1]]) return e[3]+'/'+MO[e[1]]+'/'+('0'+e[2]).slice(-2);
      return raw.replace(/に日本でレビュー済み.*/,'').trim();
    }
    function parseReviews(doc){
      var rv=[];
      doc.querySelectorAll('[data-hook="review"]').forEach(function(el){
        /* 星 */
        var starEl=el.querySelector('[class*="a-star-"]'), star=0;
        if(starEl){var sc=starEl.className.match(/a-star-(\d)/);if(sc)star=parseInt(sc[1]);}
        /* タイトル */
        var tEl=el.querySelector('[data-hook="review-title"]');
        var title='';
        if(tEl){var tc=tEl.cloneNode(true);tc.querySelectorAll('.a-icon-alt,i.a-icon').forEach(function(n){n.parentNode&&n.parentNode.removeChild(n);});title=tc.textContent.replace(/\s+/g,' ').trim();}
        /* 本文 */
        var bEl=el.querySelector('[data-hook="review-body"] span'), body=bEl?bEl.textContent.trim():'';
        /* 日付 */
        var dEl=el.querySelector('[data-hook="review-date"]'), date=cleanDate(dEl?dEl.textContent.trim():'');
        /* Vine判定 */
        var vine=(el.textContent||'').indexOf('Amazonで購入')<0&&(el.textContent||'').indexOf('Verified Purchase')<0;
        /* バリアント */
        var vEl=el.querySelector('[data-hook="format-strip"]'), variant=vEl?vEl.textContent.trim():'';
        /* 重複除外 */
        var key='bd:'+(body||'').slice(0,60)+'|'+date;
        if(_seen[key]) return; _seen[key]=true;
        if(body||title) rv.push({star:star,title:title,body:body,date:date,vine:vine,variant:variant});
      });
      return rv;
    }

    /* 次のフィルターへ */
    function nextFilter(){
      filterIndex++;
      if(filterIndex >= STAR_FILTERS.length){ finish(); return; }
      emptyCount = 0;
      var u = buildFilterUrl(STAR_FILTERS[filterIndex], 1);
      showProg(pageCount, allReviews.length);
      loadPage(u, function(doc){
        if(!doc||!window._bhlAmzRunning){setTimeout(function(){nextFilter();},500);return;}
        var revs=parseReviews(doc); pageCount++;
        allReviews=allReviews.concat(revs);
        showProg(pageCount, allReviews.length);
        var next=getNextUrl(doc,1);
        if(next&&!_fetchedUrls[next]){_fetchedUrls[next]=true;setTimeout(function(){fetchByUrl(next,2);},1000);}
        else{setTimeout(function(){nextFilter();},500);}
      });
    }

    /* ページ連続取得 */
    function fetchByUrl(nextUrl, curPageNum){
      if(!window._bhlAmzRunning){finish();return;}
      var urlKey=(nextUrl||'').replace(/[?&]t=\d+/,'');
      if(_fetchedUrls[urlKey]){setTimeout(function(){nextFilter();},500);return;}
      _fetchedUrls[urlKey]=true;
      loadPage(nextUrl, function(doc){
        if(!doc||!window._bhlAmzRunning){setTimeout(function(){nextFilter();},500);return;}
        var revs=parseReviews(doc); pageCount++;
        allReviews=allReviews.concat(revs);
        showProg(pageCount, allReviews.length);
        if(revs.length>0) emptyCount=0; else emptyCount++;
        if(emptyCount>=3){setTimeout(function(){nextFilter();},500);return;}
        var next=getNextUrl(doc,curPageNum);
        var nextKey=next?(next||'').replace(/[?&]t=\d+/,''):'';
        if(next&&!_fetchedUrls[nextKey]){
          setTimeout(function(){fetchByUrl(next,curPageNum+1);},1000);
        } else {
          setTimeout(function(){nextFilter();},500);
        }
      });
    }

    function finish(){
      window._bhlAmzRunning=false;
      removeProg();
      showPanel(allReviews, productTitle);
      playDone();
      var vc=allReviews.filter(function(r){return r.vine;}).length;
      setTimeout(function(){
        alert('✅ レビュー取得完了！\n\n合計 '+allReviews.length+' 件\n├ Vine（Amazonで購入なし）: '+vc+' 件\n└ 非Vine（Amazonで購入）: '+(allReviews.length-vc)+' 件');
      },500);
    }

    /* ★5から開始 */
    var startUrl = buildFilterUrl(STAR_FILTERS[0], 1);
    _fetchedUrls[startUrl] = true;
    loadPage(startUrl, function(doc){
      if(!doc){finish();return;}
      var revs=parseReviews(doc); pageCount++;
      allReviews=allReviews.concat(revs);
      showProg(pageCount, allReviews.length);
      var next=getNextUrl(doc,1);
      if(next&&!_fetchedUrls[next]){_fetchedUrls[next]=true;setTimeout(function(){fetchByUrl(next,2);},1000);}
      else{setTimeout(function(){nextFilter();},500);}
    });
  }

  /* ── プログレスバー ── */
  function showProg(pages, count){
    var el=document.getElementById('_bhlAmzProg');
    if(!el){
      el=document.createElement('div');el.id='_bhlAmzProg';
      el.style.cssText='position:fixed;bottom:20px;right:20px;background:#232f3e;color:#fff;padding:12px 18px;border-radius:8px;font-size:13px;z-index:99999;box-shadow:0 4px 12px rgba(0,0,0,.4);min-width:220px;';
      document.body.appendChild(el);
    }
    el.innerHTML='<div style="font-weight:700;margin-bottom:4px;">🔄 Amazon レビュー取得中…</div>'
      +'<div id="_bhlAmzProgTxt">ページ '+pages+' / 件数 '+count+'</div>'
      +'<div style="margin-top:6px;font-size:11px;color:#aaa;">別タブで作業していただけます</div>';
  }
  function removeProg(){var el=document.getElementById('_bhlAmzProg');if(el)el.remove();}

  /* ── パネル表示 ── */
  function showPanel(reviews, productTitle){
    var old=document.getElementById('_bhlAmzPanel'); if(old) old.remove();
    var activeStarFilter='all', activeVineFilter='all';

    var totalVine=reviews.filter(function(r){return r.vine;}).length;
    var totalNonVine=reviews.length-totalVine;
    var avgAll=reviews.length?(reviews.reduce(function(s,r){return s+r.star;},0)/reviews.length).toFixed(2):'-';
    var avgNV=totalNonVine?(reviews.filter(function(r){return !r.vine;}).reduce(function(s,r){return s+r.star;},0)/totalNonVine).toFixed(2):'-';

    var panel=document.createElement('div');panel.id='_bhlAmzPanel';
    panel.style.cssText='position:fixed;top:0;right:0;width:480px;height:100vh;background:#fff;box-shadow:-4px 0 20px rgba(0,0,0,.2);z-index:99998;overflow-y:auto;font-family:sans-serif;font-size:13px;';

    panel.innerHTML=
      '<div style="background:#232f3e;color:#fff;padding:14px 16px;position:sticky;top:0;z-index:10;">'
        +'<div style="display:flex;justify-content:space-between;align-items:center;">'
          +'<span style="font-weight:700;font-size:14px;">📊 Amazonレビュー分析</span>'
          +'<button id="_bhlAmzClose" style="background:none;border:none;color:#fff;font-size:20px;cursor:pointer;">✕</button>'
        +'</div>'
        +'<div style="font-size:11px;margin-top:4px;opacity:.8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+esc(productTitle)+'</div>'
      +'</div>'
      +'<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:6px;padding:12px;">'
        +sc('総件数',reviews.length+'件')+sc('平均★(全体)',avgAll)+sc('非Vine平均★',avgNV)+sc('Vine件数',totalVine+'件')
      +'</div>'
      +'<div style="padding:0 12px 8px;"><div style="font-weight:700;margin-bottom:6px;">⭐ 星別分布</div><div id="_bhlSD"></div></div>'
      +'<div style="padding:0 12px 8px;"><div style="font-weight:700;margin-bottom:6px;">📅 月別レビュー数</div><div id="_bhlMC" style="overflow-x:auto;"></div></div>'
      +'<div style="padding:0 12px 8px;display:flex;gap:6px;flex-wrap:wrap;">'
        +'<div><span style="font-size:11px;color:#666;">星：</span>'
          +'<button class="_bhlSB" data-v="all" style="'+bs(true)+'">すべて</button>'
          +'<button class="_bhlSB" data-v="good" style="'+bs(false)+'">★5・4</button>'
          +'<button class="_bhlSB" data-v="mid" style="'+bs(false)+'">★3</button>'
          +'<button class="_bhlSB" data-v="bad" style="'+bs(false)+'">★2・1</button>'
        +'</div>'
        +'<div><span style="font-size:11px;color:#666;">種別：</span>'
          +'<button class="_bhlVB" data-v="all" style="'+bs(true)+'">すべて</button>'
          +'<button class="_bhlVB" data-v="nonvine" style="'+bs(false)+'">非Vine</button>'
          +'<button class="_bhlVB" data-v="vine" style="'+bs(false)+'">Vine</button>'
        +'</div>'
      +'</div>'
      +'<div style="padding:0 12px 4px;display:flex;justify-content:space-between;align-items:center;">'
        +'<span id="_bhlCnt" style="font-size:12px;color:#666;"></span>'
        +'<button id="_bhlCSV" style="background:#ff9900;color:#fff;border:none;border-radius:4px;padding:5px 10px;cursor:pointer;font-size:12px;">📥 CSVダウンロード</button>'
      +'</div>'
      +'<div id="_bhlList" style="padding:0 12px 80px;"></div>';

    document.body.appendChild(panel);
    document.getElementById('_bhlAmzClose').onclick=function(){panel.remove();};

    renderStarDist(reviews);
    renderMonthChart(reviews);

    function renderList(){
      var filtered=reviews.filter(function(r){
        var sok=activeStarFilter==='all'||(activeStarFilter==='good'&&r.star>=4)||(activeStarFilter==='mid'&&r.star===3)||(activeStarFilter==='bad'&&r.star<=2&&r.star>0);
        var vok=activeVineFilter==='all'||(activeVineFilter==='vine'&&r.vine)||(activeVineFilter==='nonvine'&&!r.vine);
        return sok&&vok;
      });
      document.getElementById('_bhlCnt').textContent=filtered.length+'件表示中';
      document.getElementById('_bhlList').innerHTML=filtered.map(function(r){
        return '<div style="border-bottom:1px solid #eee;padding:8px 0;">'
          +'<div style="display:flex;gap:6px;align-items:center;margin-bottom:3px;">'
            +'<span style="color:#ff9900;">'+'★'.repeat(r.star)+'</span>'
            +'<span style="font-size:11px;color:#666;">'+esc(r.date)+'</span>'
            +(r.vine?'<span style="background:#e8f4fd;color:#2874a6;font-size:10px;padding:1px 5px;border-radius:3px;">Vine</span>':'<span style="background:#e8f5e9;color:#27ae60;font-size:10px;padding:1px 5px;border-radius:3px;">購入済</span>')
          +'</div>'
          +'<div style="font-weight:700;margin-bottom:2px;">'+esc(r.title)+'</div>'
          +(r.variant?'<div style="font-size:11px;color:#888;margin-bottom:2px;">'+esc(r.variant)+'</div>':'')
          +'<div style="color:#333;line-height:1.5;">'+esc(r.body)+'</div>'
        +'</div>';
      }).join('')||'<div style="color:#999;padding:20px 0;text-align:center;">該当なし</div>';

      document.getElementById('_bhlCSV').onclick=function(){
        var rows=[['星','タイトル','本文','日付','種別','バリアント']];
        filtered.forEach(function(r){rows.push([r.star,r.title,r.body,r.date,r.vine?'Vine':'非Vine',r.variant]);});
        var csv='\uFEFF'+rows.map(function(r){return r.map(function(c){return'"'+(String(c).replace(/"/g,'""'))+'"';}).join(',');}).join('\n');
        var a=document.createElement('a');a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv);a.download='amazon_reviews_'+new Date().toISOString().slice(0,10)+'.csv';a.click();
      };
    }

    panel.querySelectorAll('._bhlSB').forEach(function(btn){
      btn.onclick=function(){activeStarFilter=btn.dataset.v;panel.querySelectorAll('._bhlSB').forEach(function(b){b.style.cssText=bs(false);});btn.style.cssText=bs(true);renderList();};
    });
    panel.querySelectorAll('._bhlVB').forEach(function(btn){
      btn.onclick=function(){activeVineFilter=btn.dataset.v;panel.querySelectorAll('._bhlVB').forEach(function(b){b.style.cssText=bs(false);});btn.style.cssText=bs(true);renderList();};
    });
    renderList();
  }

  function renderStarDist(reviews){
    var counts={5:0,4:0,3:0,2:0,1:0},vcounts={5:0,4:0,3:0,2:0,1:0};
    reviews.forEach(function(r){if(counts[r.star]!==undefined){counts[r.star]++;if(!r.vine)vcounts[r.star]++;}});
    var max=Math.max.apply(null,[counts[1],counts[2],counts[3],counts[4],counts[5]])||1;
    var colors={5:'#4CAF50',4:'#8BC34A',3:'#FFC107',2:'#FF7043',1:'#F44336'};
    var el=document.getElementById('_bhlSD');
    if(el) el.innerHTML=[5,4,3,2,1].map(function(s){
      return '<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">'
        +'<span style="width:20px;text-align:right;font-size:12px;">★'+s+'</span>'
        +'<div style="flex:1;background:#f0f0f0;border-radius:3px;height:14px;">'
          +'<div style="width:'+Math.round(counts[s]/max*100)+'%;background:'+colors[s]+';height:100%;border-radius:3px;"></div>'
        +'</div>'
        +'<span style="width:70px;font-size:11px;color:#666;">'+counts[s]+'件(非Vine:'+vcounts[s]+')</span>'
      +'</div>';
    }).join('');
  }

  function renderMonthChart(reviews){
    var months={};
    reviews.forEach(function(r){if(!r.date)return;var ym=r.date.slice(0,7);months[ym]=(months[ym]||0)+1;});
    var keys=Object.keys(months).sort(); if(!keys.length) return;
    var mvals=keys.map(function(k){return months[k];});
    var maxV=Math.max.apply(null,mvals);
    var barW=Math.max(20,Math.min(40,Math.floor(340/keys.length)));
    var html='<div style="display:flex;align-items:flex-end;gap:2px;height:80px;padding-bottom:18px;">';
    keys.forEach(function(k){
      var h=Math.round(months[k]/maxV*60);
      html+='<div style="display:flex;flex-direction:column;align-items:center;width:'+barW+'px;">'
        +'<div title="'+k+': '+months[k]+'件" style="width:'+(barW-2)+'px;height:'+h+'px;background:#FF9900;border-radius:2px 2px 0 0;"></div>'
        +'<div style="font-size:9px;color:#666;transform:rotate(-45deg);transform-origin:left;margin-top:2px;white-space:nowrap;">'+k.slice(2)+'</div>'
      +'</div>';
    });
    html+='</div>';
    var el=document.getElementById('_bhlMC'); if(el) el.innerHTML=html;
  }

  function sc(label,value){return '<div style="background:#f5f5f5;border-radius:6px;padding:8px;text-align:center;"><div style="font-size:10px;color:#999;">'+label+'</div><div style="font-size:15px;font-weight:700;color:#222;">'+value+'</div></div>';}
  function bs(active){return 'border:1px solid '+(active?'#ff9900':'#ccc')+';background:'+(active?'#ff9900':'#fff')+';color:'+(active?'#fff':'#333')+';border-radius:4px;padding:3px 8px;cursor:pointer;font-size:12px;margin:1px;';}
  function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
  function playDone(){try{var ctx=new(window.AudioContext||window.webkitAudioContext)();[523,659,784].forEach(function(f,i){var o=ctx.createOscillator(),g=ctx.createGain();o.connect(g);g.connect(ctx.destination);o.frequency.value=f;g.gain.setValueAtTime(0.3,ctx.currentTime+i*0.15);g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+i*0.15+0.3);o.start(ctx.currentTime+i*0.15);o.stop(ctx.currentTime+i*0.15+0.3);});}catch(e){}}
})();
