"use strict";

// =========================================
//  練習問題（/quiz.html）ページ用スクリプト
//  元のインラインJSを外部化
// =========================================

(function () {
  // 正解（文字の番号で統一）
  const ANSWERS = { q1: "2", q2: "3" };

  // ユーティリティ
  function getValue(name) {
    const el = document.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : null;
  }

  function mark(name, isCorrect, chosen) {
    const el = document.getElementById(name + "Mark");
    if (!el) return false;

    if (!chosen) {
      el.innerHTML = '<span class="wrong">未選択です</span>';
      return false;
    }
    if (isCorrect) {
      el.innerHTML = '<span class="correct">正解！</span>';
    } else {
      el.innerHTML =
        '<span class="wrong">不正解</span>（あなたの選択：' + chosen + "）";
    }
    return isCorrect;
  }

  // 初期化（DOM読み込み後）
  function init() {
    const checkBtn = document.getElementById("checkBtn");
    const explainSection = document.getElementById("explainSection");
    if (!checkBtn) return;

    checkBtn.addEventListener("click", () => {
      const v1 = getValue("q1");
      const v2 = getValue("q2");

      const ok1 = mark("q1", v1 === ANSWERS.q1, v1);
      const ok2 = mark("q2", v2 === ANSWERS.q2, v2);

      // 解説を展開
      if (explainSection) {
        explainSection.classList.remove("d-none");
      }

      // 解説へスクロール（1つでも回答されていれば）
      if ((v1 || v2) && explainSection && explainSection.scrollIntoView) {
        explainSection.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
