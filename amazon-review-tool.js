/* Amazon レビュー取得ツール v11.3 — bh life
 * 改善点:
 *   - 空ページ判定を緩和: emptyCount >= 3 に変更（連続3回空で停止）
 *   - バリエーション対応: 親ASIN・子ASIN一覧を取得して横展開
 *   - ページ上限引き上げ: nextToken使用時20→25、フォールバック時10→15
 *   - 役立ち順も同様に上限引き上げ
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

  var ep = document.getElementById('_bhl_amz_panel'); if (ep) ep.remove();
  var eb = document.getElementById('_bhl_progress'); if (eb) eb.remove();

  // ── バリエーション（子ASIN）収集 ──
  function collectVariantAsins() {
    var variants = new Set();
    // twisterデータから子ASIN取得
    var scripts = document.querySelectorAll('script');
    for (var i = 0; i < scripts.length; i++) {
      var txt = scripts[i].textContent || '';
      // "asin":"XXXXXXXXXX" 形式
      var re = /"asin"\s*:\s*"([A-Z0-9]{10})"/g;
      var hit;
      while ((hit = re.exec(txt)) !== null) variants.add(hit[1].toUpperCase());
      // dimensionValuesDisplayData の中にも入ることがある
      var re2 = /"([A-Z0-9]{10})"\s*:\s*\{/g;
      while ((hit = re2.exec(txt)) !== null) variants.add(hit[1].toUpperCase());
    }
    // セレクトボックス・ラジオボタンにASINがあるケース
    document.querySelectorAll('[data-asin]').forEach(function(el) {
      var a = (el.getAttribute('data-asin') || '').toUpperCase();
      if (/^[A-Z0-9]{10}$/.test(a)) variants.add(a);
    });
    // 必ず自分自身を含める
    variants.add(asin);
    return Array.from(variants).filter(function(a){ return /^[A-Z0-9]{10}$/.test(a); });
  }

  function parseRating(el) {
    var s = el.querySelector('i[data-hook="review-star-rating"]') || el.querySelector('i[class*="a-star-"]');
    if (s) { var c = (s.className||'').match(/\ba-star-(\d+)\b/); if (c) return parseInt(c[1]); }
    var span = el.querySelector('span[data-hook="review-star-rating"]');
    if (span) { var c2 = (span.className||'').match(/\ba-star-(\d+)\b/); if (c2) return parseInt(c2[1]); }
    return 0;
  }
  function parseTitle(el) {
    if (!el) return ''; var c = el.cloneNode(true);
    c.querySelectorAll('.a-icon-alt,i.a-icon').forEach(function(n){ n.parentNode&&n.parentNode.removeChild(n); });
    return c.textContent.replace(/\s+/g,' ').trim();
  }
  function isVine(el){ return (el.textContent||'').indexOf('Amazonで購入')<0&&(el.textContent||'').indexOf('Verified Purchase')<0; }
  var MO={January:'01',February:'02',March:'03',April:'04',May:'05',June:'06',July:'07',August:'08',September:'09',October:'10',November:'11',December:'12'};
  function cleanDate(raw){
    var j=raw.match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/);if(j)return j[1]+'/'+('0'+j[2]).slice(-2)+'/'+('0'+j[3]).slice(-2);
    var e=raw.match(/(\w+)\s+(\d+),\s+(\d{4})/);if(e&&MO[e[1]])return e[3]+'/'+MO[e[1]]+'/'+('0'+e[2]).slice(-2);
    return raw.replace(/に日本でレビュー済み.*/,'').trim();
  }
  function toYM(d){var m2=d.match(/^(\d{4})\/(\d{2})/);return m2?m2[1]+'/'+m2[2]:null;}

  var _seen={};
  function markSeen(r){_seen['bd:'+(r.body||'').slice(0,60)+'|'+r.date]=true;if(r.rid&&r.rid.length>3)_seen['id:'+r.rid]=true;}
  function isSeen(rid,body,date){if(rid&&rid.length>3&&_seen['id:'+rid])return true;return !!_seen['bd:'+(body||'').slice(0,60)+'|'+date];}

  function parseReviewsFromHtml(html){
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var rv=[];
    doc.querySelectorAll('[data-hook="review"]').forEach(function(el){
      var rating=parseRating(el);
      var titleEl = el.querySelector('[data-hook="review-title"]') || el.querySelector('[class*="review-title"]');
      var title=parseTitle(titleEl);
      var bEl = el.querySelector('[data-hook="review-body"] span') || el.querySelector('[data-hook="review-body"]') || el.querySelector('[class*="review-text"]');
      var body=bEl?bEl.textContent.trim():'';
      var dEl = el.querySelector('[data-hook="review-date"]') || el.querySelector('[class*="review-date"]');
      var date=cleanDate(dEl?dEl.textContent.trim():'');
      var vine=isVine(el),rid=el.id||'';
      if(isSeen(rid,body,date))return;markSeen({rid:rid,body:body,date:date});
      if(body||title)rv.push({rating:rating,title:title,body:body,date:date,vine:vine,rid:rid});
    });
    return rv;
  }

  function findNextToken(html, curPage){
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var links = doc.querySelectorAll('a[href*="nextPageToken"]');
    for(var i=0;i<links.length;i++){
      var h=links[i].getAttribute('href')||'';
      if(h.indexOf('/ap/signin')>=0)continue;
      var tm=h.match(/nextPageToken=([^&"'\s]+)/);var pm=h.match(/pageNumber=(\d+)/);
      if(tm&&pm&&parseInt(pm[1])>curPage)return{token:decodeURIComponent(tm[1]),page:parseInt(pm[1])};
    }
    var forms=doc.querySelectorAll('form');
    for(var fi=0;fi<forms.length;fi++){var tIn=forms[fi].querySelector('input[name="nextPageToken"]');if(tIn&&tIn.value){var pIn=forms[fi].querySelector('input[name="pageNumber"]');return{token:tIn.value,page:pIn?parseInt(pIn.value):curPage+1};}}
    var all=doc.querySelectorAll('*');
    for(var ei=0;ei<all.length;ei++){for(var ai=0;ai<all[ei].attributes.length;ai++){var av=all[ei].attributes[ai].value;if(av.length<10||av.indexOf('nextPageToken')<0||av.indexOf('/ap/signin')>=0)continue;var jm=av.match(/"nextPageToken"\s*:\s*"([^"]+)"/);var jp=av.match(/"pageNumber"\s*:\s*(\d+)/);if(jm)return{token:jm[1],page:jp?parseInt(jp[1]):curPage+1};}}
    return null;
  }

  function delay(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
  var _totalReviews = [];
  function totalCount(){ return _totalReviews.length; }

  function updateProgress(msg){
    var bar = document.getElementById('_bhl_progress');
    if(!bar){ bar=document.createElement('div');bar.id='_bhl_progress';bar.style.cssText='position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#0F172A;color:#fff;padding:14px 20px;font-family:sans-serif;font-size:14px;display:flex;align-items:center;gap:12px;box-shadow:0 2px 12px rgba(0,0,0,.6)';document.body.appendChild(bar); }
    bar.innerHTML='<span style="font-size:20px">★</span><div><div style="font-weight:700;color:#FF9900">レビュー取得中</div><div style="font-size:12px;color:#94A3B8">累計 <strong style="color:#fff;font-size:16px">'+totalCount()+'</strong> 件　'+msg+'</div></div>';
  }
  function removeProgress(){ var bar=document.getElementById('_bhl_progress'); if(bar) bar.remove(); }

  // ▼ 改善①: 空ページ許容を2→3に緩和、ページ上限引き上げ
  function fetchAllPages(baseUrl, label, filterStr, sortBy, targetAsin){
    sortBy = sortBy || 'recent';
    targetAsin = targetAsin || asin;
    var collected=[];
    var emptyCount=0;
    var EMPTY_LIMIT=3;      // ← 2→3に緩和（連続3回空で停止）
    var TOKEN_PAGE_LIMIT=25; // ← 15→25に引き上げ
    var FALLBACK_PAGE_LIMIT=15; // ← 10→15に引き上げ

    function doPage(pageUrl, pageNum){
      return fetch(pageUrl,{credentials:'include'}).then(function(res){return res.text();}).then(function(html){
        var revs=parseReviewsFromHtml(html);
        if(revs.length===0){
          emptyCount++;
          // ▼ 改善②: 空でもnextTokenがあれば追跡継続
          var next=findNextToken(html,pageNum);
          if(emptyCount<EMPTY_LIMIT&&next&&next.token&&pageNum<TOKEN_PAGE_LIMIT){
            var nUrl='https://www.amazon.co.jp/product-reviews/'+targetAsin+'/?sortBy='+sortBy+'&pageNumber='+next.page+'&nextPageToken='+encodeURIComponent(next.token);
            if(filterStr)nUrl+='&filterByStar='+filterStr;
            return delay(500).then(function(){return doPage(nUrl,next.page);});
          }
          if(emptyCount<EMPTY_LIMIT&&pageNum<FALLBACK_PAGE_LIMIT){
            var fUrl='https://www.amazon.co.jp/product-reviews/'+targetAsin+'/?sortBy='+sortBy+'&pageNumber='+(pageNum+1);
            if(filterStr)fUrl+='&filterByStar='+filterStr;
            return delay(500).then(function(){return doPage(fUrl,pageNum+1);});
          }
          return collected;
        } else {
          emptyCount=0; // 取得できたらリセット
          collected=collected.concat(revs);
          revs.forEach(function(r){_totalReviews.push(r);});
          updateProgress(label+' p'+pageNum+' +'+revs.length+'件 (累計'+totalCount()+'件)');
        }
        var next=findNextToken(html,pageNum);
        if(next&&next.token&&pageNum<TOKEN_PAGE_LIMIT){
          var nUrl='https://www.amazon.co.jp/product-reviews/'+targetAsin+'/?sortBy='+sortBy+'&pageNumber='+next.page+'&nextPageToken='+encodeURIComponent(next.token);
          if(filterStr)nUrl+='&filterByStar='+filterStr;
          return delay(400).then(function(){return doPage(nUrl,next.page);});
        }
        if(pageNum<FALLBACK_PAGE_LIMIT&&revs.length>0){
          var fUrl='https://www.amazon.co.jp/product-reviews/'+targetAsin+'/?sortBy='+sortBy+'&pageNumber='+(pageNum+1);
          if(filterStr)fUrl+='&filterByStar='+filterStr;
          return delay(400).then(function(){return doPage(fUrl,pageNum+1);});
        }
        return collected;
      }).catch(function(e){console.warn('fetch err:',e);return collected;});
    }
    var startUrl='https://www.amazon.co.jp/product-reviews/'+targetAsin+'/?sortBy='+sortBy+'&pageNumber=1';
    if(filterStr)startUrl+='&filterByStar='+filterStr;
    return doPage(startUrl,1);
  }

  /* ── グラフ・UI ── */
  function avg(list){var v=list.filter(function(r){return r.rating>0;});return v.length?(v.reduce(function(s,r){return s+r.rating;},0)/v.length).toFixed(2):null;}
  function distChart(reviews,label,color){var dist={1:0,2:0,3:0,4:0,5:0};reviews.forEach(function(r){var s=Math.round(r.rating);if(dist[s]!==undefined)dist[s]++;});var total=reviews.length,maxD=Math.max.apply(null,[1,2,3,4,5].map(function(s){return dist[s];})||1)||1,a=avg(reviews);var bars=[5,4,3,2,1].map(function(s){var cnt=dist[s],pct=total>0?Math.round(cnt/total*100):0,w=Math.round(cnt/maxD*100),bc=s>=4?'#22C55E':(s===3?'#94A3B8':'#FF4B4B');return '<div style="display:flex;align-items:center;gap:5px;margin-bottom:3px"><span style="color:#FF9900;font-size:11px;width:12px;text-align:right">'+s+'</span><span style="color:#FF9900;font-size:10px">★</span><div style="flex:1;height:9px;background:#1E3A5F;border-radius:3px;overflow:hidden"><div style="height:100%;width:'+w+'%;background:'+bc+';border-radius:3px"></div></div><span style="font-size:10px;color:#E2E8F0;width:22px;text-align:right">'+cnt+'</span><span style="font-size:10px;color:#64748B;width:38px">('+pct+'%)</span></div>';}).join('');return '<div style="margin-bottom:14px"><div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px"><span style="font-size:11px;font-weight:700;color:'+color+'">'+label+'</span><span style="font-size:14px;font-weight:700;color:'+color+'">'+(a||'?')+'★　<span style="font-size:11px;color:#64748B;font-weight:400">'+total+'件</span></span></div>'+bars+'</div>';}
  function monthChart(reviews){var counts={};reviews.forEach(function(r){var ym=toYM(r.date);if(ym)counts[ym]=(counts[ym]||0)+1;});var months=Object.keys(counts).sort().reverse();if(!months.length)return '';var total=reviews.length,maxC=Math.max.apply(null,months.map(function(k){return counts[k];}));var bars=months.slice(0,12).map(function(ym){var cnt=counts[ym],pct=Math.round(cnt/total*100),w=Math.round(cnt/maxC*100);return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px"><span style="font-size:11px;color:#94A3B8;width:52px;flex-shrink:0">'+ym+'</span><div style="flex:1;height:14px;background:#1E3A5F;border-radius:3px;overflow:hidden"><div style="height:100%;width:'+w+'%;background:#22C55E;border-radius:3px"></div></div><span style="font-size:11px;color:#E2E8F0;width:36px;text-align:right;flex-shrink:0">'+cnt+'件</span><span style="font-size:11px;color:#64748B;width:32px;flex-shrink:0">'+pct+'%</span></div>';}).join('');return '<div style="padding:12px 16px;background:#162032;border-bottom:1px solid #1E3A5F"><div style="font-size:11px;font-weight:700;color:#94A3B8;margin-bottom:8px">📅 月別レビュー数</div>'+bars+'</div>';}
  function playDone(){try{var ctx=new(window.AudioContext||window.webkitAudioContext)();[[523,0],[659,.15],[784,.3],[1047,.5]].forEach(function(n){var o=ctx.createOscillator(),g=ctx.createGain();o.connect(g);g.connect(ctx.destination);o.frequency.value=n[0];o.type='sine';g.gain.setValueAtTime(.3,ctx.currentTime+n[1]);g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+n[1]+.4);o.start(ctx.currentTime+n[1]);o.stop(ctx.currentTime+n[1]+.5);});}catch(e){}}
  window._bhlAmzCSV=function(){var vis=[];document.querySelectorAll('#_bhl_amz_list [data-idx]').forEach(function(el){if(el.style.display!=='none'){var idx=parseInt(el.getAttribute('data-idx'));if(window._bhlAmzAllReviews&&window._bhlAmzAllReviews[idx])vis.push(window._bhlAmzAllReviews[idx]);}});if(!vis.length){alert('表示中のレビューがありません');return;}var rows=[['評価','Vine','タイトル','本文','レビュー日']];vis.forEach(function(r){rows.push([r.rating,r.vine?'Vine':'非Vine',r.title,r.body.replace(/\n/g,' ').replace(/\r/g,''),r.date]);});var csv=rows.map(function(r){return r.map(function(c){return'"'+String(c||'').replace(/"/g,'""')+'"';}).join(',');}).join('\n');var a2=document.createElement('a');a2.href='data:text/csv;charset=utf-8,\uFEFF'+encodeURIComponent(csv);a2.download='amazon_reviews_'+asin+'_'+vis.length+'件.csv';a2.click();};
  window._bhlAmzFilter=function(f,btn){document.querySelectorAll('#_bhl_amz_panel button[data-f]').forEach(function(b){var cs={all:'#FF9900',good:'#22C55E',mid:'#94A3B8',bad:'#FF4B4B',vine:'#8B5CF6',novine:'#06B6D4'};var c=cs[b.getAttribute('data-f')]||'#94A3B8';b.style.background='transparent';b.style.color=c;b.style.borderColor=c;});var cs={all:'#FF9900',good:'#22C55E',mid:'#94A3B8',bad:'#FF4B4B',vine:'#8B5CF6',novine:'#06B6D4'};btn.style.background=cs[f]||'#94A3B8';btn.style.color=f==='all'?'#000':'#fff';document.querySelectorAll('#_bhl_amz_list [data-idx]').forEach(function(el){var rs=Math.round(parseFloat(el.getAttribute('data-r')||'0'));var v=el.getAttribute('data-vine')==='1';el.style.display=(f==='all'?true:f==='good'?rs>=4:f==='mid'?rs===3:f==='bad'?(rs<=2&&rs>0):f==='vine'?v:f==='novine'?!v:false)?'':'none';});};

  function showPanel(reviews,productTitle,variantCount){
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
      return '<div data-idx="'+i+'" data-r="'+r.rating+'" data-vine="'+(r.vine?'1':'0')+'" style="border-left:3px solid '+bc+';padding:10px 10px 10px 12px;margin-top:8px;background:#162032;border-radius:0 6px 6px 0"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;margin-bottom:4px"><div><span style="color:#FF9900;font-size:13px">'+stars+'</span> <span style="color:#FF9900;font-size:11px;font-weight:700">'+(r.rating>0?r.rating.toFixed(1):'?')+'</span> '+lbl+'</div><span style="font-size:10px;color:#475569">'+r.date+'</span></div>'+(r.title?'<div style="font-weight:600;color:#CBD5E1;margin-bottom:3px;font-size:12px">'+r.title+'</div>':'')+'<div style="margin-bottom:4px">'+vb+'</div><div style="color:#94A3B8;font-size:12px;line-height:1.6">'+r.body.replace(/\n/g,'<br>').substring(0,300)+(r.body.length>300?'…':'')+'</div></div>';
    }).join('');
    var variantNote = variantCount>1 ? '<span style="color:#FBBF24;font-size:10px;margin-left:6px">バリエーション'+variantCount+'件統合</span>' : '';
    var panel=document.createElement('div');panel.id='_bhl_amz_panel';
    panel.style.cssText='position:fixed;top:16px;right:16px;z-index:2147483647;width:480px;max-height:90vh;overflow-y:auto;background:#0F172A;color:#E2E8F0;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.7);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:13px;line-height:1.5';
    panel.innerHTML=
      '<div style="background:#1E3A5F;padding:14px 16px;border-radius:12px 12px 0 0;display:flex;align-items:center;gap:10px"><div style="background:#FF9900;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:17px">★</div><div style="flex:1;min-width:0"><div style="font-weight:700;font-size:14px;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+productTitle+'</div><div style="font-size:11px;color:#94A3B8;margin-top:2px">ASIN: '+asin+'　<span style="color:#FF9900">'+reviews.length+'件取得</span>'+variantNote+'</div></div>'
      +'<button onclick="document.getElementById(\'_bhl_amz_panel\').remove()" style="background:none;border:none;color:#94A3B8;font-size:22px;cursor:pointer">×</button></div>'
      +'<div style="display:flex;align-items:center;justify-content:center;gap:20px;padding:12px 16px;background:#162032;border-bottom:1px solid #1E3A5F"><div style="text-align:center"><div style="font-size:28px;font-weight:700;color:#FF9900">'+aAll+'</div><div style="font-size:11px;color:#64748B">★ 全体平均</div></div><div style="width:1px;height:40px;background:#1E3A5F"></div><div style="text-align:center"><div style="font-size:28px;font-weight:700;color:#fff">'+reviews.length+'</div><div style="font-size:11px;color:#64748B">件取得</div></div><div style="width:1px;height:40px;background:#1E3A5F"></div><div style="text-align:center"><div style="font-size:20px;font-weight:700;color:#C4B5FD">'+vC+'<span style="font-size:12px;color:#64748B"> Vine</span></div><div style="font-size:11px;color:#64748B">'+vP+'%</div></div><div style="text-align:center"><div style="font-size:20px;font-weight:700;color:#67E8F9">'+nvC+'<span style="font-size:12px;color:#64748B"> 非Vine</span></div><div style="font-size:11px;color:#64748B">'+(100-vP)+'%</div></div></div>'
      +monthChart(reviews)
      +'<div style="padding:14px 16px;background:#162032;border-bottom:1px solid #1E3A5F">'+distChart(reviews,'■ 全体','#FF9900')+distChart(vRv,'■ Vine（Amazonで購入なし）','#C4B5FD')+distChart(nvRv,'■ 非Vine（Amazonで購入）','#67E8F9')+'</div>'
      +'<div style="padding:10px 16px;border-bottom:1px solid #1E3A5F"><div style="font-size:10px;color:#475569;margin-bottom:6px">良い＝★5・4　普通＝★3　悪い＝★2・1　／　Vine＝Amazonで購入なし</div><div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center"><button data-f="all" onclick="_bhlAmzFilter(\'all\',this)" style="padding:5px 10px;border-radius:20px;border:1px solid #FF9900;background:#FF9900;color:#000;font-size:11px;font-weight:700;cursor:pointer">全て('+reviews.length+')</button><button data-f="good" onclick="_bhlAmzFilter(\'good\',this)" style="padding:5px 10px;border-radius:20px;border:1px solid #22C55E;background:transparent;color:#22C55E;font-size:11px;cursor:pointer">★5・4 良い('+goodC+')</button><button data-f="mid" onclick="_bhlAmzFilter(\'mid\',this)" style="padding:5px 10px;border-radius:20px;border:1px solid #94A3B8;background:transparent;color:#94A3B8;font-size:11px;cursor:pointer">★3 普通('+midC+')</button><button data-f="bad" onclick="_bhlAmzFilter(\'bad\',this)" style="padding:5px 10px;border-radius:20px;border:1px solid #FF4B4B;background:transparent;color:#FF4B4B;font-size:11px;cursor:pointer">★2・1 悪い('+badC+')</button><button data-f="vine" onclick="_bhlAmzFilter(\'vine\',this)" style="padding:5px 10px;border-radius:20px;border:1px solid #8B5CF6;background:transparent;color:#C4B5FD;font-size:11px;cursor:pointer">Vine('+vC+')</button><button data-f="novine" onclick="_bhlAmzFilter(\'novine\',this)" style="padding:5px 10px;border-radius:20px;border:1px solid #06B6D4;background:transparent;color:#67E8F9;font-size:11px;cursor:pointer">非Vine('+nvC+')</button><button onclick="_bhlAmzCSV()" style="margin-left:auto;padding:5px 10px;border-radius:20px;border:1px solid #3B82F6;background:transparent;color:#3B82F6;font-size:11px;cursor:pointer">📥 CSV</button></div></div>'
      +'<div id="_bhl_amz_list" style="padding:8px 16px 16px">'+listHTML+'</div>'
      +'<div style="padding:10px 16px;background:#162032;border-top:1px solid #1E3A5F;border-radius:0 0 12px 12px;text-align:center;font-size:11px;color:#475569">'+(reviews.length>300?reviews.length+'件中300件表示':'全'+reviews.length+'件を表示中')+'</div>';
    document.body.appendChild(panel);window._bhlAmzAllReviews=reviews;
  }

  /* ── メイン実行 ── */
  var ptEl = document.querySelector('#productTitle,h1.a-size-large,[data-hook="product-link"]');
  var productTitle = ptEl ? ptEl.textContent.trim() : 'ASIN: '+asin;

  // ▼ 改善③: バリエーションASIN収集
  var variantAsins = collectVariantAsins();
  // 自分自身のASINを先頭にし、最大5バリエーションまで（過剰なリクエスト防止）
  variantAsins = [asin].concat(variantAsins.filter(function(a){ return a !== asin; }).slice(0,4));

  var filters = [
    {filter:'', label:'全体(新着順)', sort:'recent'},
    {filter:'five_star', label:'★5(新着)', sort:'recent'},
    {filter:'four_star', label:'★4(新着)', sort:'recent'},
    {filter:'three_star', label:'★3(新着)', sort:'recent'},
    {filter:'two_star', label:'★2(新着)', sort:'recent'},
    {filter:'one_star', label:'★1(新着)', sort:'recent'},
    {filter:'', label:'全体(役立ち順)', sort:'helpful'},
    {filter:'five_star', label:'★5(役立ち)', sort:'helpful'},
    {filter:'four_star', label:'★4(役立ち)', sort:'helpful'},
    {filter:'three_star', label:'★3(役立ち)', sort:'helpful'},
    {filter:'two_star', label:'★2(役立ち)', sort:'helpful'},
    {filter:'one_star', label:'★1(役立ち)', sort:'helpful'}
  ];

  _seen = {};
  _totalReviews = [];
  updateProgress('取得開始... (バリエーション: '+variantAsins.length+'件検出)');

  // メインASINのフィルター全パターンを先に実行
  var chain = Promise.resolve();
  filters.forEach(function(f){
    chain = chain.then(function(){
      updateProgress(f.label+' 取得中...');
      return fetchAllPages('', f.label, f.filter, f.sort, asin);
    }).then(function(){
      updateProgress(f.label+' 完了 (累計'+totalCount()+'件)');
      return delay(300);
    });
  });

  // ▼ 改善③続き: 追加バリエーションASINのレビューも取得（全体新着のみ）
  variantAsins.slice(1).forEach(function(vAsin){
    chain = chain.then(function(){
      updateProgress('バリエーション '+vAsin+' 取得中...');
      return fetchAllPages('', 'バリエーション:'+vAsin, '', 'recent', vAsin);
    }).then(function(){
      return fetchAllPages('', 'バリエーション:'+vAsin+'(役立ち)', '', 'helpful', vAsin);
    }).then(function(){
      updateProgress('バリエーション '+vAsin+' 完了 (累計'+totalCount()+'件)');
      return delay(300);
    });
  });

  chain.then(function(){
    _totalReviews.sort(function(a,b){ return b.date.localeCompare(a.date); });
    removeProgress();
    showPanel(_totalReviews, productTitle, variantAsins.length);
    playDone();
    var vc = _totalReviews.filter(function(r){ return r.vine; }).length;
    var variantMsg = variantAsins.length>1 ? '\nバリエーション統合: '+variantAsins.length+'件' : '';
    alert('✅ レビュー取得完了！\n\n合計 '+_totalReviews.length+' 件\n├ Vine（Amazonで購入なし）: '+vc+' 件\n└ 非Vine（Amazonで購入）: '+(_totalReviews.length-vc)+' 件'+variantMsg);
  }).catch(function(e){
    removeProgress();
    alert('エラー: '+e.message);
  });

})();
