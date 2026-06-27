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
    <p class="sub">ローカルのエージェント（推薦 / 蘊蓄）をブラウザから試すための簡易画面です。</p>
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

  <!-- 蘊蓄 (A6) -->
  <div class="card">
    <h2>スポットの蘊蓄 <span class="tag">POST /v1/spots/{id}/story</span></h2>
    <label for="spot">スポットを選ぶ</label>
    <select id="spot">
      <option value="s1">s1 — 懐古園</option>
      <option value="s2">s2 — 高峰高原</option>
      <option value="s4">s4 — マンズワイン小諸ワイナリー</option>
      <option value="s5">s5 — そば処 草笛</option>
      <option value="s6">s6 — 中棚荘（島崎藤村ゆかり）</option>
      <option value="s3">s3 — 停車場ガーデン（factsなし＝正直に返る例）</option>
    </select>
    <button class="go" id="stoBtn">蘊蓄を聞く</button>
    <div class="out empty" id="stoOut">ここに結果が出ます</div>
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
      const text = data.result ?? data.story ?? data.plan ?? JSON.stringify(data);
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

  // 蘊蓄
  $("stoBtn").onclick = () =>
    callApi("/v1/spots/" + $("spot").value + "/story", {}, $("stoOut"), $("stoBtn"));
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
  
  /* 旅行設定パネル */
  .settings-panel {
    display: flex;
    gap: 12px;
    background: #fff;
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 12px 16px;
    margin-bottom: 18px;
    justify-content: space-between;
    box-shadow: 0 1px 3px rgba(0,0,0,0.02);
  }
  .setting-item {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .setting-item label {
    font-size: 11px;
    color: var(--sub);
    font-weight: 700;
  }
  .setting-item select {
    padding: 6px 8px;
    font-size: 13px;
    border-radius: 6px;
    border: 1px solid var(--line);
    background: #f8fafc;
    color: var(--ink);
  }

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
  .cprice{color:var(--sub);font-weight:700;margin-bottom:10px}
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
  
  .card2{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin:12px 0;
    box-shadow:0 1px 2px rgba(0,0,0,0.02);}
  .card2 h2{font-size:15px;margin:0 0 10px}
  .prof{background:var(--accent-soft);border-radius:10px;padding:10px 12px;font-size:14px;font-weight:600;color:var(--accent)}
  
  /* ディベートアコーディオン */
  .debate-header {
    background: #eaf1ff;
    color: #1e40af;
    border: 1px solid #bfdbfe;
    border-radius: 10px;
    padding: 11px 14px;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
  }
  .debate-body {
    display: none;
    background: #fff;
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 14px;
    margin-bottom: 16px;
    max-height: 350px;
    overflow-y: auto;
  }
  .debate-msg {
    margin-bottom: 12px;
    font-size: 13px;
    line-height: 1.5;
    padding: 8px 12px;
    border-radius: 8px;
    background: #f8fafc;
  }
  .debate-msg strong {
    display: inline-block;
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 10.5px;
    margin-right: 6px;
    color: #fff;
    font-weight: 800;
  }
  .debate-msg.recommend { border-left: 3px solid #2563eb; }
  .debate-msg.recommend strong { background: #2563eb; }
  .debate-msg.route { border-left: 3px solid #10b981; }
  .debate-msg.route strong { background: #10b981; }
  .debate-msg.introduce { border-left: 3px solid #f59e0b; }
  .debate-msg.introduce strong { background: #f59e0b; }

  /* Good/Bad評価ボタン */
  .fb-buttons {
    display: flex;
    gap: 8px;
    margin-top: 8px;
  }
  .fb-btn {
    background: #fff;
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 4px 12px;
    font-size: 12px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 4px;
    color: var(--sub);
    transition: all 0.2s;
  }
  .fb-btn:hover { background: #f1f5f9; }
  .fb-btn.active-good { background: #dcfce7; border-color: #86efac; color: #15803d; font-weight: 700; }
  .fb-btn.active-bad { background: #fee2e2; border-color: #fca5a5; color: #b91c1c; font-weight: 700; }

  /* スポット質問箱 (チャット形式) */
  .ask-trigger {
    margin-top: 10px;
    background: #f8fafc;
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 8px 12px;
    font-size: 12.5px;
    color: var(--accent);
    cursor: pointer;
    text-align: center;
    font-weight: 700;
    transition: background 0.2s;
  }
  .ask-trigger:hover { background: #f1f5f9; }
  .ask-box {
    display: none;
    margin-top: 10px;
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 12px;
    background: #f8fafc;
  }
  .chat-thread {
    max-height: 200px;
    overflow-y: auto;
    margin-bottom: 10px;
    font-size: 13px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .chat-bubble {
    padding: 8px 12px;
    border-radius: 10px;
    max-width: 85%;
    line-height: 1.5;
    white-space: pre-wrap;
  }
  .chat-bubble.user {
    background: var(--accent-soft);
    color: var(--accent);
    align-self: flex-end;
  }
  .chat-bubble.ai {
    background: #fff;
    border: 1px solid var(--line);
    color: var(--ink);
    align-self: flex-start;
  }
  .ask-form {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .ask-input {
    flex: 1;
    padding: 8px 10px;
    font-size: 13px;
    border: 1px solid var(--line);
    border-radius: 8px;
  }
  .icon-btn {
    background: #fff;
    border: 1px solid var(--line);
    border-radius: 8px;
    width: 34px;
    height: 34px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 16px;
    position: relative;
    user-select: none;
    transition: background 0.2s;
  }
  .icon-btn:hover { background: #f1f5f9; }
  .icon-btn input[type="file"] {
    position: absolute;
    width: 100%;
    height: 100%;
    opacity: 0;
    cursor: pointer;
  }
  .img-preview-container {
    display: none;
    position: relative;
    margin-bottom: 8px;
  }
  .img-preview {
    width: 50px;
    height: 50px;
    object-fit: cover;
    border-radius: 6px;
    border: 1px solid var(--line);
  }
  .img-remove {
    position: absolute;
    top: -6px;
    right: -6px;
    background: #ef4444;
    color: #fff;
    border-radius: 50%;
    width: 16px;
    height: 16px;
    font-size: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-weight: bold;
  }

  /* 旅行終了フィードバック */
  .trip-feedback-box {
    background: #fff;
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 16px 18px;
    margin: 16px 0;
    box-shadow: 0 1px 2px rgba(0,0,0,0.02);
  }
  .stars {
    display: flex;
    gap: 8px;
    font-size: 26px;
    margin: 8px 0;
  }
  .star { color: #cbd5e1; cursor: pointer; transition: color 0.2s; }
  .star.active { color: #f59e0b; }
  .trip-feedback-comment {
    width: 100%;
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 8px 10px;
    font-size: 13px;
    resize: vertical;
    min-height: 50px;
    margin-bottom: 10px;
  }
  .learning-result {
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    border-radius: 8px;
    padding: 12px;
    font-size: 12.5px;
    color: #166534;
    margin-top: 12px;
  }
  .learning-title {
    font-weight: bold;
    margin-bottom: 4px;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .reco{display:flex;gap:12px;align-items:flex-start;padding:14px 0;border-top:1px solid var(--line)}
  .reco:first-of-type{border-top:0}
  .rk{flex:0 0 26px;width:26px;height:26px;border-radius:50%;background:var(--accent);color:#fff;
    font-weight:800;font-size:13px;display:flex;align-items:center;justify-content:center;margin-top:2px}
  .rbody{flex:1}
  .sc{color:var(--sub);font-size:11px;background:#eef2f7;padding:1px 8px;border-radius:999px;margin-left:4px}
  .why{color:var(--sub);font-size:12px;margin-top:3px}
  .rthumb{flex:0 0 52px;width:52px;height:52px;border-radius:10px;object-fit:cover;background:#e7ebf1}
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
    <!-- 旅行条件設定 -->
    <div class="settings-panel">
      <div class="setting-item">
        <label>🚉 出発地</label>
        <select id="originSelect">
          <option value="小諸駅">小諸駅</option>
          <option value="高峰高原">高峰高原</option>
          <option value="あぐりの湯こもろ">あぐりの湯こもろ</option>
        </select>
      </div>
      <div class="setting-item">
        <label>⏳ 旅行の時間猶予</label>
        <select id="timeBudgetSelect">
          <option value="2時間">2時間</option>
          <option value="4時間" selected>4時間</option>
          <option value="6時間">6時間</option>
          <option value="1日">1日</option>
        </select>
      </div>
    </div>

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
  var spotFeedbacks={}; // spotId -> 'good' | 'bad'
  var CAT={ nature:{l:"自然",c:"#0d9488"}, gourmet:{l:"グルメ",c:"#d97706"}, history:{l:"歴史",c:"#2563eb"} };
  
  function esc(s){ return String(s==null?"":s).replace(/[&<>]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;"}[c];}); }
  function priceStr(p){ return p<=0 ? "無料" : "¥".repeat(p); }

  function load(){
    fetch("/v1/spots").then(function(r){return r.json();}).then(function(d){
      spots = d.spots || []; idx=0; likes=[]; nopes=[]; spotFeedbacks={};
      $("result").style.display="none"; $("stage").style.display="";
      renderCard();
    });
  }

  function renderCard(){
    if(idx>=spots.length){ finish(); return; }
    var s=spots[idx];
    var cat=CAT[s.category]||{l:s.category,c:"#6b7280"};
    var tags=(s.tags||[]).map(function(t){return '<span class="tg">'+esc(t)+'</span>';}).join("");
    var img=s.image||"";
    var imgTag=img?'<img src="'+img+'" onerror="this.style.display=&#39;none&#39;">':"";
    $("deck").innerHTML =
      '<div class="cardback cb2"></div><div class="cardback cb1"></div>'+
      '<div class="card" id="topcard">'+
        '<div class="cimg" style="background:linear-gradient(135deg,'+cat.c+'aa,'+cat.c+'dd)">'+imgTag+'<span class="chip" style="background:'+cat.c+'">'+cat.l+'</span></div>'+
        '<div class="cbody">'+
          '<div class="cname">'+esc(s.name)+'</div>'+
          '<div class="cprice">'+priceStr(s.priceLevel)+'</div>'+
          '<div class="ctags">'+tags+'</div>'+
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
    R.innerHTML='<div class="loading"><span class="spin"></span> AIエージェントたちが作戦会議（ディベート）をしています…</div>';
    
    var origin = $("originSelect").value;
    var timeBudget = $("timeBudgetSelect").value;

    fetch("/v1/personalized/plan",{
      method:"POST",
      headers:{"content-type":"application/json"},
      body:JSON.stringify({
        likes: likes,
        nopes: nopes,
        userId: "demo",
        timeBudget: timeBudget,
        origin: origin
      })
    })
    .then(function(r){return r.json();})
    .then(renderResult)
    .catch(function(e){ R.innerHTML='<div class="err">エラー: '+esc(e.message)+'</div>'+resetHtml(); bindReset(); });
  }

  function resetHtml(){ return '<div style="text-align:center;margin-top:14px"><button id="resetBtn" class="seebtn">もう一度スワイプする</button></div>'; }
  
  function bindReset(){ var b=$("resetBtn"); if(b) b.onclick=load; }

  function renderResult(d){
    if(d.error){ $("result").innerHTML='<div class="err">'+esc(d.error)+'</div>'+resetHtml(); bindReset(); return; }
    
    // ディベートログのレンダリング
    var debateHtml = "";
    if (d.debate && d.debate.length > 0) {
      var agentNames = { recommend: "🔵 推薦エージェント", route: "🟢 ルート計画", introduce: "🟠 紹介エージェント" };
      var msgs = d.debate.map(function(m) {
        return '<div class="debate-msg ' + m.agent + '"><strong>' + esc(agentNames[m.agent] || m.agent) + '</strong>' + esc(m.message) + '</div>';
      }).join("");

      debateHtml = 
        '<div class="debate-header" onclick="toggleDebate()">'+
          '<span>👥 AIエージェントたちの作戦会議ログ (' + d.debate.length + '件の発言)</span>'+
          '<span id="debateArrow">▼</span>'+
        '</div>'+
        '<div class="debate-body" id="debateBody">' + msgs + '</div>';
    }

    // おすすめスポットのレンダリング
    var recos=(d.recommendations||[]).slice(0, 5).map(function(r,i){
      var cat=CAT[r.category]||{l:r.category,c:"#6b7280"};
      var tags=(r.tags||[]).map(function(t){return '<span class="tg">'+esc(t)+'</span>';}).join("");
      var why=(r.why||[]).join(" / ");
      var th=r.image?'<img class="rthumb" src="'+r.image+'" onerror="this.style.visibility=&#39;hidden&#39;">':'<div class="rthumb"></div>';
      
      // Good/Bad ボタンの初期クラス
      var goodClass = spotFeedbacks[r.id] === 'good' ? 'active-good' : '';
      var badClass = spotFeedbacks[r.id] === 'bad' ? 'active-bad' : '';

      return '<div class="reco" id="reco-' + r.id + '">'+
        '<div class="rk">'+(i+1)+'</div>'+
        th+
        '<div class="rbody">'+
          '<div><span class="chip sm" style="background:'+cat.c+'">'+cat.l+'</span> <b>'+esc(r.name)+'</b> <span class="sc">match '+r.score+'</span></div>'+
          '<div class="ctags">'+tags+'</div>'+
          (why?'<div class="why">'+esc(why)+'</div>':"")+
          
          // Good/Bad 評価ボタン
          '<div class="fb-buttons">'+
            '<button class="fb-btn ' + goodClass + '" onclick="sendSpotFeedback(\'' + r.id + '\', \'good\')" id="fb-good-' + r.id + '">👍 Good</button>'+
            '<button class="fb-btn ' + badClass + '" onclick="sendSpotFeedback(\'' + r.id + '\', \'bad\')" id="fb-bad-' + r.id + '">👎 Bad</button>'+
          '</div>'+
          
          // チャットUI用トリガー＆質問箱
          '<div class="ask-trigger" onclick="toggleAskBox(\'' + r.id + '\')">💬 AIガイドに質問する・写真を送る</div>'+
          '<div class="ask-box" id="ask-box-' + r.id + '">'+
            '<div class="chat-thread" id="chat-thread-' + r.id + '">'+
              '<div class="chat-bubble ai">このスポットについて、気になることや楽しみ方を聞いてみてください。写真や音声での質問も受け付けます！</div>'+
            '</div>'+
            
            // 画像プレビュー
            '<div class="img-preview-container" id="img-preview-container-' + r.id + '">'+
              '<img class="img-preview" id="img-preview-' + r.id + '">'+
              '<div class="img-remove" onclick="clearImageInput(\'' + r.id + '\')">✕</div>'+
            '</div>'+

            '<div class="ask-form">'+
              // 画像アップロード
              '<div class="icon-btn" title="画像を添付">'+
                '📷'+
                '<input type="file" id="file-' + r.id + '" accept="image/*" onchange="handleImageChange(this, \'' + r.id + '\')">'+
              '</div>'+
              
              // 音声録音
              '<button class="icon-btn" id="mic-' + r.id + '" onclick="handleMicToggle(\'' + r.id + '\')" title="音声で質問">🎤</button>'+
              
              '<input type="text" class="ask-input" id="input-' + r.id + '" placeholder="例）ここで一番食べるべきものは？" onkeypress="handleAskKeyPress(event, \'' + r.id + '\')">'+
              '<button class="seebtn" onclick="submitAsk(\'' + r.id + '\')">送信</button>'+
            '</div>'+
          '</div>'+
        '</div>'+
      '</div>';
    }).join("");

    var rec = d.result ? '<div class="out">'+esc(d.result)+'</div>' : "";
    
    // 旅行終了フィードバックフォームのレンダリング
    var tripFeedbackHtml = 
      '<div class="trip-feedback-box" id="tripFeedbackBox">'+
        '<h2>🏁 旅行の終了・フィードバック</h2>'+
        '<p class="sub" style="margin-top:0">AIガイドの質やおすすめルートの感想を教えてください。フィードバックをもとにAIが学習します。</p>'+
        '<div class="stars">'+
          '<span class="star" onclick="setTripRating(1)">★</span>'+
          '<span class="star" onclick="setTripRating(2)">★</span>'+
          '<span class="star" onclick="setTripRating(3)">★</span>'+
          '<span class="star" onclick="setTripRating(4)">★</span>'+
          '<span class="star" onclick="setTripRating(5)">★</span>'+
        '</div>'+
        '<textarea class="trip-feedback-comment" id="tripComment" placeholder="例：全体的に楽しかった！でももう少し歴史に詳しい蘊蓄を聞きたかった。"></textarea>'+
        '<button class="seebtn" onclick="submitTripFeedback()" id="tripSubmitBtn">フィードバックを送信する</button>'+
        '<div id="learningResult" class="learning-result" style="display:none"></div>'+
      '</div>';

    $("result").innerHTML=
      '<div class="card2"><h2>あなたの好み傾向</h2><div class="prof">'+esc(d.profileSummary)+'</div></div>'+
      debateHtml+
      '<div class="card2"><h2>あなたへのおすすめ</h2>'+recos+'</div>'+
      (rec?'<div class="card2"><h2>推薦エージェントのまとめ</h2>'+rec+'</div>':"")+
      tripFeedbackHtml+
      resetHtml();
      
    bindReset();
  }

  // アコーディオン開閉
  window.toggleDebate = function() {
    var body = $("debateBody");
    var arrow = $("debateArrow");
    if (body.style.display === "block") {
      body.style.display = "none";
      arrow.textContent = "▼";
    } else {
      body.style.display = "block";
      arrow.textContent = "▲";
    }
  };

  // チャットボックス開閉
  window.toggleAskBox = function(spotId) {
    var box = $("ask-box-" + spotId);
    box.style.display = box.style.display === "block" ? "none" : "block";
  };

  // スポットGood/Badフィードバック送信
  window.sendSpotFeedback = function(spotId, rating) {
    var activeClass = rating === 'good' ? 'active-good' : 'active-bad';
    var inactiveRating = rating === 'good' ? 'bad' : 'good';
    
    // UI反映（ローカル保存とトグル）
    if (spotFeedbacks[spotId] === rating) {
      delete spotFeedbacks[spotId];
      $("fb-" + rating + "-" + spotId).classList.remove(activeClass);
    } else {
      spotFeedbacks[spotId] = rating;
      $("fb-" + rating + "-" + spotId).classList.add(activeClass);
      $("fb-" + inactiveRating + "-" + spotId).classList.remove(rating === 'good' ? 'active-bad' : 'active-good');
    }

    fetch("/v1/personalized/feedback/spot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: "demo", spotId: spotId, rating: rating })
    });
  };

  // チャット用の画像添付
  var selectedImages = {}; // spotId -> { mimeType, data, url }
  window.handleImageChange = function(input, spotId) {
    var file = input.files[0];
    if (file) {
      var reader = new FileReader();
      reader.onload = function(e) {
        selectedImages[spotId] = {
          mimeType: file.type,
          data: e.target.result.split(',')[1],
          url: e.target.result
        };
        // プレビュー表示
        $("img-preview-" + spotId).src = e.target.result;
        $("img-preview-container-" + spotId).style.display = "block";
      };
      reader.readAsDataURL(file);
    }
  };

  window.clearImageInput = function(spotId) {
    delete selectedImages[spotId];
    $("file-" + spotId).value = "";
    $("img-preview-container-" + spotId).style.display = "none";
    $("img-preview-" + spotId).src = "";
  };

  // 音声録音（Web Audio + MediaRecorder またはモック）
  var activeRecorders = {}; // spotId -> { isRecording, mediaRecorder, chunks }
  window.handleMicToggle = function(spotId) {
    var btn = $("mic-" + spotId);
    if (!activeRecorders[spotId]) {
      activeRecorders[spotId] = { isRecording: false, mediaRecorder: null, chunks: [] };
    }
    
    var state = activeRecorders[spotId];
    if (!state.isRecording) {
      // 録音開始
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(function(stream) {
          state.chunks = [];
          state.mediaRecorder = new MediaRecorder(stream);
          state.mediaRecorder.ondataavailable = function(e) {
            state.chunks.push(e.data);
          };
          state.mediaRecorder.onstop = function() {
            var audioBlob = new Blob(state.chunks, { type: 'audio/webm' });
            var reader = new FileReader();
            reader.readAsDataURL(audioBlob);
            reader.onloadend = function() {
              var base64data = reader.result.split(',')[1];
              // 録音データをセットしてチャット送信
              submitAsk(spotId, { mimeType: 'audio/webm', data: base64data });
            };
          };
          state.mediaRecorder.start();
          state.isRecording = true;
          btn.textContent = "🛑";
          btn.style.background = "#ef4444";
          btn.title = "録音を停止して送信";
        })
        .catch(function(err) {
          console.warn("マイクアクセス不可。モック音声を使用します。", err);
          // 擬似音声入力
          state.isRecording = true;
          btn.textContent = "⏳";
          btn.style.background = "#f59e0b";
          btn.title = "録音中（シミュレーション）";
          setTimeout(function() {
            state.isRecording = false;
            btn.textContent = "🎤";
            btn.style.background = "";
            btn.title = "音声で質問";
            // ダミーBase64音声データ（短い空のwav）
            submitAsk(spotId, { mimeType: 'audio/wav', data: 'UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAAA' }, "🎤 [音声での質問]");
          }, 2000);
        });
    } else {
      // 録音停止
      if (state.mediaRecorder) {
        state.mediaRecorder.stop();
      }
      state.isRecording = false;
      btn.textContent = "🎤";
      btn.style.background = "";
      btn.title = "音声で質問";
    }
  };

  // 質問送信
  window.handleAskKeyPress = function(e, spotId) {
    if (e.key === 'Enter') {
      submitAsk(spotId);
    }
  };

  window.submitAsk = function(spotId, audioData, overrideText) {
    var textInput = $("input-" + spotId);
    var text = overrideText || textInput.value.trim();
    var img = selectedImages[spotId];
    
    if (!text && !img && !audioData) return;

    var thread = $("chat-thread-" + spotId);

    // ユーザー発言をUIに描画
    var userMsgHtml = '<div class="chat-bubble user">';
    if (img) userMsgHtml += '<img src="' + img.url + '" style="max-width:100px; max-height:100px; display:block; border-radius:4px; margin-bottom:4px;">';
    if (audioData) userMsgHtml += '🎵 [音声質問] ';
    if (text) userMsgHtml += esc(text);
    userMsgHtml += '</div>';

    thread.insertAdjacentHTML('beforeend', userMsgHtml);
    thread.scrollTop = thread.scrollHeight;
    
    // 入力をクリア
    textInput.value = "";
    clearImageInput(spotId);

    // AI「考え中…」
    var aiLoadingId = 'ai-loading-' + Date.now();
    thread.insertAdjacentHTML('beforeend', '<div class="chat-bubble ai" id="' + aiLoadingId + '"><span class="spin"></span>AIガイドが回答を作成中…</div>');
    thread.scrollTop = thread.scrollHeight;

    // APIリクエスト
    fetch("/v1/spots/" + spotId + "/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userId: "demo",
        text: text || "写真を解析して解説してください",
        image: img ? { mimeType: img.mimeType, data: img.data } : undefined,
        audio: audioData ? { mimeType: audioData.mimeType, data: audioData.data } : undefined
      })
    })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      var loadingEl = $(aiLoadingId);
      if(loadingEl) loadingEl.remove();
      thread.insertAdjacentHTML('beforeend', '<div class="chat-bubble ai">' + esc(d.answer) + '</div>');
      thread.scrollTop = thread.scrollHeight;
    })
    .catch(function(e) {
      var loadingEl = $(aiLoadingId);
      if(loadingEl) loadingEl.remove();
      thread.insertAdjacentHTML('beforeend', '<div class="chat-bubble ai" style="color:#b42318;">エラーが発生しました: ' + esc(e.message) + '</div>');
      thread.scrollTop = thread.scrollHeight;
    });
  };

  // 全体フィードバック
  var tripRating = 0;
  window.setTripRating = function(rating) {
    tripRating = rating;
    var stars = document.querySelectorAll("#tripFeedbackBox .star");
    for (var i = 0; i < stars.length; i++) {
      if (i < rating) {
        stars[i].classList.add("active");
      } else {
        stars[i].classList.remove("active");
      }
    }
  };

  window.submitTripFeedback = function() {
    var comment = $("tripComment").value.trim();
    if (tripRating === 0) {
      alert("星評価（1〜5）を選択してください。");
      return;
    }

    var submitBtn = $("tripSubmitBtn");
    submitBtn.disabled = true;
    submitBtn.textContent = "送信して学習中…";

    // スポットGood/Badのリスト化
    var spotFeedbacksList = [];
    for (var sId in spotFeedbacks) {
      spotFeedbacksList.push({ spotId: sId, rating: spotFeedbacks[sId] });
    }

    fetch("/v1/personalized/feedback/trip", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userId: "demo",
        rating: tripRating,
        comment: comment,
        spotFeedbacks: spotFeedbacksList
      })
    })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      submitBtn.textContent = "送信完了";
      var resultBox = $("learningResult");
      resultBox.style.display = "block";
      
      resultBox.innerHTML = 
        '<div class="learning-title">🧠 AIが今回のフィードバックを学習しました！</div>'+
        '<div><b>推薦の好みメモ (feedbackNotes):</b> ' + esc(d.feedbackNotes || "特になし") + '</div>'+
        '<div style="margin-top:6px;"><b>紹介の解説スタイル (introStyle):</b> ' + esc(d.introStyle || "特になし") + '</div>';
    })
    .catch(function(e) {
      submitBtn.disabled = false;
      submitBtn.textContent = "フィードバックを送信する";
      alert("フィードバック送信に失敗しました: " + e.message);
    });
  };

  window.addEventListener('DOMContentLoaded', function() {
    var likeBtn = $("likeBtn");
    var nopeBtn = $("nopeBtn");
    var resultBtn = $("resultBtn");
    if (likeBtn) likeBtn.onclick = function(){ swipe(1); };
    if (nopeBtn) nopeBtn.onclick = function(){ swipe(-1); };
    if (resultBtn) resultBtn.onclick = finish;
    load();
  });
</script>
</body>
</html>`;
