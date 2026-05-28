/* Amazon レビュー取得ツール v7.0 — bh life */
(function () {
  'use strict';

  /* ── ASIN ── */
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
    alert('取得を中断しました');
    return;
  }

  /* ── 評価パース ── */
  function parseRating(el) {
    if (!el) return 0;
    var t = el.textContent || '';
    var m1 = t.match(/のうち\s*(\d+(?:\.\d+)?)/); if (m1) return parseFloat(m1[1]);
    var m2 = t.match(/^(\d+(?:\.\d+)?)\s*out/);   if (m2) return parseFloat(m2[1]);
    return 0;
  }

  /* ── タイトルパース ── */
  function parseTitle(el) {
    if (!el) return '';
    var c = el.cloneNode(true);
    c.querySelectorAll('.a-icon-alt,i.a-icon').forEach(function(n){ n.parentNode&&n.parentNode.removeChild(n); });
    return c.textContent.replace(/\s+/g,' ').trim();
  }

  /* ── Vine判定：data-hook または vine URL リンク ── */
  function isVine(el) {
    if (el.querySelector('[data-hook="avp-badge-linkless"],[data-hook="avp-badge"]')) return true;
    var links = el.querySelectorAll('a[href]');
    for (var i=0;i<links.length;i++){
      if ((links[i].href||'').indexOf('vine')>=0) return true;
    }
    /* 短いテキスト要素でVineバッジ文言を探す */
    var spans = el.querySelectorAll('span,a');
    for (var j=0;j<spans.length;j++){
      var t=(spans[j].textContent||'').trim();
      if (t.length>10 && t.length<120 && t.indexOf('Vine先取りプログラムカスタマー')>=0) return true;
    }
    return false;
  }

  /* ── 日付 → YYYY/MM ── */
  function toYM(dateStr) {
    var m = dateStr.match(/(\d{4})年(\d{1,2})月/);
    return m ? m[1]+'/'+(('0'+m[2]).slice(-2)) : null;
  }

  /* ── レビューをパース ── */
  function parseReviews(doc) {
    var reviews=[];
    doc.querySelectorAll('[data-hook="review"]').forEach(function(el){
      var rEl = el.querySelector('i[data-hook="review-star-rating"] .a-icon-alt')
              ||el.querySelector('span[data-hook="review-star-rating"] .a-icon-alt')
              ||el.querySelector('[data-hook="cmps-review-star-rating"] .a-icon-alt');
      var rating = parseRating(rEl);
      var title  = parseTitle(el.querySelector('[data-hook="review-title"]'));
      var bEl    = el.querySelector('[data-hook="review-body"] span');
      var body   = bEl?bEl.textContent.trim():'';
      var dEl    = el.querySelector('[data-hook="review-date"]');
      var date   = dEl?dEl.textContent.replace('日本でレビュー済み -','').trim():'';
      var vine   = isVine(el);
      if (body||title) reviews.push({rating:rating,title:title,body:body,date:date,vine:vine});
    });
    return reviews;
  }

  /* ── 平均値 ── */
  function avg(list){
    var v=list.filter(function(r){return r.rating>0;});
    if(!v.length) return null;
    return (v.reduce(function(s,r){return s+r.rating;},0)/v.length).toFixed(2);
  }

  /* ── 評価分布グラフ HTML ── */
  function distChart(reviews, label, color) {
    var dist={1:0,2:0,3:0,4:0,5:0};
    reviews.forEach(function(r){var s=Math.round(r.rating);if(dist[s]!==undefined)dist[s]++;});
    var total=reviews.length, maxD=Math.max.apply(null,[1,2,3,4,5].map(function(s){return dist[s];}))||1;
    var a=avg(reviews);
    var bars=[5,4,3,2,1].map(function(s){
      var cnt=dist[s], pct=total>0?Math.round(cnt/total*100):0, w=Math.round(cnt/maxD*100);
      var bc=s>=4?'#22C55E':(s===3?'#94A3B8':'#FF4B4B');
      return '<div style="display:flex;align-items:center;gap:5px;margin-bottom:3px">'
        +'<span style="color:#FF9900;font-size:11px;width:12px;text-align:right">'+s+'</span>'
        +'<span style="color:#FF9900;font-size:10px">★</span>'
        +'<div style="flex:1;height:9px;background:#1E3A5F;border-radius:3px;overflow:hidden">'
        +'<div style="height:100%;width:'+w+'%;background:'+bc+';border-radius:3px"></div></div>'
        +'<span style="font-size:10px;color:#E2E8F0;width:22px;text-align:right">'+cnt+'</span>'
        +'<span style="font-size:10px;color:#64748B;width:36px">('+pct+'%)</span>'
        +'</div>';
    }).join('');
    return '<div style="margin-bottom:14px">'
      +'<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px">'
      +'<span style="font-size:11px;font-weight:700;color:'+color+'">'+label+'</span>'
      +'<span style="font-size:14px;font-weight:700;color:'+color+'">'+(a?a:'?')+'★　<span style="font-size:11px;color:#64748B;font-weight:400">'+total+'件</span></span>'
      +'</div>'+bars+'</div>';
  }

  /* ── 月別グラフ HTML ── */
  function monthChart(reviews) {
    var counts={};
    reviews.forEach(function(r){
      var ym=toYM(r.date);
      if(ym) counts[ym]=(counts[ym]||0)+1;
    });
    var months=Object.keys(counts).sort().reverse();
    if(!months.length) return '';
    var total=reviews.length;
    var maxC=Math.max.apply(null,months.map(function(m){return counts[m];}));
    var bars=months.slice(0,12).map(function(ym){
      var cnt=counts[ym], pct=Math.round(cnt/total*100), w=Math.round(cnt/maxC*100);
      return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">'
        +'<span style="font-size:11px;color:#94A3B8;width:52px;flex-shrink:0">'+ym+'</span>'
        +'<div style="flex:1;height:14px;background:#1E3A5F;border-radius:3px;overflow:hidden">'
        +'<div style="height:100%;width:'+w+'%;background:#22C55E;border-radius:3px"></div></div>'
        +'<span style="font-size:11px;color:#E2E8F0;width:36px;text-align:right;flex-shrink:0">'+cnt+'件</span>'
        +'<span style="font-size:11px;color:#64748B;width:32px;flex-shrink:0">'+pct+'%</span>'
        +'</div>';
    }).join('');
    return '<div style="padding:12px 16px;background:#162032;border-bottom:1px solid #1E3A5F">'
      +'<div style="font-size:11px;font-weight:700;color:#94A3B8;margin-bottom:8px">📅 月別レビュー数</div>'
      +bars+'</div>';
  }

  /* ── 進捗バー ── */
  function upsertProgress(page,total,count){
    var el=document.getElementById('_bhl_amz_prog');
    if(!el){
      el=document.createElement('div');
      el.id='_bhl_amz_prog';
      el.style.cssText='position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#0F172A;color:#fff;padding:8px 16px;font-family:sans-serif;font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,.5);display:flex;align-items:center;gap:12px';
      if(!document.getElementById('_bhl_sty')){
        var s=document.createElement('style');s.id='_bhl_sty';
        s.textContent='@keyframes _bhlp{0%{opacity:.4}50%{opacity:1}100%{opacity:.4}}';
        document.head.appendChild(s);
      }
      document.body.appendChild(el);
    }
    var pct=total>1?Math.round(page/total*100):0;
    el.innerHTML='<span style="color:#FF9900;font-weight:700">★ Amazonレビュー取得中</span>'
      +'<span style="color:#94A3B8">'+page+' / '+(total>1?total:'?')+'ページ　累計 <strong style="color:#fff">'+count+'</strong> 件</span>'
      +'<div style="flex:1;height:6px;background:#1E3A5F;border-radius:3px;overflow:hidden">'
      +'<div style="height:100%;width:'+(pct||15)+'%;background:linear-gradient(90deg,#FF9900,#FFD700);border-radius:3px;'+(pct?'':'animation:_bhlp 1s ease-in-out infinite')+'"></div></div>'
      +'<span style="color:#64748B;font-size:10px">再クリックで中断</span>';
  }

  /* ── 完了音 ── */
  function playDone(){
    try{
      var ctx=new(window.AudioContext||window.webkitAudioContext)();
      [[523,0],[659,.15],[784,.3],[1047,.5]].forEach(function(n){
        var o=ctx.createOscillator(),g=ctx.createGain();
        o.connect(g);g.connect(ctx.destination);
        o.frequency.value=n[0];o.type='sine';
        g.gain.setValueAtTime(.3,ctx.currentTime+n[1]);
        g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+n[1]+.4);
        o.start(ctx.currentTime+n[1]);o.stop(ctx.currentTime+n[1]+.5);
      });
    }catch(e){}
  }

  /* ── CSV（表示中のみ） ── */
  window._bhlAmzCSV=function(){
    var visible=[];
    document.querySelectorAll('#_bhl_amz_list [data-idx]').forEach(function(el){
      if(el.style.display!=='none'){
        var idx=parseInt(el.getAttribute('data-idx'));
        if(window._bhlAmzAllReviews&&window._bhlAmzAllReviews[idx]) visible.push(window._bhlAmzAllReviews[idx]);
      }
    });
    if(!visible.length){alert('表示中のレビューがありません');return;}
    var rows=[['評価','Vine','タイトル','本文','日付']];
    visible.forEach(function(r){rows.push([r.rating,r.vine?'Vine':'',r.title,r.body.replace(/\n/g,' '),r.date]);});
    var csv=rows.map(function(r){return r.map(function(c){return'"'+String(c||'').replace(/"/g,'""')+'"';}).join(',');}).join('\n');
    var a=document.createElement('a');
    a.href='data:text/csv;charset=utf-8,\uFEFF'+encodeURIComponent(csv);
    a.download='amazon_reviews_'+asin+'_'+visible.length+'件.csv';
    a.click();
  };

  /* ── フィルター ── */
  window._bhlAmzFilter=function(f,btn){
    document.querySelectorAll('#_bhl_amz_panel button[data-f]').forEach(function(b){
      var cs={'all':'#FF9900','good':'#22C55E','mid':'#94A3B8','bad':'#FF4B4B','vine':'#8B5CF6','novine':'#06B6D4'};
      var c=cs[b.getAttribute('data-f')]||'#94A3B8';
      b.style.background='transparent';b.style.color=c;b.style.borderColor=c;
    });
    var cs={'all':'#FF9900','good':'#22C55E','mid':'#94A3B8','bad':'#FF4B4B','vine':'#8B5CF6','novine':'#06B6D4'};
    btn.style.background=cs[f]||'#94A3B8';btn.style.color=f==='all'?'#000':'#fff';
    document.querySelectorAll('#_bhl_amz_list [data-idx]').forEach(function(el){
      var r=parseFloat(el.getAttribute('data-r')||'0');
      var rs=Math.round(r);
      var v=el.getAttribute('data-vine')==='1';
      var show=false;
      if(f==='all')    show=true;
      else if(f==='good')   show=(rs>=4);
      else if(f==='mid')    show=(rs===3);
      else if(f==='bad')    show=(rs<=2&&rs>0);
      else if(f==='vine')   show=v;
      else if(f==='novine') show=!v;
      el.style.display=show?'':'none';
    });
  };

  /* ── パネル描画 ── */
  function showPanel(reviews,pages,productTitle){
    var prog=document.getElementById('_bhl_amz_prog');if(prog)prog.remove();
    var vineRv=reviews.filter(function(r){return  r.vine;});
    var noVine=reviews.filter(function(r){return !r.vine;});
    var vineC=vineRv.length, novC=noVine.length;
    var vinePct=reviews.length>0?Math.round(vineC/reviews.length*100):0;
    var goodC=reviews.filter(function(r){return Math.round(r.rating)>=4;}).length;
    var midC =reviews.filter(function(r){return Math.round(r.rating)===3;}).length;
    var badC =reviews.filter(function(r){var s=Math.round(r.rating);return s<=2&&s>0;}).length;
    var aAll=avg(reviews)||'?';

    /* レビューリスト */
    var listHTML=reviews.slice(0,300).map(function(r,i){
      var rnd=Math.round(r.rating);
      var stars='★'.repeat(rnd)+'☆'.repeat(5-rnd);
      var vb=r.vine?'<span style="background:#3B1E6E;color:#C4B5FD;padding:2px 6px;border-radius:10px;font-size:10px;margin-right:3px">Vine</span>':'';
      var negLabel=rnd<=2&&rnd>0?'<span style="background:#FF4B4B22;color:#FF4B4B;font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px">悪い</span>':
                   rnd>=4?'<span style="background:#22C55E22;color:#22C55E;font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px">良い</span>':
                   rnd===3?'<span style="background:#94A3B822;color:#94A3B8;font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px">普通</span>':'';
      var borderColor=rnd<=2&&rnd>0?'#FF4B4B':(rnd>=4?'#22C55E':'#94A3B8');
      return '<div data-idx="'+i+'" data-r="'+r.rating+'" data-vine="'+(r.vine?'1':'0')+'" style="border-left:3px solid '+borderColor+';padding:10px 10px 10px 12px;margin-top:8px;background:#162032;border-radius:0 6px 6px 0">'
        +'<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;margin-bottom:4px">'
        +'<div><span style="color:#FF9900;font-size:13px;letter-spacing:1px">'+stars+'</span>'
        +' <span style="color:#FF9900;font-size:11px;font-weight:700">'+(r.rating>0?r.rating.toFixed(1):'?')+'</span>'
        +' '+negLabel+'</div>'
        +'<span style="font-size:10px;color:#475569;white-space:nowrap;flex-shrink:0">'+r.date+'</span></div>'
        +(r.title?'<div style="font-weight:600;color:#CBD5E1;margin-bottom:3px;font-size:12px">'+r.title+'</div>':'')
        +(vb?'<div style="margin-bottom:4px">'+vb+'</div>':'')
        +'<div style="color:#94A3B8;font-size:12px;line-height:1.6">'+r.body.replace(/\n/g,'<br>').substring(0,280)+(r.body.length>280?'…':'')+'</div>'
        +'</div>';
    }).join('');

    var panel=document.createElement('div');
    panel.id='_bhl_amz_panel';
    panel.style.cssText='position:fixed;top:16px;right:16px;z-index:2147483647;width:480px;max-height:90vh;overflow-y:auto;background:#0F172A;color:#E2E8F0;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.7);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:13px;line-height:1.5';

    panel.innerHTML=
      /* ヘッダー */
      '<div style="background:#1E3A5F;padding:14px 16px;border-radius:12px 12px 0 0;display:flex;align-items:center;gap:10px">'
      +'<div style="background:#FF9900;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0">★</div>'
      +'<div style="flex:1;min-width:0">'
      +'<div style="font-weight:700;font-size:14px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+productTitle+'</div>'
      +'<div style="font-size:11px;color:#94A3B8;margin-top:2px">ASIN: '+asin+'　<span style="color:#FF9900">'+pages+'ページ / '+reviews.length+'件取得</span></div>'
      +'</div>'
      +'<button onclick="document.getElementById(\'_bhl_amz_panel\').remove()" style="background:none;border:none;color:#94A3B8;font-size:22px;cursor:pointer;padding:0 0 0 8px;line-height:1">&times;</button></div>'

      /* 全体サマリー（シンプル1行） */
      +'<div style="display:flex;align-items:center;justify-content:center;gap:24px;padding:12px 16px;background:#162032;border-bottom:1px solid #1E3A5F">'
      +'<div style="text-align:center"><div style="font-size:28px;font-weight:700;color:#FF9900">'+aAll+'</div><div style="font-size:11px;color:#64748B">★ 全体平均</div></div>'
      +'<div style="width:1px;height:40px;background:#1E3A5F"></div>'
      +'<div style="text-align:center"><div style="font-size:28px;font-weight:700;color:#fff">'+reviews.length+'</div><div style="font-size:11px;color:#64748B">件取得</div></div>'
      +'<div style="width:1px;height:40px;background:#1E3A5F"></div>'
      +'<div style="text-align:center"><div style="font-size:22px;font-weight:700;color:#C4B5FD">'+vineC+'<span style="font-size:13px;color:#64748B"> Vine</span></div><div style="font-size:11px;color:#64748B">'+vinePct+'%</div></div>'
      +'<div style="text-align:center"><div style="font-size:22px;font-weight:700;color:#67E8F9">'+novC+'<span style="font-size:13px;color:#64748B"> 非Vine</span></div><div style="font-size:11px;color:#64748B">'+(100-vinePct)+'%</div></div>'
      +'</div>'

      /* 月別グラフ */
      +monthChart(reviews)

      /* 評価分布3段 */
      +'<div style="padding:14px 16px;background:#162032;border-bottom:1px solid #1E3A5F">'
      +distChart(reviews,  '■ 全体（'+reviews.length+'件）',   '#FF9900')
      +distChart(vineRv,   '■ Vine（'+vineC+'件 / '+vinePct+'%）',     '#C4B5FD')
      +distChart(noVine,   '■ 非Vine（'+novC+'件 / '+(100-vinePct)+'%）', '#67E8F9')
      +'</div>'

      /* フィルター */
      +'<div style="padding:10px 16px;border-bottom:1px solid #1E3A5F">'
      +'<div style="font-size:10px;color:#475569;margin-bottom:6px">良い＝★5・4　普通＝★3　悪い＝★2・1</div>'
      +'<div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center">'
      +'<button data-f="all"    onclick="_bhlAmzFilter(\'all\',this)"    style="padding:5px 10px;border-radius:20px;border:1px solid #FF9900;background:#FF9900;color:#000;font-size:11px;font-weight:700;cursor:pointer">全て('+reviews.length+')</button>'
      +'<button data-f="good"   onclick="_bhlAmzFilter(\'good\',this)"   style="padding:5px 10px;border-radius:20px;border:1px solid #22C55E;background:transparent;color:#22C55E;font-size:11px;cursor:pointer">★5・4 良い('+goodC+')</button>'
      +'<button data-f="mid"    onclick="_bhlAmzFilter(\'mid\',this)"    style="padding:5px 10px;border-radius:20px;border:1px solid #94A3B8;background:transparent;color:#94A3B8;font-size:11px;cursor:pointer">★3 普通('+midC+')</button>'
      +'<button data-f="bad"    onclick="_bhlAmzFilter(\'bad\',this)"    style="padding:5px 10px;border-radius:20px;border:1px solid #FF4B4B;background:transparent;color:#FF4B4B;font-size:11px;cursor:pointer">★2・1 悪い('+badC+')</button>'
      +'<button data-f="vine"   onclick="_bhlAmzFilter(\'vine\',this)"   style="padding:5px 10px;border-radius:20px;border:1px solid #8B5CF6;background:transparent;color:#C4B5FD;font-size:11px;cursor:pointer">Vine('+vineC+')</button>'
      +'<button data-f="novine" onclick="_bhlAmzFilter(\'novine\',this)" style="padding:5px 10px;border-radius:20px;border:1px solid #06B6D4;background:transparent;color:#67E8F9;font-size:11px;cursor:pointer">非Vine('+novC+')</button>'
      +'<button onclick="_bhlAmzCSV()" style="margin-left:auto;padding:5px 10px;border-radius:20px;border:1px solid #3B82F6;background:transparent;color:#3B82F6;font-size:11px;cursor:pointer">📥 CSV</button>'
      +'</div></div>'

      /* リスト */
      +'<div id="_bhl_amz_list" style="padding:8px 16px 16px">'+listHTML+'</div>'
      +'<div style="padding:10px 16px;background:#162032;border-top:1px solid #1E3A5F;border-radius:0 0 12px 12px;text-align:center;font-size:11px;color:#475569">'
      +(reviews.length>300?reviews.length+'件中300件表示。全件はCSVで確認できます。':'全'+reviews.length+'件を表示中')+'</div>';

    document.body.appendChild(panel);
    window._bhlAmzAllReviews=reviews;
  }

  /* ── 総ページ数推定 ── */
  function estimateTotalPages(){
    var max=1;
    document.querySelectorAll('.a-pagination li').forEach(function(li){var n=parseInt(li.textContent.trim());if(!isNaN(n)&&n>max)max=n;});
    if(max>1) return max;
    var t1=document.body.innerText.match(/(\d+)\s*件のカスタマーレビュー/);if(t1)return Math.ceil(parseInt(t1[1])/10);
    var t2=document.body.innerText.match(/(\d[\d,]*)\s*件の評価/);if(t2)return Math.ceil(parseInt(t2[1].replace(/,/g,''))/10);
    return 15;
  }

  /* ── メイン ── */
  window._bhlAmzRunning=true;
  var allReviews=parseReviews(document);
  var ptEl=document.querySelector('#productTitle,h1.a-size-large');
  var productTitle=ptEl?ptEl.textContent.trim():'ASIN: '+asin;
  var totalPages=estimateTotalPages();
  upsertProgress(1,totalPages,allReviews.length);
  var baseUrl='https://www.amazon.co.jp/product-reviews/'+asin+'/?sortBy=recent&pageNumber=';

  function fetchPage(page){
    if(!window._bhlAmzRunning) return;
    if(page>totalPages+2){finish();return;}
    fetch(baseUrl+page,{credentials:'include'})
      .then(function(res){return res.text();})
      .then(function(html){
        if(!window._bhlAmzRunning) return;
        var doc=(new DOMParser()).parseFromString(html,'text/html');
        var revs=parseReviews(doc);
        if(revs.length===0){finish();return;}
        allReviews=allReviews.concat(revs);
        upsertProgress(page,totalPages,allReviews.length);
        setTimeout(function(){fetchPage(page+1);},300);
      })
      .catch(function(){finish();});
  }

  function finish(){
    window._bhlAmzRunning=false;
    var pages=Math.ceil(allReviews.length/10)||1;
    showPanel(allReviews,pages,productTitle);
    playDone();
    var vc=allReviews.filter(function(r){return r.vine;}).length;
    setTimeout(function(){
      alert('✅ レビュー取得完了！\n\n合計 '+allReviews.length+' 件\n├ Vine: '+vc+'件\n└ 非Vine: '+(allReviews.length-vc)+'件\n\n「📥 CSV」でダウンロードしてClaudeにアップロードしてください。');
    },500);
  }

  if(totalPages>=2){fetchPage(2);}else{finish();}

})();
