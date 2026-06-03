/* Amazon レビュー取得ツール v9.0 — bh life
 * メールアドレス認証（Googleスプレッドシート管理）
 * HTML全体スキャンでnextPageToken取得 / Vine=Amazonで購入なし
 */
(function () {
  'use strict';

  /* ── Apps Script URL（楽天ツールと同じものを使用） ── */
  var GAS_URL = 'ここにApps ScriptのURLを貼り付け';
  var EMAIL_KEY = '_bhl_email';

  /* ── メール認証チェック ── */
  function checkAuth(onSuccess) {
    var savedEmail = '';
    try { savedEmail = localStorage.getItem(EMAIL_KEY) || ''; } catch(e) {}

    function verify(email) {
      fetch(GAS_URL + '?email=' + encodeURIComponent(email) + '&tool=amazon', {mode:'cors'})
        .then(function(r){ return r.json(); })
        .then(function(d){
          if (d.ok) {
            try { localStorage.setItem(EMAIL_KEY, email); } catch(e) {}
            onSuccess(email, d.name);
          } else {
            try { localStorage.removeItem(EMAIL_KEY); } catch(e) {}
            var retry = prompt('❌ ' + d.msg + '\n\nメールアドレスを入力してください：');
            if (retry) verify(retry.trim().toLowerCase());
          }
        })
        .catch(function(){
          /* 認証サーバーに繋がらない場合はそのまま続行（オフライン対応） */
          onSuccess(email, '');
        });
    }

    if (savedEmail) {
      verify(savedEmail);
    } else {
      var email = prompt('★ Amazonレビューチェックツール\n\n登録メールアドレスを入力してください：');
      if (email) verify(email.trim().toLowerCase());
    }
  }

  /* ── メイン処理を認証後に実行 ── */
  checkAuth(function() {
    runTool();
  });

  function runTool() {


  var url = location.href, asin = null, m;
  m = url.match(/\/dp\/([A-Z0-9]{10})/i);            if (m) asin = m[1].toUpperCase();
  if (!asin) { m = url.match(/\/gp\/product\/([A-Z0-9]{10})/i);    if (m) asin = m[1].toUpperCase(); }
  if (!asin) { m = url.match(/\/product-reviews\/([A-Z0-9]{10})/i); if (m) asin = m[1].toUpperCase(); }
  if (!asin) { alert('Amazonの商品ページまたはレビューページで実行してください'); return; }
  if (url.indexOf('/product-reviews/') < 0) {
    location.href = 'https://www.amazon.co.jp/product-reviews/' + asin + '/?sortBy=recent&pageNumber=1';
    return;
  }
  if (window._bhlAmzRunning) {
    window._bhlAmzRunning = false;
    var _ex = document.getElementById('_bhl_amz_prog');
    if (_ex) _ex.remove();
    alert('取得を中断しました'); return;
  }

  function parseRating(el) {
    var s=el.querySelector('i[data-hook="review-star-rating"]')||el.querySelector('span[data-hook="review-star-rating"]')||el.querySelector('[data-hook="cmps-review-star-rating"]');
    if(s){var c=(s.className||'').match(/\ba-star-(\d+)\b/);if(c)return parseInt(c[1]);}
    var a=el.querySelector('[data-hook*="star-rating"] .a-icon-alt');
    if(a){var t=a.textContent||'';var m1=t.match(/のうち\s*(\d+(?:\.\d+)?)/);if(m1)return parseFloat(m1[1]);var m2=t.match(/^(\d+(?:\.\d+)?)\s*out/);if(m2)return parseFloat(m2[1]);}
    return 0;
  }

  function parseTitle(el) {
    if(!el)return'';var c=el.cloneNode(true);
    c.querySelectorAll('.a-icon-alt,i.a-icon').forEach(function(n){n.parentNode&&n.parentNode.removeChild(n);});
    return c.textContent.replace(/\s+/g,' ').trim();
  }

  function isVine(el){var t=el.textContent||'';return t.indexOf('Amazonで購入')<0&&t.indexOf('Verified Purchase')<0;}

  var MO={January:'01',February:'02',March:'03',April:'04',May:'05',June:'06',July:'07',August:'08',September:'09',October:'10',November:'11',December:'12'};
  function cleanDate(raw){
    var j=raw.match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/);if(j)return j[1]+'/'+('0'+j[2]).slice(-2)+'/'+('0'+j[3]).slice(-2);
    var e=raw.match(/(\w+)\s+(\d+),\s+(\d{4})/);if(e&&MO[e[1]])return e[3]+'/'+MO[e[1]]+'/'+('0'+e[2]).slice(-2);
    return raw.replace(/に日本でレビュー済み.*/,'').trim();
  }
  function toYM(d){var m=d.match(/^(\d{4})\/(\d{2})/);return m?m[1]+'/'+m[2]:null;}

  var _seen={};
  function markSeen(rid,body,date){
    var bk='bd:'+(body||'').slice(0,60)+'|'+date;
    _seen[bk]=true;
    if(rid&&rid.length>3) _seen['id:'+rid]=true;
  }
  function isSeen(rid,body,date){
    if(rid&&rid.length>3&&_seen['id:'+rid]) return true;
    return !!_seen['bd:'+(body||'').slice(0,60)+'|'+date];
  }

  function parseReviews(doc){
    var rv=[];
    doc.querySelectorAll('[data-hook="review"]').forEach(function(el){
      var rating=parseRating(el),title=parseTitle(el.querySelector('[data-hook="review-title"]'));
      var bEl=el.querySelector('[data-hook="review-body"] span'),body=bEl?bEl.textContent.trim():'';
      var dEl=el.querySelector('[data-hook="review-date"]'),date=cleanDate(dEl?dEl.textContent.trim():'');
      var vine=isVine(el),rid=el.id||'';
      if(isSeen(rid,body,date))return;
      markSeen(rid,body,date);
      if(body||title)rv.push({rating:rating,title:title,body:body,date:date,vine:vine,rid:rid});
    });
    return rv;
  }

  /* ── nextPageToken取得（6段階） ── */
  function findTokenInDoc(doc){
    /* 1: aタグ */
    var al=doc.querySelectorAll('a[href*="nextPageToken"]');
    if(al.length){var h=al[al.length-1].getAttribute('href')||'';var tm=h.match(/nextPageToken=([^&"'\s]+)/);var pm=h.match(/pageNumber=(\d+)/);if(tm)return{token:decodeURIComponent(tm[1]),page:pm?parseInt(pm[1]):2};}
    /* 2: フォームのhidden input */
    var forms=doc.querySelectorAll('form');
    for(var fi=0;fi<forms.length;fi++){var tIn=forms[fi].querySelector('input[name="nextPageToken"]');if(tIn&&tIn.value){var pIn=forms[fi].querySelector('input[name="pageNumber"]');return{token:tIn.value,page:pIn?parseInt(pIn.value):2};}}
    /* 3: CSA/data属性（Amazonのコンポーネントシステム） */
    var candidates = doc.querySelectorAll('[data-csa-c-slot-id],[data-action],[data-csa-c-type]');
    for(var ci=0;ci<candidates.length;ci++){
      for(var cai=0;cai<candidates[ci].attributes.length;cai++){
        var av=candidates[ci].attributes[cai].value;
        if(av.length<10||av.indexOf('nextPageToken')<0)continue;
        var jm=av.match(/"nextPageToken"\s*:\s*"([^"]+)"/);
        var jp=av.match(/"pageNumber"\s*:\s*(\d+)/);
        if(jm)return{token:jm[1],page:jp?parseInt(jp[1]):2};
        var um=av.match(/nextPageToken=([A-Za-z0-9+%\/=]{10,})/);
        if(um)return{token:decodeURIComponent(um[1]),page:2};
      }
    }
    /* 4: 全要素のdata属性スキャン */
    var allEls=doc.querySelectorAll('*');
    for(var ei=0;ei<allEls.length;ei++){for(var ai=0;ai<allEls[ei].attributes.length;ai++){var av2=allEls[ei].attributes[ai].value;if(av2.length<10||av2.indexOf('nextPageToken')<0)continue;var jm2=av2.match(/"nextPageToken"\s*:\s*"([^"]+)"/);var jp2=av2.match(/"pageNumber"\s*:\s*(\d+)/);if(jm2)return{token:jm2[1],page:jp2?parseInt(jp2[1]):2};var um2=av2.match(/nextPageToken=([A-Za-z0-9+%\/=]{10,})/);if(um2)return{token:decodeURIComponent(um2[1]),page:2};}}
    /* 5: script */
    var scripts=doc.querySelectorAll('script');
    for(var si=0;si<scripts.length;si++){var st=scripts[si].textContent||'';if(st.indexOf('nextPageToken')<0)continue;var sm=st.match(/"nextPageToken"\s*:\s*"([A-Za-z0-9+\/=]{10,})"/);var sp=st.match(/"pageNumber"\s*:\s*(\d+)/);if(sm)return{token:sm[1],page:sp?parseInt(sp[1]):2};}
    /* 6: innerHTML */
    try{var html=(doc.body||{innerHTML:''}).innerHTML;var hm=html.match(/"nextPageToken"\s*:\s*"([A-Za-z0-9+\/=]{10,})"/);var hp=html.match(/"pageNumber"\s*:\s*(\d+)/);if(hm)return{token:hm[1],page:hp?parseInt(hp[1]):2};}catch(e){}
    return null;
  }

  /* ── 次ページURL取得（disabled含むa-lastも参照、前進方向チェック付き） ── */
  function getNextUrl(doc, curPageNum){
    curPageNum = curPageNum || 1;

    /* 1: .a-last リンク（disabledも含めて取得し、hrefがあれば使用） */
    var el = doc.querySelector('.a-pagination .a-last a') || doc.querySelector('li.a-last a');
    if(el){
      var h = el.getAttribute('href') || '';
      var pgM = h.match(/pageNumber=(\d+)/);
      if(h && pgM && parseInt(pgM[1]) > curPageNum)
        return h.startsWith('/') ? 'https://www.amazon.co.jp'+h : h;
    }

    /* 2: nextPageToken付きリンクで最大ページ番号を探す */
    var allLinks = doc.querySelectorAll('a[href*="nextPageToken"]');
    var bestHref = null, bestPage = curPageNum;
    for(var li = 0; li < allLinks.length; li++){
      var lh = allLinks[li].getAttribute('href') || '';
      var lm = lh.match(/pageNumber=(\d+)/);
      if(lm && parseInt(lm[1]) > bestPage){ bestPage = parseInt(lm[1]); bestHref = lh; }
    }
    if(bestHref) return bestHref.startsWith('/') ? 'https://www.amazon.co.jp'+bestHref : bestHref;

    /* 3: フォームのnextPageToken（ページ番号が前進する場合） */
    var forms = doc.querySelectorAll('form');
    for(var fi = 0; fi < forms.length; fi++){
      var tIn = forms[fi].querySelector('input[name="nextPageToken"]');
      if(!tIn || !tIn.value) continue;
      var pIn = forms[fi].querySelector('input[name="pageNumber"]');
      var pg = pIn ? parseInt(pIn.value) : curPageNum + 1;
      if(pg > curPageNum)
        return 'https://www.amazon.co.jp/product-reviews/'+asin+'/?sortBy=recent&pageNumber='+pg+'&nextPageToken='+encodeURIComponent(tIn.value);
    }

    /* 4: findTokenInDoc（前進する場合のみ） */
    var found = findTokenInDoc(doc);
    if(found && found.token && found.page > curPageNum)
      return 'https://www.amazon.co.jp/product-reviews/'+asin+'/?sortBy=recent&pageNumber='+found.page+'&nextPageToken='+encodeURIComponent(found.token);

    return null;
  }

  function avg(list){var v=list.filter(function(r){return r.rating>0;});return v.length?(v.reduce(function(s,r){return s+r.rating;},0)/v.length).toFixed(2):null;}

  function distChart(reviews,label,color){
    var dist={1:0,2:0,3:0,4:0,5:0};reviews.forEach(function(r){var s=Math.round(r.rating);if(dist[s]!==undefined)dist[s]++;});
    var total=reviews.length,maxD=Math.max.apply(null,[1,2,3,4,5].map(function(s){return dist[s];}))||1,a=avg(reviews);
    var bars=[5,4,3,2,1].map(function(s){var cnt=dist[s],pct=total>0?Math.round(cnt/total*100):0,w=Math.round(cnt/maxD*100),bc=s>=4?'#22C55E':(s===3?'#94A3B8':'#FF4B4B');
      return '<div style="display:flex;align-items:center;gap:5px;margin-bottom:3px"><span style="color:#FF9900;font-size:11px;width:12px;text-align:right">'+s+'</span><span style="color:#FF9900;font-size:10px">★</span><div style="flex:1;height:9px;background:#1E3A5F;border-radius:3px;overflow:hidden"><div style="height:100%;width:'+w+'%;background:'+bc+';border-radius:3px"></div></div><span style="font-size:10px;color:#E2E8F0;width:22px;text-align:right">'+cnt+'</span><span style="font-size:10px;color:#64748B;width:38px">('+pct+'%)</span></div>';}).join('');
    return '<div style="margin-bottom:14px"><div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px"><span style="font-size:11px;font-weight:700;color:'+color+'">'+label+'</span><span style="font-size:14px;font-weight:700;color:'+color+'">'+(a||'?')+'★　<span style="font-size:11px;color:#64748B;font-weight:400">'+total+'件</span></span></div>'+bars+'</div>';
  }

  function monthChart(reviews){
    var counts={};reviews.forEach(function(r){var ym=toYM(r.date);if(ym)counts[ym]=(counts[ym]||0)+1;});
    var months=Object.keys(counts).sort().reverse();if(!months.length)return '';
    var total=reviews.length,maxC=Math.max.apply(null,months.map(function(k){return counts[k];}));
    var bars=months.slice(0,12).map(function(ym){var cnt=counts[ym],pct=Math.round(cnt/total*100),w=Math.round(cnt/maxC*100);
      return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px"><span style="font-size:11px;color:#94A3B8;width:52px;flex-shrink:0">'+ym+'</span><div style="flex:1;height:14px;background:#1E3A5F;border-radius:3px;overflow:hidden"><div style="height:100%;width:'+w+'%;background:#22C55E;border-radius:3px"></div></div><span style="font-size:11px;color:#E2E8F0;width:36px;text-align:right;flex-shrink:0">'+cnt+'件</span><span style="font-size:11px;color:#64748B;width:32px;flex-shrink:0">'+pct+'%</span></div>';}).join('');
    return '<div style="padding:12px 16px;background:#162032;border-bottom:1px solid #1E3A5F"><div style="font-size:11px;font-weight:700;color:#94A3B8;margin-bottom:8px">📅 月別レビュー数</div>'+bars+'</div>';
  }

  function upsertProg(page,count){
    var el=document.getElementById('_bhl_amz_prog');
    if(!el){el=document.createElement('div');el.id='_bhl_amz_prog';el.style.cssText='position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#0F172A;color:#fff;padding:8px 16px;font-family:sans-serif;font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,.5);display:flex;align-items:center;gap:12px';
      if(!document.getElementById('_bhl_sty')){var s=document.createElement('style');s.id='_bhl_sty';s.textContent='@keyframes _bhlp{0%{opacity:.4}50%{opacity:1}100%{opacity:.4}}';document.head.appendChild(s);}document.body.appendChild(el);}
    el.innerHTML='<span style="color:#FF9900;font-weight:700">★ Amazonレビュー取得中</span><span style="color:#94A3B8">'+page+'ページ目　累計 <strong style="color:#fff">'+count+'</strong> 件</span><div style="flex:1;height:6px;background:#1E3A5F;border-radius:3px;overflow:hidden"><div style="height:100%;width:40%;background:linear-gradient(90deg,#FF9900,#FFD700);border-radius:3px;animation:_bhlp 1s ease-in-out infinite"></div></div><span style="color:#64748B;font-size:10px">再クリックで中断</span>';
  }

  function playDone(){try{var ctx=new(window.AudioContext||window.webkitAudioContext)();[[523,0],[659,.15],[784,.3],[1047,.5]].forEach(function(n){var o=ctx.createOscillator(),g=ctx.createGain();o.connect(g);g.connect(ctx.destination);o.frequency.value=n[0];o.type='sine';g.gain.setValueAtTime(.3,ctx.currentTime+n[1]);g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+n[1]+.4);o.start(ctx.currentTime+n[1]);o.stop(ctx.currentTime+n[1]+.5);});}catch(e){}}

  window._bhlAmzCSV=function(){var vis=[];document.querySelectorAll('#_bhl_amz_list [data-idx]').forEach(function(el){if(el.style.display!=='none'){var idx=parseInt(el.getAttribute('data-idx'));if(window._bhlAmzAllReviews&&window._bhlAmzAllReviews[idx])vis.push(window._bhlAmzAllReviews[idx]);}});if(!vis.length){alert('表示中のレビューがありません');return;}var rows=[['評価','Vine','タイトル','本文','レビュー日']];vis.forEach(function(r){rows.push([r.rating,r.vine?'Vine':'非Vine',r.title,r.body.replace(/\n/g,' ').replace(/\r/g,''),r.date]);});var csv=rows.map(function(r){return r.map(function(c){return'"'+String(c||'').replace(/"/g,'""')+'"';}).join(',');}).join('\n');var a=document.createElement('a');a.href='data:text/csv;charset=utf-8,\uFEFF'+encodeURIComponent(csv);a.download='amazon_reviews_'+asin+'_'+vis.length+'件.csv';a.click();};

  window._bhlAmzFilter=function(f,btn){document.querySelectorAll('#_bhl_amz_panel button[data-f]').forEach(function(b){var cs={all:'#FF9900',good:'#22C55E',mid:'#94A3B8',bad:'#FF4B4B',vine:'#8B5CF6',novine:'#06B6D4'};var c=cs[b.getAttribute('data-f')]||'#94A3B8';b.style.background='transparent';b.style.color=c;b.style.borderColor=c;});var cs={all:'#FF9900',good:'#22C55E',mid:'#94A3B8',bad:'#FF4B4B',vine:'#8B5CF6',novine:'#06B6D4'};btn.style.background=cs[f]||'#94A3B8';btn.style.color=f==='all'?'#000':'#fff';document.querySelectorAll('#_bhl_amz_list [data-idx]').forEach(function(el){var rs=Math.round(parseFloat(el.getAttribute('data-r')||'0'));var v=el.getAttribute('data-vine')==='1';el.style.display=(f==='all'?true:f==='good'?rs>=4:f==='mid'?rs===3:f==='bad'?(rs<=2&&rs>0):f==='vine'?v:f==='novine'?!v:false)?'':'none';});};

  function showPanel(reviews,productTitle){
    var prog=document.getElementById('_bhl_amz_prog');if(prog)prog.remove();
    var vRv=reviews.filter(function(r){return r.vine;}),nvRv=reviews.filter(function(r){return !r.vine;});
    var vC=vRv.length,nvC=nvRv.length,vP=reviews.length>0?Math.round(vC/reviews.length*100):0;
    var goodC=reviews.filter(function(r){return Math.round(r.rating)>=4;}).length;
    var midC=reviews.filter(function(r){return Math.round(r.rating)===3;}).length;
    var badC=reviews.filter(function(r){var s=Math.round(r.rating);return s<=2&&s>0;}).length;
    var aAll=avg(reviews)||'?';
    var listHTML=reviews.slice(0,300).map(function(r,i){
      var rnd=Math.round(r.rating),stars='★'.repeat(rnd)+'☆'.repeat(5-rnd);
      var vb=r.vine?'<span style="background:#3B1E6E;color:#C4B5FD;padding:2px 6px;border-radius:10px;font-size:10px;margin-right:3px">Vine</span>':'<span style="background:#0E4B5F;color:#67E8F9;padding:2px 6px;border-radius:10px;font-size:10px;margin-right:3px">Amazonで購入</span>';
      var lbl=rnd<=2&&rnd>0?'<span style="background:#FF4B4B22;color:#FF4B4B;font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px">悪い</span>':rnd>=4?'<span style="background:#22C55E22;color:#22C55E;font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px">良い</span>':rnd===3?'<span style="background:#94A3B822;color:#94A3B8;font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px">普通</span>':'';
      var bc=rnd<=2&&rnd>0?'#FF4B4B':(rnd>=4?'#22C55E':'#94A3B8');
      return '<div data-idx="'+i+'" data-r="'+r.rating+'" data-vine="'+(r.vine?'1':'0')+'" style="border-left:3px solid '+bc+';padding:10px 10px 10px 12px;margin-top:8px;background:#162032;border-radius:0 6px 6px 0"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;margin-bottom:4px"><div><span style="color:#FF9900;font-size:13px;letter-spacing:1px">'+stars+'</span> <span style="color:#FF9900;font-size:11px;font-weight:700">'+(r.rating>0?r.rating.toFixed(1):'?')+'</span> '+lbl+'</div><span style="font-size:10px;color:#475569;white-space:nowrap;flex-shrink:0">'+r.date+'</span></div>'+(r.title?'<div style="font-weight:600;color:#CBD5E1;margin-bottom:3px;font-size:12px">'+r.title+'</div>':'')+'<div style="margin-bottom:4px">'+vb+'</div><div style="color:#94A3B8;font-size:12px;line-height:1.6">'+r.body.replace(/\n/g,'<br>').substring(0,300)+(r.body.length>300?'…':'')+'</div></div>';
    }).join('');
    var panel=document.createElement('div');panel.id='_bhl_amz_panel';
    panel.style.cssText='position:fixed;top:16px;right:16px;z-index:2147483647;width:480px;max-height:90vh;overflow-y:auto;background:#0F172A;color:#E2E8F0;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.7);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:13px;line-height:1.5';
    panel.innerHTML='<div style="background:#1E3A5F;padding:14px 16px;border-radius:12px 12px 0 0;display:flex;align-items:center;gap:10px"><div style="background:#FF9900;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0">★</div><div style="flex:1;min-width:0"><div style="font-weight:700;font-size:14px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+productTitle+'</div><div style="font-size:11px;color:#94A3B8;margin-top:2px">ASIN: '+asin+'　<span style="color:#FF9900">'+reviews.length+'件取得</span></div></div>'
      +'<button onclick="try{sessionStorage.removeItem(\''+SESS_KEY+'\');}catch(e){} document.getElementById(\'_bhl_amz_panel\').remove();alert(\'リセットしました。次回クリックで最初から取得します。\');" style="background:#1E293B;border:1px solid #334155;color:#94A3B8;font-size:11px;cursor:pointer;padding:4px 8px;border-radius:4px;margin-right:4px">🔄</button>'
      +'<button onclick="document.getElementById(\'_bhl_amz_panel\').remove()" style="background:none;border:none;color:#94A3B8;font-size:22px;cursor:pointer;padding:0 0 0 4px;line-height:1">&times;</button></div>'
      +'<div style="display:flex;align-items:center;justify-content:center;gap:20px;padding:12px 16px;background:#162032;border-bottom:1px solid #1E3A5F"><div style="text-align:center"><div style="font-size:28px;font-weight:700;color:#FF9900">'+aAll+'</div><div style="font-size:11px;color:#64748B">★ 全体平均</div></div><div style="width:1px;height:40px;background:#1E3A5F"></div><div style="text-align:center"><div style="font-size:28px;font-weight:700;color:#fff">'+reviews.length+'</div><div style="font-size:11px;color:#64748B">件取得</div></div><div style="width:1px;height:40px;background:#1E3A5F"></div><div style="text-align:center"><div style="font-size:20px;font-weight:700;color:#C4B5FD">'+vC+'<span style="font-size:12px;color:#64748B"> Vine</span></div><div style="font-size:11px;color:#64748B">'+vP+'%</div></div><div style="text-align:center"><div style="font-size:20px;font-weight:700;color:#67E8F9">'+nvC+'<span style="font-size:12px;color:#64748B"> 非Vine</span></div><div style="font-size:11px;color:#64748B">'+(100-vP)+'%</div></div></div>'
      +monthChart(reviews)
      +'<div style="padding:14px 16px;background:#162032;border-bottom:1px solid #1E3A5F">'+distChart(reviews,'■ 全体','#FF9900')+distChart(vRv,'■ Vine（Amazonで購入なし）','#C4B5FD')+distChart(nvRv,'■ 非Vine（Amazonで購入）','#67E8F9')+'</div>'
      +'<div style="padding:10px 16px;border-bottom:1px solid #1E3A5F"><div style="font-size:10px;color:#475569;margin-bottom:6px">良い＝★5・4　普通＝★3　悪い＝★2・1　／　Vine＝Amazonで購入なし</div><div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center"><button data-f="all" onclick="_bhlAmzFilter(\'all\',this)" style="padding:5px 10px;border-radius:20px;border:1px solid #FF9900;background:#FF9900;color:#000;font-size:11px;font-weight:700;cursor:pointer">全て('+reviews.length+')</button><button data-f="good" onclick="_bhlAmzFilter(\'good\',this)" style="padding:5px 10px;border-radius:20px;border:1px solid #22C55E;background:transparent;color:#22C55E;font-size:11px;cursor:pointer">★5・4 良い('+goodC+')</button><button data-f="mid" onclick="_bhlAmzFilter(\'mid\',this)" style="padding:5px 10px;border-radius:20px;border:1px solid #94A3B8;background:transparent;color:#94A3B8;font-size:11px;cursor:pointer">★3 普通('+midC+')</button><button data-f="bad" onclick="_bhlAmzFilter(\'bad\',this)" style="padding:5px 10px;border-radius:20px;border:1px solid #FF4B4B;background:transparent;color:#FF4B4B;font-size:11px;cursor:pointer">★2・1 悪い('+badC+')</button><button data-f="vine" onclick="_bhlAmzFilter(\'vine\',this)" style="padding:5px 10px;border-radius:20px;border:1px solid #8B5CF6;background:transparent;color:#C4B5FD;font-size:11px;cursor:pointer">Vine('+vC+')</button><button data-f="novine" onclick="_bhlAmzFilter(\'novine\',this)" style="padding:5px 10px;border-radius:20px;border:1px solid #06B6D4;background:transparent;color:#67E8F9;font-size:11px;cursor:pointer">非Vine('+nvC+')</button><button onclick="_bhlAmzCSV()" style="margin-left:auto;padding:5px 10px;border-radius:20px;border:1px solid #3B82F6;background:transparent;color:#3B82F6;font-size:11px;cursor:pointer">📥 CSV</button></div></div>'
      +'<div id="_bhl_amz_list" style="padding:8px 16px 16px">'+listHTML+'</div>'
      +'<div style="padding:10px 16px;background:#162032;border-top:1px solid #1E3A5F;border-radius:0 0 12px 12px;text-align:center;font-size:11px;color:#475569">'+(reviews.length>300?reviews.length+'件中300件表示。全件はCSVで確認できます。':'全'+reviews.length+'件を表示中')+'</div>';
    document.body.appendChild(panel);window._bhlAmzAllReviews=reviews;
  }

  /* ── セッションストレージキー ── */
  var SESS_KEY = '_bhl_amz_sess_' + asin;
  var STAR_PHASES = [
    {f:'five_star',s:'recent'},{f:'four_star',s:'recent'},
    {f:'three_star',s:'recent'},{f:'two_star',s:'recent'},{f:'one_star',s:'recent'},
    {f:'five_star',s:'helpful'},{f:'four_star',s:'helpful'},
    {f:'three_star',s:'helpful'},{f:'two_star',s:'helpful'},{f:'one_star',s:'helpful'}
  ];
  var starIndex = -1;

  var sessionData = null;
  try { sessionData = JSON.parse(sessionStorage.getItem(SESS_KEY) || 'null'); } catch(e) {}
  window._bhlAmzRunning = true;

  if(sessionData && sessionData.asin === asin && sessionData.reviews && sessionData.reviews.length > 0){
    _seen = {}; sessionData.reviews.forEach(function(r){ markSeen(r.rid||'',r.body||'',r.date||''); });
  } else { _seen = {}; sessionData = null; }

  var allReviews = sessionData ? sessionData.reviews.slice() : parseReviews(document);
  var ptEl = document.querySelector('#productTitle,h1.a-size-large');
  var productTitle = ptEl ? ptEl.textContent.trim() : 'ASIN: '+asin;
  var pageCount = 1;
  var _fetched = {};
  upsertProg(pageCount, allReviews.length);

  /* ── AJAXエンドポイントで取得（トークン不要・タイムアウト付き） ── */
  function fetchAjax(pg, filter, sort, cb){
    var params = new URLSearchParams({
      sortBy: sort||'recent', reviewerType:'all_reviews',
      formatType:'all_formats', mediaType:'all_contents',
      filterByStar: filter||'all_stars', pageSize:'10',
      pageNumber: String(pg), asin: asin,
      scope:'reviewsAjax1', language:'ja_JP'
    });
    var key = asin+'|'+(filter||'all')+'|'+(sort||'recent')+'|'+pg;
    if(_fetched[key]){ cb(null); return; }
    _fetched[key] = true;
    var ctrl = new AbortController();
    var tid = setTimeout(function(){ ctrl.abort(); }, 8000);
    fetch('https://www.amazon.co.jp/hz/reviews-render/ajax/reviews/get',{
      method:'POST', credentials:'include', signal: ctrl.signal,
      headers:{'Content-Type':'application/x-www-form-urlencoded','X-Requested-With':'XMLHttpRequest'},
      body: params.toString()
    }).then(function(r){return r.text();}).then(function(txt){
      clearTimeout(tid);
      var doc;
      try{
        var j=JSON.parse(txt);
        if(j.html){ doc=(new DOMParser()).parseFromString(j.html,'text/html'); }
        else if(j[0]&&j[0].html){ doc=(new DOMParser()).parseFromString(j[0].html,'text/html'); }
      }catch(e){}
      if(!doc){ doc=(new DOMParser()).parseFromString(txt,'text/html'); }
      cb(doc);
    }).catch(function(){ clearTimeout(tid); cb(null); });
  }

  /* ── フォールバック: 通常fetch ── */
  function fetchPage(url, cb){
    var k = url.replace(/[?&]t=\d+/,'');
    if(_fetched[k]){ cb(null); return; }
    _fetched[k] = true;
    fetch(url,{credentials:'include'}).then(function(r){return r.text();})
      .then(function(html){ cb((new DOMParser()).parseFromString(html,'text/html')); })
      .catch(function(){ cb(null); });
  }

  /* ── フェーズ1: AJAXで全ページ取得 ── */
  var ajaxFailed = false;

  function runAjax(pg, filter, sort, onDone){
    if(!window._bhlAmzRunning){ onDone(); return; }
    fetchAjax(pg, filter, sort, function(doc){
      if(!doc||!window._bhlAmzRunning){ ajaxFailed=true; onDone(); return; }
      var rv = parseReviews(doc);
      if(rv.length === 0){ onDone(); return; }
      pageCount++; allReviews = allReviews.concat(rv);
      upsertProg(pageCount, allReviews.length);
      setTimeout(function(){ runAjax(pg+1, filter, sort, onDone); }, 400);
    });
  }

  /* AJAXで all_stars をページ2から取得（ページ1はlive DOMから取得済み） */
  function startAjaxPhase(){
    runAjax(2, 'all_stars', 'recent', function(){
      if(!ajaxFailed){
        /* AJAXが機能 → 星フィルターもAJAXで */
        runAjaxStars();
      } else {
        /* AJAXが機能しない → 従来方式にフォールバック */
        var firstNext = getNextUrl(document, 1);
        if(firstNext){ runChain(firstNext, 2); } else { runStars(); }
      }
    });
  }

  var ajaxStarIndex = -1;
  function runAjaxStars(){
    ajaxStarIndex++;
    if(ajaxStarIndex >= STAR_PHASES.length || !window._bhlAmzRunning){ finish(); return; }
    var ph = STAR_PHASES[ajaxStarIndex];
    runAjax(1, ph.f, ph.s, function(){
      setTimeout(runAjaxStars, 200);
    });
  }

  /* ── フォールバック: トークンチェーン ── */
  function runChain(url, pg){
    if(!url||!window._bhlAmzRunning){ runStars(); return; }
    fetchPage(url, function(doc){
      if(!doc||!window._bhlAmzRunning){ runStars(); return; }
      var rv=parseReviews(doc); pageCount++; allReviews=allReviews.concat(rv);
      upsertProg(pageCount,allReviews.length);
      var nx=getNextUrl(doc,pg);
      if(nx&&rv.length>0){ setTimeout(function(){runChain(nx,pg+1);},600); }
      else { runStars(); }
    });
  }

  /* ── フォールバック: 星フィルター ── */
  function runStars(){
    starIndex++;
    if(starIndex>=STAR_PHASES.length||!window._bhlAmzRunning){ finish(); return; }
    var ph=STAR_PHASES[starIndex];
    var url='https://www.amazon.co.jp/product-reviews/'+asin+'/?sortBy='+ph.s+'&filterByStar='+ph.f;
    fetchPage(url,function(doc){
      if(!doc||!window._bhlAmzRunning){ setTimeout(runStars,300); return; }
      var rv=parseReviews(doc); pageCount++; allReviews=allReviews.concat(rv);
      upsertProg(pageCount,allReviews.length);
      var nx=getNextUrl(doc,1);
      if(nx&&rv.length>0){ setTimeout(function(){runStarPages(nx,2);},600); }
      else { setTimeout(runStars,300); }
    });
  }

  function runStarPages(url,pg){
    if(!url||!window._bhlAmzRunning){ setTimeout(runStars,300); return; }
    fetchPage(url,function(doc){
      if(!doc||!window._bhlAmzRunning){ setTimeout(runStars,300); return; }
      var rv=parseReviews(doc); pageCount++; allReviews=allReviews.concat(rv);
      upsertProg(pageCount,allReviews.length);
      var nx=getNextUrl(doc,pg);
      if(nx&&rv.length>0){ setTimeout(function(){runStarPages(nx,pg+1);},600); }
      else { setTimeout(runStars,300); }
    });
  }

  function finish(){
    window._bhlAmzRunning=false;
    try{sessionStorage.setItem(SESS_KEY,JSON.stringify({asin:asin,reviews:allReviews}));}catch(e){}
    showPanel(allReviews,productTitle); playDone();
    var vc=allReviews.filter(function(r){return r.vine;}).length;
    setTimeout(function(){
      alert('✅ レビュー取得完了！\n\n合計 '+allReviews.length+' 件\n├ Vine（Amazonで購入なし）: '+vc+' 件\n└ 非Vine（Amazonで購入）: '+(allReviews.length-vc)+' 件');
    },500);
  }

  /* ── スタート ── */
  /* ページ2以降はAJAXエンドポイントで取得を試みる */
  /* ページ1は既にlive DOMから取得済み */
  startAjaxPhase();

  } /* end runTool */

})();
