// 動作確認用の軽量UI。Honoの GET "/" で配信する（同一オリジンなのでCORS不要・入力は常にUTF-8）。
export const pageHtml = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>旅サキ（動作確認UI）</title>
<style>
  :root{ --bg:#f5f7fa; --card:#fff; --ink:#1c2430; --sub:#5a6573;
    --line:#e3e7ee; --accent:#2563eb; --accent-soft:#eaf1ff; }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);
    font-family:-apple-system,"Segoe UI","Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif;
    line-height:1.7}
  .wrap{max-width:680px;margin:0 auto;padding:28px 18px 60px}
  header{margin-bottom:18px}
  h1{font-size:22px;margin:0 0 4px}
  .sub{color:var(--sub);font-size:13px;margin:0}
  .card{background:var(--card);border:1px solid var(--line);border-radius:14px;
    padding:18px;margin:16px 0;box-shadow:0 1px 2px rgba(20,30,50,.04)}
  h2{font-size:15px;margin:0 0 10px;display:flex;align-items:center;gap:8px}
  .tag{background:var(--accent-soft);color:var(--accent);font-size:11px;font-weight:700;
    padding:2px 8px;border-radius:999px}
  textarea,select{width:100%;border:1px solid var(--line);border-radius:10px;
    padding:11px 12px;font-size:15px;font-family:inherit;color:var(--ink);background:#fff}
  textarea{resize:vertical;min-height:64px}
  .row{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
  .chip{background:#eef2f7;border:1px solid var(--line);border-radius:999px;
    padding:6px 12px;font-size:13px;cursor:pointer;color:var(--sub)}
  .chip:hover{background:#e3e9f2}
  button.go{background:var(--accent);color:#fff;border:0;border-radius:10px;
    padding:11px 20px;font-size:15px;font-weight:700;cursor:pointer;margin-top:10px}
  button.go:disabled{opacity:.5;cursor:default}
  .out{margin-top:14px;padding:14px;background:#fafbfc;border:1px solid var(--line);
    border-radius:10px;white-space:pre-wrap;font-size:14.5px;min-height:24px;color:var(--ink)}
  .out.empty{color:#9aa3af}
  .err{color:#b42318;background:#fef3f2;border-color:#fda29b}
  .spin{display:inline-block;width:14px;height:14px;border:2px solid #c7d2fe;
    border-top-color:var(--accent);border-radius:50%;animation:sp .7s linear infinite;
    vertical-align:-2px;margin-right:6px}
  @keyframes sp{to{transform:rotate(360deg)}}
  label{font-size:13px;color:var(--sub);display:block;margin-bottom:6px}
  /* 構造化された旅程の表示 */
  .itin-title{font-weight:700;margin-bottom:8px}
  .travel{font-size:12.5px;color:var(--sub);margin:6px 0 6px 6px}
  .stop{border:1px solid var(--line);border-radius:10px;padding:10px 12px;background:#fff;margin:4px 0}
  .stop .part{display:inline-block;background:var(--accent-soft);color:var(--accent);
    font-size:11px;font-weight:700;padding:1px 8px;border-radius:999px;margin-right:8px}
  .stop .nm{font-weight:700}
  .stop .meta{color:var(--sub);font-size:12px;margin-left:6px}
  .stop .note{font-size:13px;margin-top:4px}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>旅サキ <span class="tag">動作確認UI</span></h1>
    <p class="sub">ローカルのエージェント（推薦）をブラウザから試すための簡易画面です。</p>
  </header>

  <!-- 推薦 (A5) -->
  <div class="card">
    <h2>スポット推薦 <span class="tag">POST /v1/recommendations</span></h2>
    <label for="req">行きたい雰囲気・条件を自由に</label>
    <textarea id="req" placeholder="例）小諸で歴史を感じる安いところ">小諸で歴史を感じる安いところ</textarea>
    <div class="row">
      <span class="chip" data-q="小諸で歴史を感じる安いところ">歴史・安い</span>
      <span class="chip" data-q="自然の中でのんびり景色を楽しみたい">自然でのんびり</span>
      <span class="chip" data-q="地元の食材でランチしたい">グルメ</span>
    </div>
    <button class="go" id="recBtn">推薦してもらう</button>
    <div class="out empty" id="recOut">ここに結果が出ます</div>
  </div>

</div>

<script>
  const $ = (id) => document.getElementById(id);

  async function callApi(url, body, outEl, btn) {
    outEl.className = "out";
    outEl.innerHTML = '<span class="spin"></span>考え中…';
    btn.disabled = true;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      const text = data.result ?? JSON.stringify(data);
      outEl.className = "out";
      outEl.textContent = text;
    } catch (e) {
      outEl.className = "out err";
      outEl.textContent = "エラー: " + e.message;
    } finally {
      btn.disabled = false;
    }
  }

  // 推薦
  $("recBtn").onclick = () =>
    callApi("/v1/recommendations", { request: $("req").value }, $("recOut"), $("recBtn"));
  document.querySelectorAll("[data-q]").forEach((c) => {
    c.onclick = () => { $("req").value = c.dataset.q; $("recBtn").click(); };
  });
</script>
</body>
</html>`;

// ── スワイプ体験(主役UI)。好みをスワイプ→学習→パーソナライズ旅程 ──
export const swipePageHtml = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>旅サキ — 好みスワイプ</title>
<style>
  :root{ --bg:#f5f7fa; --card:#fff; --ink:#1c2430; --sub:#5a6573; --line:#e3e7ee;
    --accent:#2563eb; --accent-soft:#eaf1ff; --like:#e11d6b; --nope:#6b7280; }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);
    font-family:-apple-system,"Segoe UI","Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif;line-height:1.7}
  .wrap{max-width:560px;margin:0 auto;padding:24px 16px 60px}
  header{text-align:center;margin-bottom:14px}
  h1{font-size:22px;margin:0 0 4px}
  .sub{color:var(--sub);font-size:13px;margin:0}
  #deck{position:relative;min-height:340px;margin:18px 0 8px}
  .cardback{position:absolute;left:50%;top:8px;width:88%;height:320px;transform:translateX(-50%) scale(.96);
    background:#fff;border:1px solid var(--line);border-radius:18px;opacity:.6}
  .cb2{top:16px;transform:translateX(-50%) scale(.92);opacity:.35}
  .card{position:absolute;left:50%;top:0;width:92%;min-height:320px;transform:translateX(-50%);
    background:var(--card);border:1px solid var(--line);border-radius:18px;padding:0;overflow:hidden;
    box-shadow:0 8px 24px rgba(20,30,50,.10);transition:transform .23s ease,opacity .23s ease}
  .cimg{height:175px;position:relative;overflow:hidden;background:#cbd5e1}
  .cimg img{width:100%;height:100%;object-fit:cover;display:block}
  .cimg .chip{position:absolute;top:12px;left:12px;box-shadow:0 1px 4px rgba(0,0,0,.25)}
  .cbody{padding:16px 20px 20px}
  .card.go-right{transform:translateX(60%) rotate(16deg);opacity:0}
  .card.go-left{transform:translateX(-160%) rotate(-16deg);opacity:0}
  .chip{display:inline-block;color:#fff;font-size:12px;font-weight:700;padding:3px 12px;border-radius:999px}
  .chip.sm{font-size:11px;padding:1px 9px}
  .cname{font-size:24px;font-weight:800;margin:0 0 4px}
  .ctags{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}
  .tg{background:#eef2f7;color:var(--sub);font-size:12px;padding:3px 10px;border-radius:999px}
  .cdesc{color:var(--ink);font-size:14px;margin-top:10px}
  .prog{text-align:center;color:var(--sub);font-size:12px}
  .ctrls{display:flex;align-items:center;justify-content:center;gap:22px;margin:14px 0 6px}
  .rnd{width:64px;height:64px;border-radius:50%;border:2px solid var(--line);background:#fff;
    font-size:26px;cursor:pointer;box-shadow:0 3px 10px rgba(20,30,50,.10);line-height:1}
  .rnd.like{color:var(--like);border-color:#f7c9da}
  .rnd.nope{color:var(--nope)}
  .rnd:active{transform:scale(.92)}
  .seebtn{background:var(--accent);color:#fff;border:0;border-radius:10px;padding:10px 18px;
    font-size:14px;font-weight:700;cursor:pointer}
  .hint{text-align:center;color:var(--sub);font-size:12px;margin-top:10px}
  .hint a{color:var(--accent)}
  .loading{text-align:center;color:var(--sub);padding:40px 0}
  .err{color:#b42318;background:#fef3f2;border:1px solid #fda29b;border-radius:10px;padding:14px}
  .card2{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin:12px 0}
  .card2 h2{font-size:15px;margin:0 0 10px}
  .prof{background:var(--accent-soft);border-radius:10px;padding:10px 12px;font-size:14px;font-weight:600;color:var(--accent)}
  .reason{background:#fff7ed;border-left:3px solid #d97706;border-radius:0 8px 8px 0;padding:10px 12px;font-size:13.5px}
  .opts{display:flex;gap:16px;justify-content:center;margin:8px 0 2px;font-size:12px;color:var(--sub)}
  .opts select{font-size:13px;padding:4px 6px;border:1px solid var(--line);border-radius:8px;margin-left:4px}
  .wx{margin-top:8px;font-size:13px;color:var(--sub)}
  .warnbox{background:#fff7ed;border:1px solid #fdba74;border-radius:8px;padding:8px 10px;font-size:12.5px;color:#b45309;margin-top:10px}
  .reco{display:flex;gap:12px;align-items:flex-start;padding:10px 0;border-top:1px solid var(--line)}
  .reco:first-of-type{border-top:0}
  .rk{flex:0 0 26px;width:26px;height:26px;border-radius:50%;background:var(--accent);color:#fff;
    font-weight:800;font-size:13px;display:flex;align-items:center;justify-content:center;margin-top:2px}
  .rbody{flex:1}
  .sc{color:var(--sub);font-size:11px;background:#eef2f7;padding:1px 8px;border-radius:999px;margin-left:4px}
  .rthumb{flex:0 0 52px;width:52px;height:52px;border-radius:10px;object-fit:cover;background:#e7ebf1}
  .tm{font-weight:800;color:var(--accent);margin-right:6px}
  .itin-title{font-weight:700;margin-bottom:8px}
  .travel{font-size:12.5px;color:var(--sub);margin:6px 0 6px 6px}
  .stop{border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin:4px 0}
  .stop .part{display:inline-block;background:var(--accent-soft);color:var(--accent);font-size:11px;font-weight:700;padding:1px 8px;border-radius:999px;margin-right:8px}
  .stop .nm{font-weight:700}
  .stop .meta{color:var(--sub);font-size:12px;margin-left:6px}
  .stop .note{font-size:13px;margin-top:4px}
  .out{white-space:pre-wrap;font-size:14px}
  .spin{display:inline-block;width:14px;height:14px;border:2px solid #c7d2fe;border-top-color:var(--accent);
    border-radius:50%;animation:sp .7s linear infinite;vertical-align:-2px;margin-right:6px}
  @keyframes sp{to{transform:rotate(360deg)}}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>旅サキ</h1>
    <p class="sub">好きな観光地を♥／✕でスワイプ → あなた向けのおすすめ</p>
  </header>
  <div id="stage">
    <div id="deck"></div>
    <div id="progress" class="prog"></div>
    <div class="ctrls">
      <button id="nopeBtn" class="rnd nope" title="興味なし">✕</button>
      <button id="resultBtn" class="seebtn" style="display:none">結果を見る →</button>
      <button id="likeBtn" class="rnd like" title="行きたい">♥</button>
    </div>
    <div class="hint">♥=行きたい／✕=興味なし（数件スワイプすると精度が上がります）　<a href="/dev">開発用パネル</a></div>
  </div>
  <div id="result" style="display:none"></div>
</div>
<script>
  var $ = function(id){ return document.getElementById(id); };
  var spots=[], idx=0, likes=[], nopes=[];
  var CAT={ nature:{l:"自然",c:"#0d9488"}, gourmet:{l:"グルメ",c:"#d97706"}, history:{l:"歴史",c:"#2563eb"} };
  function esc(s){ return String(s==null?"":s).replace(/[&<>]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;"}[c];}); }

  function load(){
    fetch("/v1/spots").then(function(r){return r.json();}).then(function(d){
      spots = d.spots || []; idx=0; likes=[]; nopes=[];
      $("result").style.display="none"; $("stage").style.display="";
      renderCard();
    });
  }
  function renderCard(){
    if(idx>=spots.length){ finish(); return; }
    var s=spots[idx];
    var cat=CAT[s.category]||{l:s.category,c:"#6b7280"};
    var highlights=(s.highlights||[]).map(function(t){return '<span class="tg">'+esc(t)+'</span>';}).join("");
    var img=s.image||"";
    var imgTag=img?'<img src="'+img+'" onerror="this.style.display=&#39;none&#39;">':"";
    $("deck").innerHTML =
      '<div class="cardback cb2"></div><div class="cardback cb1"></div>'+
      '<div class="card" id="topcard">'+
        '<div class="cimg" style="background:linear-gradient(135deg,'+cat.c+'aa,'+cat.c+'dd)">'+imgTag+'<span class="chip" style="background:'+cat.c+'">'+cat.l+'</span></div>'+
        '<div class="cbody">'+
          '<div class="cname">'+esc(s.name)+'</div>'+
          '<div class="ctags">'+highlights+'</div>'+
          '<div class="cdesc">'+esc(s.description)+'</div>'+
        '</div>'+
      '</div>';
    $("progress").textContent=(idx+1)+" / "+spots.length;
    $("resultBtn").style.display=((likes.length+nopes.length)>=3)?"":"none";
  }
  function swipe(dir){
    if(idx>=spots.length) return;
    (dir>0?likes:nopes).push(spots[idx].id);
    var card=$("topcard");
    if(card) card.classList.add(dir>0?"go-right":"go-left");
    idx++;
    setTimeout(renderCard,230);
  }
  function finish(){
    $("stage").style.display="none";
    var R=$("result"); R.style.display="";
    R.innerHTML='<div class="loading"><span class="spin"></span> あなたの好みからおすすめを探しています…</div>';
    fetch("/v1/personalized/plan",{method:"POST",headers:{"content-type":"application/json"},
      body:JSON.stringify({likes:likes,nopes:nopes})})
      .then(function(r){return r.json();}).then(renderResult)
      .catch(function(e){ R.innerHTML='<div class="err">エラー: '+esc(e.message)+'</div>'+resetHtml(); bindReset(); });
  }
  function resetHtml(){ return '<div style="text-align:center;margin-top:14px"><button id="resetBtn" class="seebtn">もう一度スワイプする</button></div>'; }
  function bindReset(){ var b=$("resetBtn"); if(b) b.onclick=load; }
  function renderResult(d){
    if(d.error){ $("result").innerHTML='<div class="err">'+esc(d.error)+'</div>'+resetHtml(); bindReset(); return; }
    var recos=(d.recommendations||[]).map(function(r,i){
      var cat=CAT[r.category]||{l:r.category,c:"#6b7280"};
      var highlights=(r.highlights||[]).map(function(t){return '<span class="tg">'+esc(t)+'</span>';}).join("");
      var th=r.image?'<img class="rthumb" src="'+r.image+'" onerror="this.style.visibility=&#39;hidden&#39;">':'<div class="rthumb"></div>';
      return '<div class="reco"><div class="rk">'+(i+1)+'</div>'+th+'<div class="rbody">'+
        '<div><span class="chip sm" style="background:'+cat.c+'">'+cat.l+'</span> <b>'+esc(r.name)+'</b> <span class="sc">match '+r.score+'</span></div>'+
        '<div class="ctags">'+highlights+'</div></div></div>';
    }).join("");
    var rec = d.result ? '<div class="out">'+esc(d.result)+'</div>' : "";
    $("result").innerHTML=
      '<div class="card2"><h2>あなたの好み</h2><div class="prof">'+esc(d.profileSummary)+'</div></div>'+
      '<div class="card2"><h2>あなたへのおすすめ</h2>'+recos+'</div>'+
      (rec?'<div class="card2"><h2>推薦エージェントから</h2>'+rec+'</div>':"")+
      resetHtml();
    bindReset();
  }
  $("likeBtn").onclick=function(){ swipe(1); };
  $("nopeBtn").onclick=function(){ swipe(-1); };
  $("resultBtn").onclick=finish;
  load();
</script>
</body>
</html>`;
