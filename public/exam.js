(() => {
  const els = {
    statusWrap: document.getElementById('statusWrap'),
    startCard: document.getElementById('startCard'),
    examCard: document.getElementById('examCard'),
    resultCard: document.getElementById('resultCard'),
    examTitle: document.getElementById('examTitle'),
    examForm: document.getElementById('examForm'),
    submitBtn: document.getElementById('submitBtn'),
    openStartDialog: document.getElementById('openStartDialog'),
    startModal: new bootstrap.Modal(document.getElementById('startModal')),
    startExamBtn: document.getElementById('startExamBtn'),
    agreeChk: document.getElementById('agreeChk'),
    timer: document.getElementById('timer'),
    resultBody: document.getElementById('resultBody'),
  };

  // /exam/:token から token を取得
  const token = location.pathname.split('/').filter(Boolean).slice(-1)[0];

  let durationSec = null;
  let countdownId = null;
  let startedAt = null;
  let clockSkewMs = 0; // サーバ時刻 - クライアント時刻 の推定オフセット


  // 離脱ガードと離脱検知用
  let leavingGuard = false;   // trueの間は beforeunload の離脱警告を出す
  let awayStart = null;       // タブ/ウィンドウから離れた開始時刻（ms）
  let awayReason = null;        // 'visibility' / 'blur' など
  let awayCount = 0;          // 離脱回数（復帰時にカウントアップ）
  let examInvalidated = false; // 無効化フラグ（成立後は提出不可）

  // 2回目の離脱でこの閾値（ms）以上なら無効化
  const AWAY_INVALID_MS = 120_000; // 120秒

  let awayAccumMs = 0;        // 累積離脱時間（任意の把握用）
  const AWAY_ALERT_MS = 10_000; // 10秒以上で強めの注意

  /* ========= UIユーティリティ ========= */
  function setStatus(html, kind = 'info') {
    els.statusWrap.innerHTML = `
      <div class="alert alert-${kind} mb-0" role="alert">
        ${html}
      </div>`;
  }
  function clearStatus() { els.statusWrap.innerHTML = ''; }

  function fmtSec(s) {
    s = Math.max(0, s|0);
    const m = Math.floor(s/60).toString().padStart(2,'0');
    const ss = (s%60).toString().padStart(2,'0');
    return `${m}:${ss}`;
  }

  function startCountdown(remaining) {
    if (countdownId) clearInterval(countdownId);
    let rest = remaining;
    els.timer.textContent = `残り ${fmtSec(rest)}`;
    countdownId = setInterval(() => {
      rest -= 1;
      if (rest <= 0) {
        clearInterval(countdownId);
        els.timer.textContent = '時間切れ';
        // 以後の送信をブロック（サーバでも弾くがUIも締める）
        els.submitBtn.disabled = true;
      } else {
        els.timer.textContent = `残り ${fmtSec(rest)}`;
      }
    }, 1000);
  }

  async function fetchJSON(url, options) {
    const res = await fetch(url, options);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = json?.error || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return json;
  }

  // 離脱セグメントをサーバへPOST
  async function postAwaySegment(startMs, endMs, reason) {
    try {
      const startedAt = new Date(startMs).toISOString();
      const endedAt   = new Date(endMs).toISOString();
      await fetchJSON(`/exam/${token}/away`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startedAt,
          endedAt,
          // durationMs はサーバ側でも補正するが参考値として同梱
          durationMs: Math.max(0, endMs - startMs),
          reason: reason || null
        })
      });
    } catch (e) {
      // ログ送信失敗は試験進行を止めない
      console.warn('postAwaySegment failed:', e);
    }
  }

  // 画面離脱ガード（ブラウザ標準の確認ダイアログ）
  window.addEventListener('beforeunload', (e) => {
    if (!leavingGuard) return;
    e.preventDefault();
    e.returnValue = ''; // 仕様上、空文字でOK（文言はブラウザ固定）
    return '';
  });

  /* ========= 動的お知らせモーダル ========= */
  function showNoticeModal(title, bodyHtml) {
    let holder = document.getElementById('noticeModalHolder');
    if (!holder) {
      holder = document.createElement('div');
      holder.id = 'noticeModalHolder';
      document.body.appendChild(holder);
    }
    holder.innerHTML = `
      <div class="modal fade" id="noticeModal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">${title}</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="閉じる"></button>
            </div>
            <div class="modal-body">
              ${bodyHtml}
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-primary" data-bs-dismiss="modal">OK</button>
            </div>
          </div>
        </div>
      </div>
    `;
    const modalEl = document.getElementById('noticeModal');
    const modal = new bootstrap.Modal(modalEl);
    modal.show();
  }

  /* ========= 問題レンダリング ========= */
  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }

  function renderIntro(q) {
    return `
      <div class="alert alert-info" role="alert">
        ${escapeHtml(q.stem || '')}
      </div>
    `;
  }

 
  function renderQuestionSingle(q) {
    const name = q.id;
    const choices = (q.choices || []).map((c, i) => `
      <div class="form-check">
        <input class="form-check-input" type="radio" name="${escapeHtml(name)}" id="${escapeHtml(name)}_${i}" value="${i}">
        <label class="form-check-label" for="${escapeHtml(name)}_${i}">
          ${escapeHtml(c)}
        </label>
      </div>
    `).join('');
    return `
      <div class="mb-4" data-qid="${escapeHtml(q.id)}">
        <div class="fw-semibold mb-1">${escapeHtml(q.stem)}</div>
        ${choices}
      </div>
    `;
  }

  function getUnansweredIds(questions) {
    const missing = [];
    for (const q of questions) {
      if (q.type !== 'single') continue;
      const sel = `input[name="${CSS.escape(q.id)}"]:checked`;
      const checked = document.querySelector(sel);
      if (!checked) missing.push(q.id);
    }
    return missing;
  }

  function scrollToQuestion(qid) {
    const el = document.querySelector(`[data-qid="${CSS.escape(qid)}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('border', 'border-danger', 'rounded');
    setTimeout(() => el.classList.remove('border', 'border-danger', 'rounded'), 2000);
  }

  function renderHeading(q) {
    return `
      <div class="mt-4 mb-2 border-bottom pb-1">
        <h5 class="mb-0">${escapeHtml(q.stem || '')}</h5>
      </div>
    `;
  }

  function renderQuestion(q) {
    if (q.type === 'intro')   return renderIntro(q);
    if (q.type === 'heading') return renderHeading(q);
    if (q.type === 'single')  return renderQuestionSingle(q);
    return `<div class="mb-3">${escapeHtml(q.stem || '')}</div>`;
  }

  /* ========= 問題取得・提出 ========= */
  function readAnswers(questions) {
    const answers = [];
    for (const q of questions) {
      if (q.type === 'single') {
        const checked = document.querySelector(`input[name="${q.id}"]:checked`);
        if (checked) {
          answers.push({ id: q.id, value: Number(checked.value) });
        }
      }
    }
    return answers;
  }

  async function loadQuestions() {
    const meta = await fetchJSON(`/exam/${token}/meta`);
    if (meta.serverNow) {
    clockSkewMs = new Date(meta.serverNow).getTime() - Date.now();
    } else {
    clockSkewMs = 0;
    }
    if (meta.status === 'submitted') {
      setStatus('このリンクは提出済みです。', 'warning');
      els.startCard.classList.add('d-none');
      els.examCard.classList.add('d-none');
      return;
    }
    if (meta.status !== 'started') {
      setStatus('開始前です。開始ボタンから受験を始めてください。', 'info');
      els.startCard.classList.remove('d-none');
      els.examCard.classList.add('d-none');
      return;
    }

    durationSec = meta.durationSec;
    startedAt = meta.startedAt ? new Date(meta.startedAt) : new Date();

    const qRes = await fetchJSON(`/exam/${token}/questions`);
    const payload = qRes.data;
    if (!payload || !Array.isArray(payload.questions)) {
      throw new Error('invalid questions payload (questions not array)');
    }
    els.examTitle.textContent = payload.title || '検定';

    // サーバ時刻で残り時間を計算（時計補正）
    const serverNow = meta.serverNow ? new Date(meta.serverNow).getTime() : Date.now();
    const startedMs = meta.startedAt ? new Date(meta.startedAt).getTime() : serverNow;
    const elapsed = Math.floor((serverNow - startedMs)/1000);
    const remaining = Math.max(0, durationSec - elapsed);
    startCountdown(remaining);

    // 無効化済みなら（サーバ判断）提出不可に
    if (meta.invalidated) {
      setStatus('試験中の離脱を検知したため本試験は無効になりました。', 'danger');
      els.submitBtn.disabled = true;
}


    // 問題描画
    const html = payload.questions.map(q => renderQuestion(q)).join('');
    els.examForm.innerHTML = html;

    // 提出ハンドラ（未解答は1回警告→2回目で提出／無効時は提出不可）
    els.submitBtn.onclick = async (e) => {
      e.preventDefault();

      // 無効化済みなら提出不可
      if (examInvalidated) {
        setStatus('試験中の離脱を検知したため本試験は無効になりました。', 'danger');
        return;
      }

      const missing = getUnansweredIds(payload.questions);
      const confirmed = els.submitBtn.dataset.confirmIncomplete === '1';

      if (missing.length > 0 && !confirmed) {
        setStatus(
          `未解答の設問があります（残り ${missing.length} 問）。<br>
          もう一度 <strong>提出する</strong> を押すと、このまま提出します。`,
          'warning'
        );
        scrollToQuestion(missing[0]);
        els.submitBtn.dataset.confirmIncomplete = '1';
        return; // ここでは送信しない
      }

      // 実送信フェーズ
      els.submitBtn.disabled = true;
      let actuallySubmitted = false;
      try {
        leavingGuard = false; // 送信中は離脱ガードOFF

        const answers = readAnswers(payload.questions);
        const res = await fetchJSON(`/exam/${token}/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ answers })
        });
        actuallySubmitted = true;

        clearStatus();
        els.examCard.classList.add('d-none');
        els.resultCard.classList.remove('d-none');
        els.resultBody.innerHTML = `
          <p class="mb-1">提出時刻：<code>${new Date(res.submittedAt).toLocaleString()}</code></p>
          <p class="mb-1">経過時間：<code>${res.elapsedSec} 秒</code></p>
          <p class="mb-1">スコア：<code>${res.score ?? '-'}</code></p>
          <p class="mb-0 fw-bold ${res.passed ? 'text-success' : 'text-danger'}">
            判定：${res.passed ? '合格' : '不合格'}
          </p>
          <hr>
          <p class="text-muted small mb-0">※合格証については、事務局にて結果を確認後、メールにてお送りいたします。</p>
        `;
      } catch (err) {
        els.submitBtn.disabled = false;
        leavingGuard = true; // 失敗時はまたガードON

        const msg = String(err.message || '');
        if (msg.includes('invalidated')) {
          setStatus('試験中の離脱を検知したため本試験は無効になりました。', 'danger');
          els.submitBtn.disabled = true; // 再提出不可
          return;
        }
        if (msg.includes('time over')) {
          setStatus('時間切れのため提出できませんでした。', 'danger');
          els.submitBtn.disabled = true;
        } else {
          setStatus(`送信に失敗しました：${err.message}`, 'danger');
        }
      } finally {
        if (actuallySubmitted) {
          delete els.submitBtn.dataset.confirmIncomplete;
        }
      }
    };

    els.examCard.classList.remove('d-none');
    els.startCard.classList.add('d-none');
    clearStatus();

    // 受験中は離脱ガードON
    leavingGuard = true;
  }

  /* ========= 離脱検知（可視状態／フォーカス） =========
     仕様：
       - 1回目の離脱→復帰で注意ポップアップ
       - 2回目以降の離脱→復帰で、直前の離脱時間が 120秒以上なら無効化
  */
  // 離脱開始（理由付き）
  function handleAwayStart(reason) {
    if (!leavingGuard) return;   // 試験中のみ監視
    if (awayStart === null) {
      awayStart = Date.now();
      awayReason = reason || null;
    }
    // 画面上にも注意を出す（要求文言）
    setStatus(
      '試験中に別タブなどを開くことはできません。直ちに試験を再開しない場合には、受験資格を失効し回答内容・状況によりを問わず不合格となります。',
      'warning'
    );
  }

  // 離脱復帰（サーバにログ送信＋判定）
  function handleAwayBack(reasonFromEvent) {
    if (!awayStart) return;

    const end = Date.now();
    const delta = end - awayStart;

    // 累計も持っておく（任意）
    awayAccumMs += delta;

    // ★ サーバへ離脱セグメントを送信（reasonは優先：保存したawayReason→イベント由来→null）
    postAwaySegment(awayStart, end, awayReason || reasonFromEvent || null);

    // クリア
    awayStart = null;
    awayReason = null;

    // 回数カウント
    awayCount += 1;

    if (awayCount === 1) {
      // 1回目は注意だけ（モーダル）
      showNoticeModal(
        '注意',
        '試験中の離脱を検知しました。次回別タブへの移動や別アプリケーションの使用が確認された場合、<strong>試験を無効</strong>とします。<br>（なおその場合、返金等は対応いたしかねますのでご留意ください）'
      );
      clearStatus(); // バナーは消す（必要なら残しても可）
      return;
    }

    // 2回目以降：直前の離脱が 120秒以上なら無効化
    if (delta >= AWAY_INVALID_MS && !examInvalidated) {
      examInvalidated = true;
      setStatus('試験中の離脱を検知したため本試験は無効になりました。', 'danger');
      els.submitBtn.disabled = true;
      showNoticeModal(
        '試験無効',
        '二度目の試験中の離脱を認めたため、<strong>本試験は無効</strong>とします。<br>（なお返金等は対応いたしかねますのでご留意ください）'
      );
    } else {
      // 120秒未満なら強い措置は取らず、軽く注意
      if (delta >= AWAY_ALERT_MS) {
        setStatus(
          `直前の離脱が ${Math.round(delta/1000)} 秒でした（累計 ${(awayAccumMs/1000)|0} 秒・${awayCount} 回）。繰り返さないでください。`,
          'warning'
        );
      } else {
        clearStatus();
      }
    }
  }

  // タブ可視状態（他タブ/最小化など）
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      handleAwayStart('visibility');
    } else {
      handleAwayBack('visibility');
    }
  });


  // OSレベルのアプリ切替など（フォーカス喪失）
  window.addEventListener('blur', () => {
    // hidden ではない & まだ離脱中記録が始まっていないとき開始
    if (leavingGuard && !document.hidden && awayStart === null) {
      handleAwayStart('blur');
    }
  });


  // 復帰（フォーカス取得）
  window.addEventListener('focus', () => {
    if (awayStart) {
      // 直前の離脱理由を使う。なければ 'focus' として送る
      handleAwayBack(awayReason || 'focus');
    }
  });


  /* ========= 初期化 ========= */
  async function init() {
    try {
      const meta = await fetchJSON(`/exam/${token}/meta`);
      if (meta.status === 'expired') {
        setStatus('この受験URLは有効期限切れです。', 'danger');
        return;
      }
      if (meta.status === 'submitted') {
        setStatus('このリンクは提出済みです。', 'warning');
        return;
      }
      // issued または started
      if (meta.status === 'issued') {
        setStatus('開始前です。<strong>開始する</strong> を押して受験を始めてください。', 'info');
        els.startCard.classList.remove('d-none');
      } else if (meta.status === 'started') {
        setStatus('受験を再開しました。', 'info');
        await loadQuestions();
      }
    } catch (err) {
      setStatus(`エラー：${err.message}`, 'danger');
    }

    // 開始ダイアログの制御
    els.openStartDialog.addEventListener('click', () => {
      els.agreeChk.checked = false;
      els.startExamBtn.disabled = true;
      els.startModal.show();
    });
    els.agreeChk.addEventListener('change', () => {
      els.startExamBtn.disabled = !els.agreeChk.checked;
    });
    els.startExamBtn.addEventListener('click', async () => {
      try {
        await fetchJSON(`/exam/${token}/start`, { method: 'POST' });
        els.startModal.hide();
        clearStatus();
        await loadQuestions();
      } catch (err) {
        els.startModal.hide();
        setStatus(`開始に失敗しました：${err.message}`, 'danger');
      }
    });
  }

  init();
})();
