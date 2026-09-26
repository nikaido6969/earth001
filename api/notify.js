// 事業者ポータルからの申請をLarkグループへ通知する。
// 通知先のWebhook URLは配信時にのみ埋め込む（公開リポジトリには置かない）。
const WEBHOOK = process.env.LARK_WEBHOOK_URL || '__LARK_WEBHOOK_URL__';

const clip = (v, n = 300) => String(v ?? '').slice(0, n);
const field = (label, value, short = true) => ({
  is_short: short,
  text: { tag: 'lark_md', content: `**${label}**\n${clip(value) || '—'}` },
});

function buildCard(b) {
  const who = `${clip(b.operatorName, 80)}（${clip(b.operatorId, 20)}）`;
  const item = `${clip(b.productName, 160)}（${clip(b.productCode, 30)}）`;
  const common = [field('事業者', who), field('自治体', b.municipality), field('返礼品', item, false)];

  if (b.type === 'slip') {
    return {
      config: { wide_screen_mode: true },
      header: { template: 'red', title: { tag: 'plain_text', content: '🚨【伝票発行依頼】ヤマト運輸へ伝票発行の手配をお願いします' } },
      elements: [
        { tag: 'div', text: { tag: 'lark_md', content: '<at id=all></at> **事業者から伝票発行依頼が届きました。至急ご対応ください。**' } },
        { tag: 'hr' },
        { tag: 'div', fields: [...common, field('依頼日時', b.requestedAt)] },
      ],
    };
  }

  if (b.type === 'renew') {
    return {
      config: { wide_screen_mode: true },
      header: { template: 'orange', title: { tag: 'plain_text', content: '【翌年度の受付可否】事業者から回答が届きました' } },
      elements: [
        { tag: 'div', fields: [...common, field('回答', b.answer), field('今年度の受付終了日', b.acceptTo),
          ...(b.note ? [field('内容', clip(b.note, 1000), false)] : []), field('回答日時', b.requestedAt)] },
      ],
    };
  }

  return {
    config: { wide_screen_mode: true },
    header: { template: 'blue', title: { tag: 'plain_text', content: `【返礼品変更申請】${clip(b.typeLabel, 40)}` } },
    elements: [
      { tag: 'div', fields: [...common, field('変更前', b.before), field('変更後', b.after),
        ...(b.desiredDate ? [field('希望日', b.desiredDate)] : []), field('申請日時', b.requestedAt)] },
    ],
  };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  if (!b.type || !b.operatorId || !b.productCode) return res.status(400).json({ ok: false, error: 'missing fields' });

  try {
    const r = await fetch(WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msg_type: 'interactive', card: buildCard(b) }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.code !== 0) return res.status(502).json({ ok: false, error: j.msg || r.status });
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(502).json({ ok: false, error: String(e) });
  }
};
