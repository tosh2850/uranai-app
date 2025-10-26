// quiz.js（算命学ベータ／クイズ専用ページ用）
const QUIZ_TITLE = "占い知識 検定（ベータ）— 算命学編";
document.title = QUIZ_TITLE;

/** 40問 → 受験開始時にランダム10問抽出 */
// ===== 差し替え済み：解説つき QUESTIONS（50問） =====
const QUESTIONS = [
  { q: "十干において「甲」と「乙」の違いを正しく説明しているのはどれか。", choices: ["陽木と陰木","陽火と陰火","陽土と陰土","陽金と陰金"], answer: 0, note: "甲は陽木、乙は陰木を表す。十干は陰陽に分かれる。" },
  { q: "十二支の「亥」は五行で何を表すか。", choices: ["木の旺","水の旺","金の余気","土の墓"], answer: 1, note: "亥は水の旺じる支。冬の始まりを意味する。" },
  { q: "五行の「相生関係」において火が生み出すのは何か。", choices: ["木","水","土","金"], answer: 2, note: "火は土を生じる。相生関係の基本。" },
  { q: "十二支の「辰・戌・丑・未」に共通する特徴はどれか。", choices: ["四墓","四生","四旺","四絶"], answer: 0, note: "辰・戌・丑・未は四墓で、蔵干が複雑。" },
  { q: "十干の「庚」が象徴するイメージとして最も適切なのはどれか。", choices: ["新芽","草花","鉄鉱石や刀剣","宝石"], answer: 2, note: "庚は陽の金で、鉄や刀剣を象徴する。" },
  { q: "干支の「甲子」は六十干支の最初に位置するが、その理由はどれか。", choices: ["木が芽吹き、水がそれを養う始まりを表すから","陽木と陽火が循環の起点だから","陰木と陰水が調和するため","干と支の陰陽が一致する最小の組み合わせだから"], answer: 0, note: "甲子は木と水の組合せで、循環の始まり。" },
  { q: "干支の「壬午」はどのような関係を持つか。", choices: ["陰陽調和","干支相剋","陽同士の衝突","木火通明"], answer: 1, note: "壬午は水と火で干支相剋の関係。" },
  { q: "干支の「庚辰」の特徴を示すものはどれか。", choices: ["金が土に根ざす","木が水に支えられる","火が金を剋する","土が木を剋する"], answer: 0, note: "庚辰は金が土に根を持つ配置。" },
  { q: "命式において「月支」が意味するのはどれか。", choices: ["先祖からの因縁","その人の性格・本質","社会的な立場・職業傾向","晩年の運勢"], answer: 1, note: "月支は命式の本質を表す。季節や根本性格の基準。" },
  { q: "格局において「貴格」とされるものはどれか。", choices: ["身弱印星格","財星格","官星格","食神格"], answer: 2, note: "正官格は社会的評価が高い貴格とされる。" },
  { q: "身旺・身弱の判定基準で最も重視されるのはどの柱か。", choices: ["年柱","月柱","日柱","時柱"], answer: 1, note: "月支が最も命式の強弱判定に重視される。" },
  { q: "「専気格」が成立するための条件はどれか。", choices: ["一柱に同じ五行が並ぶ","天干と地支に一気が貫通している","十干がすべて揃っている","十二支が三合している"], answer: 1, note: "専気格は干支に一気が通貫する特殊格。" },
  { q: "通変星の「比肩」が強い場合に現れやすい性格はどれか。", choices: ["協調性が高い","独立心が強い","受け身で慎重","表現力豊か"], answer: 1, note: "比肩は独立心を強める。協調より自己重視。" },
  { q: "「傷官」が強い場合の傾向として正しいのはどれか。", choices: ["創造力・批判精神が旺盛","謙虚で控えめ","財を守る力が強い","正義感が強い"], answer: 0, note: "傷官は創造力・批判精神が強い。" },
  { q: "「偏財」の象意に含まれないものはどれか。", choices: ["広い人脈","投機や冒険","正妻・本妻","流動的な財"], answer: 2, note: "偏財は人脈や投機を意味し、正妻は含まない。" },
  { q: "「正官」が意味するものとして最も適切なのはどれか。", choices: ["目上・秩序・責任","部下・部下運","創造・表現","健康・生命力"], answer: 0, note: "正官は秩序や責任、目上を示す。" },
  { q: "十二大従星の「天印星」が示すのはどのような傾向か。", choices: ["精神性の高さ","生まれ持った庇護","社会的な権力","経済的な繁栄"], answer: 1, note: "天印星は庇護・援助を意味する星。" },
  { q: "「天禄星」を持つ人に現れやすい傾向はどれか。", choices: ["勤勉で現実的","融通が利かない","芸術的センスが強い","秘密主義"], answer: 0, note: "天禄星は勤勉・現実性を表す。" },
  { q: "「天将星」が意味するものとして最も正しいのはどれか。", choices: ["集団を統率する力","芸術・美","精神的直観力","謙虚で従順"], answer: 0, note: "天将星は統率力・リーダーシップを意味する。" },
  { q: "「天胡星」の特徴として適切なのはどれか。", choices: ["秘密・内向・研究心","開放的・外交的","実務能力に優れる","金銭感覚が鋭い"], answer: 0, note: "天胡星は秘密主義・研究心の星。" },
  { q: "命式において「日干」が強すぎる場合、調整するのに有効なものはどれか。", choices: ["財星","官星","印星","比肩"], answer: 1, note: "身が強すぎる時は官星で調整する。" },
  { q: "財星が過剰に強い命式で起こりやすい現象はどれか。", choices: ["財産が安定して増える","財に溺れて道を誤る","名誉を得やすい","家族縁が強まる"], answer: 1, note: "財が強すぎると財に溺れる危険がある。" },
  { q: "傷官が強く正官を剋している場合に起こりやすいことはどれか。", choices: ["上司や権威との摩擦","財運の流失","健康悪化","家庭不和"], answer: 0, note: "傷官が官星を剋すと上司と衝突しやすい。" },
  { q: "身弱で印星が多い場合に出やすい傾向はどれか。", choices: ["知識欲が強く学問に向く","実務力が強い","経済力が安定する","芸術面で成功する"], answer: 0, note: "身弱で印星が多いと学問に向く。" },
  { q: "命式の三合会局で「寅・午・戌」が揃った場合、五行で何が旺じるか。", choices: ["木","火","土","金"], answer: 1, note: "寅・午・戌三合会局で火が旺じる。" },
  { q: "身弱で財星が強い場合、最も必要とされる星はどれか。", choices: ["比肩・劫財","官星","印星","食神"], answer: 2, note: "身弱で財星が強い場合は印星が守護となる。" },
  { q: "『従財格』が成立するのはどのような場合か。", choices: ["財星が極端に強く身が弱い場合","財星と官星が拮抗する場合","印星が多く比肩がない場合","日干が強く財がない場合"], answer: 0, note: "従財格は財星が極端に強く身が弱い場合に成立。" },
  { q: "命式において『調候』を考える際に最も重視されるのはどの支か。", choices: ["年支","月支","日支","時支"], answer: 1, note: "調候は季節を示す月支が基準。" },
  { q: "『従児格（従旺格）』が成立する条件はどれか。", choices: ["身弱で印星が多い","身弱で財官が多い","身が極端に弱く比劫がない","身が極端に強く他星を受け入れる"], answer: 3, note: "従旺格は身が極端に強く他星を従える場合。" },
  { q: "格局を判定する上で重要な基準はどれか。", choices: ["大運の影響","月令（季節）","年干の五行","時柱の地支"], answer: 1, note: "格局判定は季節（月令）を重視する。" },
  { q: "算命学でいう『守護神』とは何を意味するか。", choices: ["命式を安定させる五行","最も強い星","先祖の因縁を示す星","未来の運を示す星"], answer: 0, note: "守護神は命式のバランスを取る重要な五行。" },
  { q: "火が強すぎる命式で守護神となる五行はどれか。", choices: ["木","火","土","水"], answer: 3, note: "火が強すぎる時は水が守護神となる。" },
  { q: "水が弱く金が強い命式で守護神として有効なのはどれか。", choices: ["木","火","土","水"], answer: 3, note: "金が強く水が弱い時は水を補うのが守護神。" },
  { q: "身旺で財星が弱い命式で守護神となるのはどれか。", choices: ["官星","印星","比肩","財星"], answer: 3, note: "身旺で財が弱い場合は財星が守護神となる。" },
  { q: "土が過剰に強い命式で守護神となるのはどれか。", choices: ["木","火","金","水"], answer: 0, note: "土が過剰に強い時は木で抑えるのが守護神。" },
  { q: "十二支の『子午冲』が意味するものはどれか。", choices: ["水火の激突","金木の調和","土の余剰","陰陽の調和"], answer: 0, note: "子午冲は水火の激突を意味する。" },
  { q: "『辰戌沖』が命式にある場合に現れやすい事象はどれか。", choices: ["精神不安や極端さ","金銭運の安定","家庭の調和","学問の成功"], answer: 0, note: "辰戌沖は両極端で不安定さを招く。" },
  { q: "『寅申巳三刑』が命式にある場合、出やすい傾向はどれか。", choices: ["人間関係の摩擦","財産増加","精神安定","権力上昇"], answer: 0, note: "寅申巳三刑は人間関係の摩擦を生みやすい。" },
  { q: "『子未害』が意味するものはどれか。", choices: ["婚姻問題や人間関係の不和","学問に強い関心","財運の安定","仕事の成功"], answer: 0, note: "子未害は婚姻問題や不和を起こす。" },
  { q: "地支の『三合会局』で申子辰が揃うと旺じる五行はどれか。", choices: ["木","火","土","水"], answer: 3, note: "申子辰三合は水が旺じる会局。" },
  { q: "大運とは何を示すか。", choices: ["10年ごとの運勢推移","1年ごとの運勢","命式の中心的性質","先祖の影響"], answer: 0, note: "大運は10年ごとの運勢推移を示す。" },
  { q: "流年とは何を示すか。", choices: ["毎年の運勢","月ごとの運勢","日ごとの運勢","一生の基礎運"], answer: 0, note: "流年は毎年の運勢を示す。" },
  { q: "大運が身を助ける星で巡るとき、一般的にどうなるか。", choices: ["運が安定しやすい","困難が増える","病気しやすい","孤立しやすい"], answer: 0, note: "大運で助けとなる星が巡ると安定する。" },
  { q: "流年で命式の日干を剋す星が巡るとき起こりやすいことはどれか。", choices: ["健康問題や対人摩擦","財運上昇","結婚の機会","精神安定"], answer: 0, note: "流年で日干を剋すと摩擦や健康問題が生じる。" },
  { q: "大運で財星が巡り、命式に財がない場合どうなるか。", choices: ["財の獲得の機会が訪れる","財を失う","病気しやすい","人間関係が悪化"], answer: 0, note: "大運で財が巡り命式に財がない場合は財を得る機会。" },
  { q: "命式に『火土』が多く『木水』が欠ける場合に現れる傾向はどれか。", choices: ["保守的で現実的","学問的・知性的","芸術的","流動的で柔軟"], answer: 0, note: "火土が多く木水が欠けると保守的・現実的傾向になる。" },
  { q: "官星がなく財星ばかりの場合、出やすい現象はどれか。", choices: ["家庭円満","異性問題や金銭問題","社会的評価の上昇","精神安定"], answer: 1, note: "官がなく財が多いと異性や金銭の問題が起きやすい。" },
  { q: "印星がなく傷官が強い命式で出やすい現象はどれか。", choices: ["創造力と批判精神が強まるが学問に弱い","家族縁が深まる","財運が強まる","対人関係が穏やか"], answer: 0, note: "印がなく傷官が強いと学問に弱く批判精神が強まる。" },
  { q: "命式に比肩が多すぎる場合に出やすい現象はどれか。", choices: ["仲間に恵まれる","孤立や競争心の強さ","財が集まりやすい","安定した社会的地位"], answer: 1, note: "比肩が多すぎると孤立や競争心の強さに繋がる。" },
  { q: "命式の中で陰陽のバランスが崩れると出やすい傾向はどれか。", choices: ["極端な性格や運勢の偏り","家庭運の上昇","仕事運の安定","財運の安定"], answer: 0, note: "陰陽のバランスが崩れると極端で偏った性格になる。" }
];

/* 状態と要素 */
let selectedQuestions = [];
const state = { i: 0, score: 0, selected: [] };
const els = {
  noticeSection: document.getElementById("noticeSection"),
  toQuizBtn: document.getElementById("toQuizBtn"),
  quizSection: document.getElementById("quizSection"),
  progressLabel: document.getElementById("progressLabel"),
  progressBar: document.getElementById("progressBar"),
  scoreLabel: document.getElementById("scoreLabel"),
  questionText: document.getElementById("questionText"),
  choices: document.getElementById("choices"),
  prevBtn: document.getElementById("prevBtn"),
  nextBtn: document.getElementById("nextBtn"),
  resetBtn: document.getElementById("resetBtn"),
  resultCard: document.getElementById("resultCard"),
  finalScore: document.getElementById("finalScore"),
  totalQuestions: document.getElementById("totalQuestions"),
  gradeText: document.getElementById("gradeText"),
  copyLink: document.getElementById("copyLink"),
  retryBtn: document.getElementById("retryBtn"),
  reviewArea: document.getElementById("reviewArea"),
};

/* 開始フロー（注意→クイズ） */
els.toQuizBtn.onclick = () => {
  els.noticeSection.classList.add("d-none");
  els.quizSection.classList.remove("d-none");
  selectedQuestions = [...QUESTIONS].sort(() => Math.random() - 0.5).slice(0, 10);
  state.i = 0;
  state.score = 0;
  state.selected = Array(selectedQuestions.length).fill(null);
  render();
};

/* 描画 */
function render() {
  const q = selectedQuestions[state.i];
  els.progressLabel.textContent = `${state.i + 1} / ${selectedQuestions.length}`;
  els.progressBar.style.width = `${(state.i / selectedQuestions.length) * 100}%`;
  els.questionText.textContent = q.q;

  els.choices.innerHTML = "";
  q.choices.forEach((c, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "list-group-item list-group-item-action choice text-start";
    btn.innerHTML = `<span class="badge bg-secondary me-2">${idx + 1}</span>${c}`;
    btn.onclick = () => selectChoice(idx);
    if (state.selected[state.i] === idx) btn.classList.add("active");
    els.choices.appendChild(btn);
  });

  els.prevBtn.disabled = state.i === 0;
  els.nextBtn.textContent = state.i === selectedQuestions.length - 1 ? "採点する" : "次へ";
  els.scoreLabel.textContent = `${state.score} 点`;
}

function selectChoice(idx) {
  state.selected[state.i] = idx;
  state.score = state.selected.reduce((acc, val, i) => {
    if (val === null) return acc;
    return acc + (val === selectedQuestions[i].answer ? 1 : 0);
  }, 0);
  render();
}

els.prevBtn.onclick = () => { state.i = Math.max(0, state.i - 1); render(); };
els.nextBtn.onclick = () => { if (state.i === selectedQuestions.length - 1) return submit(); state.i++; render(); };
els.resetBtn.onclick = () => reset();
els.retryBtn.onclick = () => { reset(); els.resultCard.classList.add("d-none"); els.quizSection.scrollIntoView({ behavior: "smooth" }); };

/* 採点とレビュー表示 */
function submit() {
  const firstBlank = state.selected.findIndex(v => v === null);
  if (firstBlank !== -1) { state.i = firstBlank; render(); alert("未回答の問題があります"); return; }

  state.score = state.selected.reduce((acc, val, i) => acc + (val === selectedQuestions[i].answer ? 1 : 0), 0);
  els.finalScore.textContent = state.score;
  els.totalQuestions.textContent = selectedQuestions.length;

  const rate = state.score / selectedQuestions.length;
  let grade = "";
  if (rate === 1) grade = "🌟 パーフェクト！";
  else if (rate >= 0.8) grade = "✨ 合格レベル";
  else if (rate >= 0.6) grade = "💡 もう一歩";
  else grade = "📚 基礎からの学習がおすすめ";
  els.gradeText.textContent = grade;

els.reviewArea.innerHTML = selectedQuestions
  .map((q, i) => {
    const correct = q.answer;
    const sel = state.selected[i];
    const ok = sel === correct;
    const your = sel !== null ? `${sel + 1}. ${q.choices[sel]}` : "未回答";
    const corr = `${correct + 1}. ${q.choices[correct]}`;
    const badge = ok ? "✅ 正解" : "❌ 不正解";
    return `
      <div class="mb-3">
        <div class="fw-bold review-question">Q${i + 1}. ${q.q}</div>
        <div class="small ${ok ? "review-correct" : "review-wrong"}">
          ${badge}｜あなたの解答：${your}
        </div>
        <div class="small review-answer">正解：${corr}</div>
        <div class="small muted">解説：${q.note || "-"}</div>
      </div>
    `;
  })
  .join("");


  els.resultCard.classList.remove("d-none");
  window.scrollTo({ top: els.resultCard.offsetTop - 80, behavior: "smooth" });

  // メール登録フォーム（/subscribe にPOST）
  if (typeof setupSubscribeForm === "function") setupSubscribeForm();
}

function reset() {
  state.i = 0;
  state.score = 0;
  if (selectedQuestions.length) state.selected = Array(selectedQuestions.length).fill(null);
  render();
}

/* 共有リンク（任意） */
if (els.copyLink) {
  els.copyLink.addEventListener("click", async () => {
    const url = location.origin + location.pathname + `?score=${state.score}&total=${selectedQuestions.length}`;
    try { await navigator.clipboard.writeText(url); alert("結果リンクをコピーしました"); }
    catch { prompt("コピーできない場合は手動でコピーしてください", url); }
  });
}

