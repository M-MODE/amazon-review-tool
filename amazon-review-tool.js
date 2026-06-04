/* ページネーション診断 v2 */
(function(){
  var r = [];
  r.push('=== ページネーション徹底診断 ===');
  r.push('URL: ' + location.href);
  
  // 1. 全リンクでpageNumber含むもの
  r.push('\n--- pageNumber含むリンク ---');
  document.querySelectorAll('a[href*="pageNumber"]').forEach(function(a,i){
    var h = a.getAttribute('href')||'';
    var t = (a.textContent||'').trim().substring(0,30);
    r.push(i+': text="'+t+'" href="'+h.substring(0,150)+'"');
  });
  
  // 2. 全リンクでnextPageToken含むもの
  r.push('\n--- nextPageToken含むリンク ---');
  document.querySelectorAll('a[href*="nextPageToken"]').forEach(function(a,i){
    var h = a.getAttribute('href')||'';
    var t = (a.textContent||'').trim().substring(0,30);
    r.push(i+': text="'+t+'" href="'+h.substring(0,150)+'"');
  });
  
  // 3. pagination関連の要素
  r.push('\n--- pagination関連要素 ---');
  var pSelectors = ['.a-pagination', '[class*="pagination"]', '[class*="paging"]', '[data-hook*="page"]', '.a-last'];
  pSelectors.forEach(function(sel){
    var els = document.querySelectorAll(sel);
    r.push(sel + ': ' + els.length + '件');
    els.forEach(function(el,i){
      r.push('  ['+i+'] tag='+el.tagName+' class="'+(el.className||'').substring(0,80)+'"');
      r.push('  innerHTML(100): '+el.innerHTML.substring(0,100));
      // 子リンク
      el.querySelectorAll('a').forEach(function(a,j){
        r.push('    a['+j+']: text="'+(a.textContent||'').trim().substring(0,20)+'" href="'+(a.getAttribute('href')||'').substring(0,120)+'"');
      });
      // 子ボタン
      el.querySelectorAll('button').forEach(function(b,j){
        r.push('    btn['+j+']: text="'+(b.textContent||'').trim().substring(0,20)+'"');
        for(var ai=0;ai<b.attributes.length;ai++){
          var attr = b.attributes[ai];
          if(attr.value.length > 5) r.push('      '+attr.name+'="'+attr.value.substring(0,100)+'"');
        }
      });
    });
  });
  
  // 4. フォームでnextPageToken含むもの
  r.push('\n--- nextPageToken含むフォーム ---');
  document.querySelectorAll('form').forEach(function(f,i){
    var html = f.innerHTML;
    if(html.indexOf('nextPageToken')>=0 || html.indexOf('pageNumber')>=0){
      r.push('form['+i+']: action="'+(f.action||'').substring(0,100)+'"');
      f.querySelectorAll('input').forEach(function(inp){
        r.push('  input: name="'+inp.name+'" value="'+(inp.value||'').substring(0,80)+'"');
      });
    }
  });
  
  // 5. script内のnextPageTokenやページネーションデータ
  r.push('\n--- script内のnextPageToken ---');
  document.querySelectorAll('script').forEach(function(s,i){
    var t = s.textContent||'';
    if(t.indexOf('nextPageToken')>=0){
      var idx = t.indexOf('nextPageToken');
      r.push('script['+i+']: ...'+t.substring(Math.max(0,idx-20), Math.min(t.length, idx+80))+'...');
    }
  });
  
  // 6. 全属性でnextPageToken含むもの（sign-in除外）
  r.push('\n--- 属性内のnextPageToken ---');
  var count = 0;
  document.querySelectorAll('*').forEach(function(el){
    for(var ai=0;ai<el.attributes.length;ai++){
      var av = el.attributes[ai].value;
      if(av.indexOf('nextPageToken')>=0 && av.indexOf('/ap/signin')<0){
        r.push('tag='+el.tagName+' attr='+el.attributes[ai].name+' val="'+av.substring(0,150)+'"');
        count++;
        if(count>10)return;
      }
    }
  });
  if(count===0) r.push('(sign-in以外のnextPageToken属性なし)');
  
  // 7. 「次」「Next」テキストを含むクリッカブル要素
  r.push('\n--- 「次」含むクリッカブル要素 ---');
  document.querySelectorAll('a, button, [role="button"]').forEach(function(el){
    var t = (el.textContent||'').trim();
    if(t.match(/次|next/i) && t.length < 30){
      r.push('tag='+el.tagName+' text="'+t+'" href="'+(el.getAttribute('href')||'')+'"');
      for(var ai=0;ai<el.attributes.length;ai++){
        if(el.attributes[ai].value.length>5) r.push('  '+el.attributes[ai].name+'="'+el.attributes[ai].value.substring(0,100)+'"');
      }
    }
  });

  var output = r.join('\n');
  console.log(output);
  var panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;top:10px;right:10px;z-index:2147483647;width:550px;max-height:80vh;overflow-y:auto;background:#0F172A;color:#E2E8F0;border-radius:12px;padding:16px;font-family:monospace;font-size:11px;white-space:pre-wrap;box-shadow:0 8px 32px rgba(0,0,0,.7)';
  panel.innerHTML = '<div style="display:flex;justify-content:space-between;margin-bottom:10px"><b style="color:#FF9900">ページネーション診断</b><button onclick="this.parentElement.parentElement.remove()" style="background:none;border:none;color:#94A3B8;font-size:18px;cursor:pointer">×</button></div><div style="display:flex;gap:8px;margin-bottom:10px"><button onclick="navigator.clipboard.writeText(document.getElementById(\'_pdiag\').textContent).then(function(){alert(\'コピーしました\')})" style="background:#3B82F6;border:none;color:#fff;padding:4px 12px;border-radius:4px;cursor:pointer;font-size:11px">📋 コピー</button></div><div id="_pdiag">'+output.replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</div>';
  document.body.appendChild(panel);
})();
