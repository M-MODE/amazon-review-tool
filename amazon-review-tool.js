/* Amazon レビュー取得ツール v12.3 — bh life
 * 修正: hasNext判定を「次ページが空でなければ継続」方式に変更
 *   - ページネーションHTMLに依存しない
 *   - 空ページが3回続いたら終了
 */
(function () {
  'use strict';

  var url = location.href, asin = null, m;
  m = url.match(/\/dp\/([A-Z0-9]{10})/i); if (m) asin = m[1].toUpperCase();
  if (!asin) { m = url.match(/\/gp\/product\/([A-Z0-9]{10})/i); if (m) asin = m[1].toUpperCase(); }
  if (!asin) { m = url.match(/\/product-reviews\/([A-Z0-9]{10})/i); if (m) asin = m[1].toUpperCase(); }
  if (!asin) { alert('Amazonの商品ページまたはレビューページで実行してください'); return; }
  if (url.indexOf('/product-reviews/') < 0) {
    window.location.replace('https://www.amazon.co.jp/product-reviews/' + asin + '/?sortBy=recent&pageNumber=1#_bhl_auto');
    return;
  }

  var STORE_KEY = '_bhl_amz_v123_' + asin;
  var _s = window[STORE_KEY] || { reviews: [], seen: {}, nextPage: 1, done: false, running: false };
  window[STORE_KEY] = _s;

  if (_s.done && _s.reviews.length > 0) { renderPanel(_s.reviews, false); return; }
  if (_s.running) { updateProgress('取得再開中... 累計' + _s.reviews.length + '件 (p' + _s.nextPage + '〜)'); return; }

  // ── ユーティリティ ──
  function parseRating(el) {
    var s = el.querySelector('i[data-hook="review-star-rating"]') || el.querySelector('i[class*="a-star-"]');
    if (s) { var c = (s.className||'').match(/\ba-star-(\d+)\b/); if (c) return parseInt(c[1]); }
    var span = el.querySelector('span[data-hook="review-star-rating"]');
    if (span) { var c2 = (span.className||'').match(/\ba-star-(\d+)\b/); if (c2) return parseInt(c2[1]); }
    return 0;
  }
  function parseTitle(el) {
    if (!el) return '';
    var c = el.cloneNode(true);
    c.querySelectorAll('.a-icon-alt,i.a-icon').forEach(function(n){ n.parentNode&&n.parentNode.removeChild(n); });
    return c.textContent.replace(/\s+/g,' ').trim();
  }
  function isVine(el){
    if(el.querySelector('[data-hook="avp-badge"]')) return false;
    var txt = el.textContent || '';
    if(txt.indexOf('Amazonで購入') >= 0) return false;
    if(txt.indexOf('Verified Purchase') >= 0) return false;
    if(el.querySelector('[data-hook="vine-customer-review-tag"]')) return true;
    var bEl = el.querySelector('[data-hook="review-body"] span') || el.querySelector('[data-hook="review-body"]');
    if(bEl && bEl.textContent.trim().length < 5) return false;
    return true;
  }
  var MO={January:'01',February:'02',March:'03',April:'04',May:'05',June:'06',July:'07',August:'08',September:'09',October:'10',November:'11',December:'12'};
  function cleanDate(raw){
    var j=raw.match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/);if(j)return j[1]+'/'+('0'+j[2]).slice(-2)+'/'+('0'+j[3]).slice(-2);
    var e=raw.match(/(\w+)\s+(\d+),\s+(\d{4})/);if(e&&MO[e[1]])return e[3]+'/'+MO[e[1]]+'/'+('0'+e[2]).slice(-2);
    return raw.replace(/に日本でレビュー済み.*/,'').replace(/Reviewed in.*on\s*/,'').trim();
  }
  function toYM(d){var m2=d.match(/^(\d{4})\/(\d{2})/);return m2?m2[1]+'/'+m2[2]:null;}
  function normBody(b){ return (b||'').replace(/\s+/g,'').slice(0,80); }
  function isSeen(rid,body,date){
    if(rid&&rid.length>3&&_s.seen['id:'+rid])return true;
    return !!_s.seen['bd:'+normBody(body)+'|'+date];
  }
  function markSeen(r){
    if(r.rid&&r.rid.length>3)_s.seen['id:'+r.rid]=true;
    _s.seen['bd:'+normBody(r.body)+'|'+r.date]=true;
  }
  function delay(ms){ return new Promise(function(r){setTimeout(r,ms);}); }

  // ── 進捗バー ──
  function updateProgress(msg){
    var bar = document.getElementById('_bhl_prog');
    if(!bar){
      bar = document.createElement('div'); bar.id = '_bhl_prog';
      bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#0F172A;color:#fff;padding:12px 20px;font-family:sans-serif;display:flex;align-items:center;gap:12px;box-shadow:0 2px 12px rgba(0,0,0,.7);cursor:pointer';
      bar.onclick = function(){ renderPanel(_s.reviews, true); };
      document.body.appendChild(bar);
    }
    bar.innerHTML = '<span style="font-size:22px;flex-shrink:0">⏳</span>'
      + '<div style="flex:1"><div style="font-weight:700;color:#FF9900;font-size:14px">Amazonレビュー取得中</div>'
      + '<div style="font-size:12px;color:#94A3B8;margin-top:2px">' + msg + '</div></div>'
      + '<div style="font-size:11px;color:#475569;flex-shrink:0">クリックで途中確認</div>';
  }
  function removeProgress(){ var b=document.getElementById('_bhl_prog'); if(b) b.remove(); }

  // ── 1ページ取得（レビュー要素の有無だけで判断） ──
  function fetchPage(pageNum){
    var pageUrl = 'https://www.amazon.co.jp/product-reviews/' + asin + '/?sortBy=recent&pageNumber=' + pageNum;
    return fetch(pageUrl, {credentials:'include'})
      .then(function(res){
        if(res.status===503||res.status===429){
          updateProgress('⚠️ レート制限 — 10秒待機中... p' + pageNum);
          return delay(10000).then(function(){ return fetch(pageUrl,{credentials:'include'}); }).then(function(r){return r.text();});
        }
        return res.text();
      })
      .then(function(html){
        var doc = new DOMParser().parseFromString(html,'text/html');
        var rv = [];
        doc.querySelectorAll('[data-hook="review"]').forEach(function(el){
          var rating = parseRating(el);
          var titleEl = el.querySelector('[data-hook="review-title"]') || el.querySelector('[class*="review-title"]');
          var title = parseTitle(titleEl);
          var bEl = el.querySelector('[data-hook="review-body"] span') || el.querySelector('[data-hook="review-body"]') || el.querySelector('[class*="review-text"]');
          var body = bEl ? bEl.textContent.trim() : '';
          var dEl = el.querySelector('[data-hook="review-date"]') || el.querySelector('[class*="review-date"]');
          var date = cleanDate(dEl ? dEl.textContent.trim() : '');
          var vine = isVine(el), rid = el.id||'';
          if(isSeen(rid,body,date)) return;
          markSeen({rid:rid,body:body,date:date});
          if(body||title) rv.push({rating:rating,title:title,body:body,date:date,vine:vine,rid:rid});
        });
        // ▼ hasNextはページネーションに頼らず「取得件数が1件以上あれば継続」
        // 空ページ3回連続で終了（fetchAllで管理）
        return {revs: rv, rawCount: doc.querySelectorAll('[data-hook="review"]').length};
      })
      .catch(function(e){ console.warn('fetchPage err p'+pageNum, e); return {revs:[], rawCount:0}; });
  }

  // ── 全ページ自動取得（空ページ3回で終了） ──
  var emptyCount = 0;
  function fetchAll(){
    _s.running = true;
    function next(){
      var p = _s.nextPage;
      updateProgress('累計 ' + _s.reviews.length + ' 件取得中　p' + p + ' 取得中...');
      return fetchPage(p).then(function(result){
        if(result.rawCount === 0){
          // ページ自体にレビュー要素ゼロ = 空ページ
          emptyCount++;
          if(emptyCount >= 3){
            _s.done = true; _s.running = false; return;
          }
          // 空でも念のり次ページを試みる
          _s.nextPage = p + 1;
          return delay(800).then(next);
        }
        // レビュー要素があった → 重複除去後0件でも次へ進む
        emptyCount = 0;
        result.revs.forEach(function(r){ _s.reviews.push(r); });
        _s.nextPage = p + 1;
        return delay(400).then(next);
      });
    }
    return next().then(function(){
      _s.running = false;
      removeProgress();
      renderPanel(_s.reviews, false);
      playDone();
    });
  }

  // ── グラフ・UI ──
  function avg(list){
    var v=list.filter(function(r){return r.rating>0;});
    return v.length?(v.reduce(function(s,r){return s+r.rating;},0)/v.length).toFixed(2):null;
  }
  function distChart(reviews,label,color){
    var dist={1:0,2:0,3:0,4:0,5:0};
    reviews.forEach(function(r){var s=Math.round(r.rating);if(dist[s]!==undefined)dist[s]++;});
    var total=reviews.length,maxD=Math.max.apply(null,[1,2,3,4,5].map(function(s){return dist[s];})||1)||1,a=avg(reviews);
    var bars=[5,4,3,2,1].map(function(s){
      var cnt=dist[s],pct=total>0?Math.round(cnt/total*100):0,w=Math.round(cnt/maxD*100),bc=s>=4?'#22C55E':(s===3?'#94A3B8':'#FF4B4B');
      return '<div style="display:flex;align-items:center;gap:5px;margin-bottom:3px"><span style="color:#FF9900;font-size:11px;width:12px;text-align:right">'+s+'</span><span style="color:#FF9900;font-size:10px">★</span><div style="flex:1;height:9px;background:#1E3A5F;border-radius:3px;overflow:hidden"><div style="height:100%;width:'+w+'%;background:'+bc+';border-radius:3px"></div></div><span style="font-size:10px;color:#E2E8F0;width:22px;text-align:right">'+cnt+'</span><span style="font-size:10px;color:#64748B;width:38px">('+pct+'%)</span></div>';
    }).join('');
    return '<div style="margin-bottom:14px"><div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px"><span style="font-size:11px;font-weight:700;color:'+color+'">'+label+'</span><span style="font-size:14px;font-weight:700;color:'+color+'">'+(a||'?')+'★　<span style="font-size:11px;color:#64748B;font-weight:400">'+total+'件</span></span></div>'+bars+'</div>';
  }
  function monthChart(reviews){
    var counts={};
    reviews.forEach(function(r){var ym=toYM(r.date);if(ym)counts[ym]=(counts[ym]||0)+1;});
    var months=Object.keys(counts).sort().reverse();
    if(!months.length)return '';
    var total=reviews.length,maxC=Math.max.apply(null,months.map(function(k){return counts[k];}));
    var bars=months.slice(0,24).map(function(ym){
      var cnt=counts[ym],pct=Math.round(cnt/total*100),w=Math.round(cnt/maxC*100);
      return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px"><span style="font-size:11px;color:#94A3B8;width:52px;flex-shrink:0">'+ym+'</span><div style="flex:1;height:12px;background:#1E3A5F;border-radius:3px;overflow:hidden"><div style="height:100%;width:'+w+'%;background:#22C55E;border-radius:3px"></div></div><span style="font-size:11px;color:#E2E8F0;width:36px;text-align:right;flex-shrink:0">'+cnt+'件</span><span style="font-size:11px;color:#64748B;width:32px;flex-shrink:0">'+pct+'%</span></div>';
    }).join('');
    return '<div style="padding:12px 16px;background:#162032;border-bottom:1px solid #1E3A5F"><div style="font-size:11px;font-weight:700;color:#94A3B8;margin-bottom:8px">📅 月別レビュー数</div>'+bars+'</div>';
  }

  function renderPanel(reviews, interim){
    reviews = reviews.slice().sort(function(a,b){return b.date.localeCompare(a.date);});
    var vRv=reviews.filter(function(r){return r.vine;}),nvRv=reviews.filter(function(r){return !r.vine;});
    var vC=vRv.length,nvC=nvRv.length,vP=reviews.length>0?Math.round(vC/reviews.length*100):0;
    var goodC=reviews.filter(function(r){return Math.round(r.rating)>=4;}).length;
    var midC=reviews.filter(function(r){return Math.round(r.rating)===3;}).length;
    var badC=reviews.filter(function(r){var s=Math.round(r.rating);return s<=2&&s>0;}).length;
    var aAll=avg(reviews)||'?';
    var listHTML=reviews.slice(0,500).map(function(r,i){
      var rnd=Math.round(r.rating),stars='★'.repeat(rnd)+'☆'.repeat(5-rnd);
      var vb=r.vine?'<span style="background:#3B1E6E;color:#C4B5FD;padding:2px 6px;border-radius:10px;font-size:10px;margin-right:3px">Vine</span>':'<span style="background:#0E4B5F;color:#67E8F9;padding:2px 6px;border-radius:10px;font-size:10px;margin-right:3px">Amazonで購入</span>';
      var lbl=rnd<=2&&rnd>0?'<span style="background:#FF4B4B22;color:#FF4B4B;font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px">悪い</span>':rnd>=4?'<span style="background:#22C55E22;color:#22C55E;font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px">良い</span>':rnd===3?'<span style="background:#94A3B822;color:#94A3B8;font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px">普通</span>':'';
      var bc=rnd<=2&&rnd>0?'#FF4B4B':(rnd>=4?'#22C55E':'#94A3B8');
      return '<div data-idx="'+i+'" data-r="'+r.rating+'" data-vine="'+(r.vine?'1':'0')+'" style="border-left:3px solid '+bc+';padding:10px 10px 10px 12px;margin-top:8px;background:#162032;border-radius:0 6px 6px 0">'
        +'<div style="display:flex;justify-content:space-between;gap:6px;margin-bottom:4px"><div><span style="color:#FF9900;font-size:13px">'+stars+'</span> <span style="color:#FF9900;font-size:11px;font-weight:700">'+(r.rating>0?r.rating.toFixed(1):'?')+'</span> '+lbl+'</div><span style="font-size:10px;color:#475569">'+r.date+'</span></div>'
        +(r.title?'<div style="font-weight:600;color:#CBD5E1;margin-bottom:3px;font-size:12px">'+r.title+'</div>':'')
        +'<div style="margin-bottom:4px">'+vb+'</div>'
        +'<div style="color:#94A3B8;font-size:12px;line-height:1.6">'+r.body.replace(/\n/g,'<br>').substring(0,400)+(r.body.length>400?'…':'')+'</div></div>';
    }).join('');

    var statusBanner = interim
      ? '<div style="background:#1E3A5F;padding:10px 16px;text-align:center;font-size:12px;color:#FBBF24;border-radius:12px 12px 0 0">⏳ 取得中... 現在 '+reviews.length+' 件（途中経過）</div>'
      : '<div style="background:#064E3B;padding:10px 16px;text-align:center;font-size:13px;font-weight:700;color:#22C55E;border-radius:12px 12px 0 0">✅ 全件取得完了　合計 '+reviews.length+' 件</div>';

    var ep=document.getElementById('_bhl_amz_panel'); if(ep) ep.remove();
    var panel=document.createElement('div'); panel.id='_bhl_amz_panel';
    panel.style.cssText='position:fixed;top:16px;right:16px;z-index:2147483647;width:480px;max-height:90vh;overflow-y:auto;background:#0F172A;color:#E2E8F0;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.7);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:13px;line-height:1.5';
    var ptEl=document.querySelector('#productTitle,h1.a-size-large,[data-hook="product-link"]');
    var productTitle=ptEl?ptEl.textContent.trim():'ASIN: '+asin;
    panel.innerHTML=
      statusBanner
      +'<div style="background:#1E3A5F;padding:14px 16px;display:flex;align-items:center;gap:10px">'
      +'<div style="background:#FF9900;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0">★</div>'
      +'<div style="flex:1;min-width:0"><div style="font-weight:700;font-size:14px;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+productTitle+'</div>'
      +'<div style="font-size:11px;color:#94A3B8;margin-top:2px">ASIN: '+asin+'</div></div>'
      +'<button onclick="document.getElementById(\'_bhl_amz_panel\').remove()" style="background:none;border:none;color:#94A3B8;font-size:22px;cursor:pointer;flex-shrink:0">×</button></div>'
      +'<div style="display:flex;align-items:center;justify-content:center;gap:20px;padding:12px 16px;background:#162032;border-bottom:1px solid #1E3A5F">'
      +'<div style="text-align:center"><div style="font-size:28px;font-weight:700;color:#FF9900">'+aAll+'</div><div style="font-size:11px;color:#64748B">★ 平均</div></div>'
      +'<div style="width:1px;height:40px;background:#1E3A5F"></div>'
      +'<div style="text-align:center"><div style="font-size:28px;font-weight:700;color:#fff">'+reviews.length+'</div><div style="font-size:11px;color:#64748B">件取得済み</div></div>'
      +'<div style="width:1px;height:40px;background:#1E3A5F"></div>'
      +'<div style="text-align:center"><div style="font-size:20px;font-weight:700;color:#C4B5FD">'+vC+'<span style="font-size:12px;color:#64748B"> Vine</span></div><div style="font-size:11px;color:#64748B">'+vP+'%</div></div>'
      +'<div style="text-align:center"><div style="font-size:20px;font-weight:700;color:#67E8F9">'+nvC+'<span style="font-size:12px;color:#64748B"> 非Vine</span></div><div style="font-size:11px;color:#64748B">'+(100-vP)+'%</div></div></div>'
      +monthChart(reviews)
      +'<div style="padding:14px 16px;background:#162032;border-bottom:1px solid #1E3A5F">'
      +distChart(reviews,'■ 全体','#FF9900')+distChart(vRv,'■ Vine（購入バッジなし）','#C4B5FD')+distChart(nvRv,'■ 非Vine（Amazonで購入）','#67E8F9')
      +'</div>'
      +'<div style="padding:10px 16px;border-bottom:1px solid #1E3A5F"><div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center">'
      +'<button data-f="all" onclick="_bhlFilter(\'all\',this)" style="padding:5px 10px;border-radius:20px;border:1px solid #FF9900;background:#FF9900;color:#000;font-size:11px;font-weight:700;cursor:pointer">全て('+reviews.length+')</button>'
      +'<button data-f="good" onclick="_bhlFilter(\'good\',this)" style="padding:5px 10px;border-radius:20px;border:1px solid #22C55E;background:transparent;color:#22C55E;font-size:11px;cursor:pointer">★5・4('+goodC+')</button>'
      +'<button data-f="mid" onclick="_bhlFilter(\'mid\',this)" style="padding:5px 10px;border-radius:20px;border:1px solid #94A3B8;background:transparent;color:#94A3B8;font-size:11px;cursor:pointer">★3('+midC+')</button>'
      +'<button data-f="bad" onclick="_bhlFilter(\'bad\',this)" style="padding:5px 10px;border-radius:20px;border:1px solid #FF4B4B;background:transparent;color:#FF4B4B;font-size:11px;cursor:pointer">★2・1('+badC+')</button>'
      +'<button data-f="vine" onclick="_bhlFilter(\'vine\',this)" style="padding:5px 10px;border-radius:20px;border:1px solid #8B5CF6;background:transparent;color:#C4B5FD;font-size:11px;cursor:pointer">Vine('+vC+')</button>'
      +'<button data-f="novine" onclick="_bhlFilter(\'novine\',this)" style="padding:5px 10px;border-radius:20px;border:1px solid #06B6D4;background:transparent;color:#67E8F9;font-size:11px;cursor:pointer">非Vine('+nvC+')</button>'
      +'<button onclick="_bhlCSV()" style="margin-left:auto;padding:5px 10px;border-radius:20px;border:1px solid #3B82F6;background:transparent;color:#3B82F6;font-size:11px;cursor:pointer">📥 CSV</button>'
      +'</div></div>'
      +'<div id="_bhl_amz_list" style="padding:8px 16px 16px">'+listHTML+'</div>'
      +'<div style="padding:10px 16px;background:#162032;border-top:1px solid #1E3A5F;border-radius:0 0 12px 12px;text-align:center;font-size:11px;color:#475569">'
      +(reviews.length>500?'最新500件を表示（累計'+reviews.length+'件）':'全'+reviews.length+'件を表示中')+'</div>';
    document.body.appendChild(panel);
    window._bhlAmzAllReviews = reviews;
  }

  window._bhlCSV=function(){
    var vis=[];document.querySelectorAll('#_bhl_amz_list [data-idx]').forEach(function(el){if(el.style.display!=='none'){var idx=parseInt(el.getAttribute('data-idx'));if(window._bhlAmzAllReviews&&window._bhlAmzAllReviews[idx])vis.push(window._bhlAmzAllReviews[idx]);}});
    if(!vis.length){alert('表示中のレビューがありません');return;}
    var rows=[['評価','Vine','タイトル','本文','レビュー日']];
    vis.forEach(function(r){rows.push([r.rating,r.vine?'Vine':'非Vine',r.title,r.body.replace(/\n/g,' ').replace(/\r/g,''),r.date]);});
    var csv=rows.map(function(r){return r.map(function(c){return'"'+String(c||'').replace(/"/g,'""')+'"';}).join(',');}).join('\n');
    var a2=document.createElement('a');a2.href='data:text/csv;charset=utf-8,\uFEFF'+encodeURIComponent(csv);a2.download='amazon_reviews_'+asin+'_'+vis.length+'件.csv';a2.click();
  };
  window._bhlFilter=function(f,btn){
    document.querySelectorAll('#_bhl_amz_panel button[data-f]').forEach(function(b){var cs={all:'#FF9900',good:'#22C55E',mid:'#94A3B8',bad:'#FF4B4B',vine:'#8B5CF6',novine:'#06B6D4'};var c=cs[b.getAttribute('data-f')]||'#94A3B8';b.style.background='transparent';b.style.color=c;b.style.borderColor=c;});
    var cs={all:'#FF9900',good:'#22C55E',mid:'#94A3B8',bad:'#FF4B4B',vine:'#8B5CF6',novine:'#06B6D4'};
    btn.style.background=cs[f]||'#94A3B8';btn.style.color=f==='all'?'#000':'#fff';
    document.querySelectorAll('#_bhl_amz_list [data-idx]').forEach(function(el){var rs=Math.round(parseFloat(el.getAttribute('data-r')||'0'));var v=el.getAttribute('data-vine')==='1';el.style.display=(f==='all'?true:f==='good'?rs>=4:f==='mid'?rs===3:f==='bad'?(rs<=2&&rs>0):f==='vine'?v:f==='novine'?!v:false)?'':'none';});
  };
  function playDone(){try{var ctx=new(window.AudioContext||window.webkitAudioContext)();[[523,0],[659,.15],[784,.3],[1047,.5]].forEach(function(n){var o=ctx.createOscillator(),g=ctx.createGain();o.connect(g);g.connect(ctx.destination);o.frequency.value=n[0];o.type='sine';g.gain.setValueAtTime(.3,ctx.currentTime+n[1]);g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+n[1]+.4);o.start(ctx.currentTime+n[1]);o.stop(ctx.currentTime+n[1]+.5);});}catch(e){}}

  // ── 実行開始 ──
  var pb=document.getElementById('_bhl_prog'); if(pb) pb.remove();
  var ep=document.getElementById('_bhl_amz_panel'); if(ep) ep.remove();
  updateProgress('p1から取得開始...');
  fetchAll();

})();
