// app.js
function setupSubscribeForm() {
  const form = document.getElementById('subForm');
  if (!form) return;

  const input = document.getElementById('subEmail');
  const msg = document.getElementById('subMsg');
  const btn = document.getElementById('subBtn');

  const showMsg = (text, cls) => {
    msg.className = 'text-muted';
    if (cls) msg.classList.add(cls);
    msg.textContent = text;
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = input.value.trim();

    if (!email) return showMsg('メールアドレスを入力してください。', 'text-danger');
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!re.test(email)) return showMsg('メールアドレスの形式が正しくありません。', 'text-danger');

    btn.disabled = true;
    showMsg('送信中...');

    try {
      const res = await fetch('/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();

      if (res.ok && data.ok) {
        showMsg('登録しました。ありがとうございます！', 'text-success');
        input.value = '';
      } else if (res.status === 409) {
        showMsg('このメールはすでに登録済みです。', 'text-warning');
      } else if (data && data.error === 'email is required') {
        showMsg('メールアドレスを入力してください。', 'text-danger');
      } else {
        showMsg('エラーが発生しました。時間をおいて再度お試しください。', 'text-danger');
      }
    } catch (err) {
      console.error(err);
      showMsg('ネットワークエラーが発生しました。', 'text-danger');
    } finally {
      btn.disabled = false;
    }
  });
}

// クイズページ読み込み時に有効化
document.addEventListener('DOMContentLoaded', setupSubscribeForm);
