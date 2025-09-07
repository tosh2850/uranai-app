// script.js（算命学版）
const QUIZ_TITLE = "占い知識 検定（ベータ）— 算命学編";
document.title = QUIZ_TITLE;

/**
 * 算命学の基礎～用語確認の4択問題集
 * - 40問用意 → 受験開始時にランダムで10問抽出
 * - answer は choices の正解インデックス（0〜3）
 * - note は簡単な補足
 */
const QUESTIONS = [
  { q: "算命学で陰陽五行の『五行』に含まれないものは？",
    choices: ["木", "火", "土", "風"], answer: 3,
    note: "五行は木・火・土・金・水。" },
  { q: "十干に該当するものはどれ？",
    choices: ["甲・乙・丙・丁…", "子・丑・寅・卯…", "長生・沐浴・冠帯…", "天報・天印・天貴…"], answer: 0,
    note: "十干＝甲乙丙丁戊己庚辛壬癸。" },
  { q: "十二支に該当するものはどれ？",
    choices: ["甲・乙・丙・丁…", "子・丑・寅・卯…", "比肩・劫財・食神…", "天将・天南・天禄…"], answer: 1,
    note: "十二支＝子丑寅卯辰巳午未申酉戌亥。" },
  { q: "十干のうち『金』に属するのは？",
    choices: ["戊・己", "庚・辛", "甲・乙", "壬・癸"], answer: 1,
    note: "庚・辛＝金、甲乙＝木、丙丁＝火、戊己＝土、壬癸＝水。" },
  { q: "十干のうち『水』に属するのは？",
    choices: ["壬・癸", "甲・乙", "丙・丁", "戊・己"], answer: 0,
    note: "壬・癸＝水。" },
  { q: "十干のうち『木』に属するのは？",
    choices: ["甲・乙", "庚・辛", "丙・丁", "戊・己"], answer: 0,
    note: "甲・乙＝木。" },
  { q: "十干のうち『火』に属するのは？",
    choices: ["甲・乙", "丙・丁", "庚・辛", "壬・癸"], answer: 1,
    note: "丙・丁＝火。" },
  { q: "十干のうち『土』に属するのは？",
    choices: ["戊・己", "丙・丁", "庚・辛", "壬・癸"], answer: 0,
    note: "戊・己＝土。" },
  { q: "十二運（長生・沐浴・冠帯…）は主に何の“流れ”を示す概念？",
    choices: ["身体の健康運", "気の盛衰サイクル", "金運の推移", "対人関係の相性"], answer: 1,
    note: "十二運は“気”の成長〜衰退サイクルを表す。" },
  { q: "十二運の並びとして正しい起点は？",
    choices: ["長生", "帝旺", "墓", "絶"], answer: 0,
    note: "一般に長生→沐浴→冠帯→建禄→帝旺→衰→病→死→墓→絶→胎→養。" },
  { q: "干支の相性で用いられる『相生』の関係はどれ？",
    choices: ["木→土", "木→火", "火→水", "金→木"], answer: 1,
    note: "相生：木生火・火生土・土生金・金生水・水生木。" },
  { q: "『相剋』の関係で正しい組み合わせは？",
    choices: ["木剋金", "金剋火", "水剋土", "土剋木"], answer: 3,
    note: "相剋：木剋土・土剋水・水剋火・火剋金・金剋木。" },
  { q: "算命学で命式の中心として重視されるのは？",
    choices: ["年干", "日干", "月支", "時支"], answer: 1,
    note: "日干（自分の性質の核）を特に重視する。" },
  { q: "十二支の『子』に対応する方位は？",
    choices: ["北", "南", "東", "西"], answer: 0,
    note: "子＝北、午＝南、卯＝東、酉＝西。" },
  { q: "十二支の『卯』に該当する方位は？",
    choices: ["西", "東", "北東", "南西"], answer: 1,
    note: "卯＝東。" },
  { q: "十二支の『午』に該当する方位は？",
    choices: ["南", "北", "東", "西"], answer: 0,
    note: "午＝南。" },
  { q: "十二支の『酉』に該当する方位は？",
    choices: ["東", "西", "北", "南"], answer: 1,
    note: "酉＝西。" },
  { q: "十二大従星に含まれる星はどれ？",
    choices: ["天報星", "偏財", "印綬", "正官"], answer: 0,
    note: "十二大従星の例：天報・天印・天貴・天恍・天南・天禄・天将・天極・天庫・天馳・天胡・天堂。" },
  { q: "十二大従星のうち、晩年期の星に分類されることが多いのは？",
    choices: ["天報星", "天将星", "天南星", "天胡星"], answer: 1,
    note: "配列の考え方はいくつかあるが、天将星は晩年寄りで“責任・器の大きさ”などの象意が語られる。" },
  { q: "十干の陰陽で『甲』は何に分類？",
    choices: ["陽の木", "陰の木", "陽の火", "陰の火"], answer: 0,
    note: "甲＝陽木、乙＝陰木。" },
  { q: "十干の陰陽で『乙』は何に分類？",
    choices: ["陽の木", "陰の木", "陽の金", "陰の金"], answer: 1,
    note: "乙＝陰木。" },
  { q: "十干の陰陽で『丙』『丁』はそれぞれ？",
    choices: ["丙=陽火・丁=陰火", "丙=陰火・丁=陽火", "丙=陽金・丁=陰金", "丙=陽木・丁=陰木"], answer: 0,
    note: "丙＝陽火、丁＝陰火。" },
  { q: "十干の陰陽で『庚』『辛』はそれぞれ？",
    choices: ["庚=陽金・辛=陰金", "庚=陰金・辛=陽金", "庚=陽土・辛=陰土", "庚=陽水・辛=陰水"], answer: 0,
    note: "庚＝陽金、辛＝陰金。" },
  { q: "十干の陰陽で『壬』『癸』はそれぞれ？",
    choices: ["壬=陽水・癸=陰水", "壬=陰水・癸=陽水", "壬=陽木・癸=陰木", "壬=陽火・癸=陰火"], answer: 0,
    note: "壬＝陽水、癸＝陰水。" },
  { q: "五行の“季節”対応で正しいものは？",
    choices: ["木=冬 / 火=春 / 土=夏 / 金=秋 / 水=土用", "木=春 / 火=夏 / 土=土用 / 金=秋 / 水=冬", "木=秋 / 火=冬 / 土=春 / 金=夏 / 水=土用", "一定の対応は無い"], answer: 1,
    note: "一般に木=春、火=夏、金=秋、水=冬、土=土用とされる。" },
  { q: "十二支の動物対応で誤っているものは？",
    choices: ["子=ねずみ", "卯=とら", "午=うま", "酉=とり"], answer: 1,
    note: "卯＝うさぎ（とらは寅）。" },
  { q: "十二運の『帝旺』はどんな段階？",
    choices: ["誕生直後", "勢いが最高潮", "力が衰える入口", "完全な終息"], answer: 1,
    note: "帝旺は最盛期の段階。" },
  { q: "十二運の『絶』のイメージとして最も近いのは？",
    choices: ["芽生え", "最盛期", "ごく弱い状態", "学びの段階"], answer: 2,
    note: "絶は力が途絶える・ごく弱い状態。" },
  { q: "算命学で“命式”を構成する主な情報に含まれないものは？",
    choices: ["十干", "十二支", "五行", "星占いの12星座"], answer: 3,
    note: "算命学は干支暦ベース。西洋の12星座は別体系。" },
  { q: "五行の“色”で一般的に対応とされるのは？",
    choices: ["木=青/火=赤/土=黄/金=白/水=黒", "木=赤/火=白/土=黒/金=青/水=黄", "木=黄/火=黒/土=青/金=赤/水=白", "特に対応は無い"], answer: 0,
    note: "五行色体表：木青・火赤・土黄・金白・水黒（諸説はある）。" },
  { q: "十干で『戊・己』は何の五行？",
    choices: ["土", "木", "火", "金"], answer: 0,
    note: "戊己＝土。" },
  { q: "十干で『庚・辛』は何の五行？",
    choices: ["土", "金", "木", "水"], answer: 1,
    note: "庚辛＝金。" },
  { q: "十干で『甲・乙』は何の五行？",
    choices: ["木", "火", "土", "水"], answer: 0,
    note: "甲乙＝木。" },
  { q: "十干で『丙・丁』は何の五行？",
    choices: ["水", "金", "火", "土"], answer: 2,
    note: "丙丁＝火。" },
  { q: "十干で『壬・癸』は何の五行？",
    choices: ["水", "木", "火", "金"], answer: 0,
    note: "壬癸＝水。" },
  { q: "算命学で『日干』が示すものとして最も近いのは？",
    choices: ["自分の核の性質", "家庭運", "金運", "健康運"], answer: 0,
    note: "日干＝自我の核・基本性質。" },
  { q: "干支の“合”や“冲”は何を示す語？",
    choices: ["金額の大小", "方位と時間", "干支同士の関係性", "誕生石の種類"], answer: 2,
    note: "合・冲・刑・害など、干支の関係性を指す語がある。" },
  { q: "十二大従星のうち『天禄星』の一般的なイメージに近いのは？",
    choices: ["守り・安定", "拡張・外へ進出", "学び・未完成", "急変・スピード"], answer: 0,
    note: "星の解釈は流派で差があるが、天禄星は堅実・守りの性質を語られやすい。" },
  { q: "十二大従星のうち『天南星』の一般的なイメージに近いのは？",
    choices: ["年長者的・器の大きさ", "幼少・未成熟", "隠遁・内省", "芸術・夢見"], answer: 0,
    note: "天南星はおおらか・面倒見などのイメージが語られることが多い。" },
  { q: "十二大従星のうち『天恍星』の一般的なイメージに近いのは？",
    choices: ["ロマン・感性・理想", "実利・現実", "武・統率", "倹約・保守"], answer: 0,
    note: "天恍星はロマン・感性寄りの象意で語られやすい。" },
  { q: "十二運の『建禄』はどんな段階？",
    choices: ["芽生えの直後で力が付く", "最高潮", "終息期", "無の状態"], answer: 0,
    note: "建禄は力が安定し始める段階。" },
  { q: "十二運の『墓』のイメージに最も近いのは？",
    choices: ["蓄積・まとめ", "最盛期", "誕生", "完全な消滅"], answer: 0,
    note: "“墓”は終息とともに“蓄積して眠らせる”ようなニュアンスも語られる。" }
];

// 受験時にランダムで10問抽出
let selectedQuestions = [];

const state = { i: 0, score: 0, selected: [] };

const els = {
  startBtn: document.getElementById("startBtn"),
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
  shareTwitter: document.getElementById("shareTwitter"),
  copyLink: document.getElementById("copyLink"),
  retryBtn: document.getElementById("retryBtn"),
  reviewArea: document.getElementById("reviewArea"),
};

// 初期画面 → 注意ページ
els.startBtn.onclick = () => {
  document.querySelector("header").classList.add("d-none");
  els.noticeSection.classList.remove("d-none");
};

// 注意ページ → クイズ開始
els.toQuizBtn.onclick = () => {
  els.noticeSection.classList.add("d-none");
  els.quizSection.classList.remove("d-none");

  // 40問からランダム10問
  selectedQuestions = [...QUESTIONS].sort(() => Math.random() - 0.5).slice(0, 10);
  state.i = 0;
  state.score = 0;
  state.selected = Array(selectedQuestions.length).fill(null);
  render();
};

function render() {
  if (!selectedQuestions.length) return;

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
  els.nextBtn.textContent =
    state.i === selectedQuestions.length - 1 ? "採点する" : "次へ";
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

els.prevBtn.onclick = () => {
  state.i = Math.max(0, state.i - 1);
  render();
};

els.nextBtn.onclick = () => {
  if (state.i === selectedQuestions.length - 1) return submit();
  state.i++;
  render();
};

els.resetBtn.onclick = () => reset();

els.retryBtn.onclick = () => {
  reset();
  els.resultCard.classList.add("d-none");
  els.quizSection.scrollIntoView({ behavior: "smooth" });
};

function submit() {
  const firstBlank = state.selected.findIndex((v) => v === null);
  if (firstBlank !== -1) {
    state.i = firstBlank;
    render();
    alert("未回答の問題があります");
    return;
  }

  state.score = state.selected.reduce(
    (acc, val, i) => acc + (val === selectedQuestions[i].answer ? 1 : 0),
    0
  );

  els.finalScore.textContent = state.score;
  els.totalQuestions.textContent = selectedQuestions.length;

  const rate = state.score / selectedQuestions.length;
  let grade = "";
  if (rate === 1) grade = "🌟 パーフェクト！";
  else if (rate >= 0.8) grade = "✨ 合格レベル";
  else if (rate >= 0.6) grade = "💡 もう一歩";
  else grade = "📚 基礎からの学習がおすすめ";
  els.gradeText.textContent = grade;

  // レビュー（あなたの解答・正解・補足）
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
          <div class="fw-bold">Q${i + 1}. ${q.q}</div>
          <div class="small ${ok ? "text-success" : "text-danger"}">
            ${badge}｜あなたの解答：${your}
          </div>
          <div class="small">正解：${corr}</div>
          <div class="small muted">補足：${q.note || "-"}</div>
        </div>
      `;
    })
    .join("");

  els.resultCard.classList.remove("d-none");
  window.scrollTo({ top: els.resultCard.offsetTop - 80, behavior: "smooth" });

  // 結果カードのメール登録フォーム初期化（app.js）
  if (typeof setupSubscribeForm === "function") setupSubscribeForm();
}

function reset() {
  state.i = 0;
  state.score = 0;
  if (selectedQuestions.length) {
    state.selected = Array(selectedQuestions.length).fill(null);
  }
  render();
}

// 共有リンク（任意）
if (els.copyLink) {
  els.copyLink.addEventListener("click", async () => {
    const url = location.origin + location.pathname + `?score=${state.score}&total=${selectedQuestions.length}`;
    try {
      await navigator.clipboard.writeText(url);
      alert("結果リンクをコピーしました");
    } catch {
      prompt("コピーできない場合は手動でコピーしてください", url);
    }
  });
}

// ブランドリンクをクリックしたらトップに戻す処理
const brandLink = document.querySelector('.navbar-brand');

function showHome() {
  // ヘッダーを再表示、他を非表示
  document.querySelector('header').classList.remove('d-none');
  els.noticeSection.classList.add('d-none');
  els.quizSection.classList.add('d-none');

  // スクロールでトップに移動
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // モバイル時にオフキャンバスを閉じる
  const ocEl = document.getElementById('navOffcanvas');
  if (ocEl && ocEl.classList.contains('show') && window.bootstrap?.Offcanvas) {
    const oc = bootstrap.Offcanvas.getOrCreateInstance(ocEl);
    oc.hide();
  }
}

if (brandLink) {
  brandLink.addEventListener('click', (e) => {
    e.preventDefault();
    showHome();
  });
}

