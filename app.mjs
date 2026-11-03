import { distribution, summarize, settle, backtest } from './model.mjs';

const match = document.querySelector('#match');
const result = document.querySelector('#result');
const report = document.querySelector('#report');
const percent = value => (value * 100).toFixed(1) + '%';
const date = value => value ? Date.parse(value + '+08:00') : NaN;

match.addEventListener('input', () => { result.textContent = '輸入已修改，請重新計算。'; });
document.querySelector('#demo').onclick = () => {
  const example = { hx: 1.7, ha: 1.1, ax: 1.2, aa: 1.5, hn: 12, an: 12,
    source: '模擬數據 · 12 場', cutoff: '2026-01-01T12:00', kickoff: '2026-01-01T20:00',
    market: 'over', line: 2.25, odds: 1.8, quoted: '2026-01-01T19:00' };
  for (const [key, value] of Object.entries(example)) match.elements[key].value = value;
  match.requestSubmit();
};
match.onsubmit = event => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(match));
  const kickoff = date(data.kickoff), cutoff = date(data.cutoff);
  if (!(cutoff < kickoff) || cutoff > Date.now() || !data.source.trim()) {
    result.textContent = 'PASS · 請填來源，截數須早於開波，並且已經發生。';
    return;
  }
  const home = (+data.hx + +data.aa) / 2, away = (+data.ax + +data.ha) / 2;
  const scores = distribution(home, away);
  const p = summarize(scores);
  const top = scores.sort((a, b) => b.p - a.p).slice(0, 5);
  const lines = [
    '來源　' + data.source.trim(),
    '截數　' + data.cutoff.replace('T', ' ') + ' HKT　｜　樣本　' + data.hn + ' / ' + data.an,
    '預期入球　主 ' + home.toFixed(2) + '　客 ' + away.toFixed(2),
    '主勝 ' + percent(p.home) + '　和 ' + percent(p.draw) + '　客勝 ' + percent(p.away),
    '大 2.5 ' + percent(p.over) + '　細 2.5 ' + percent(1 - p.over),
    '波膽　' + top.map(({h,a,p}) => h + ':' + a + ' ' + percent(p)).join('　')
  ];
  const quoted = date(data.quoted);
  const line = +data.line;
  if (!data.odds || !data.line || !(quoted < kickoff) || quoted > Date.now() ||
      (['over', 'under'].includes(data.market) && line < 0)) {
    lines.push('PASS · 需要有效盤線、賠率及賽前報價時間。');
  } else {
    const assessment = settle(scores, data.market, line, +data.odds);
    lines.push(
      '報價　' + data.quoted.replace('T', ' ') + ' HKT　@ ' + data.odds,
      '注額加權　贏 ' + percent(assessment.win) + '　走 ' + percent(assessment.push) + '　輸 ' + percent(assessment.loss),
      '模型打和賠率 ' + (Number.isFinite(assessment.fair) ? assessment.fair.toFixed(2) : '無有限值') +
        '　每單位模型期望回報 ' + percent(assessment.ev)
    );
    const reasons = [];
    if (+data.odds < 1.60) reasons.push('低於 1.60 入圍門檻');
    if (assessment.ev <= 0) reasons.push('模型期望回報非正');
    if (kickoff <= Date.now()) reasons.push('已到開波時間');
    if (Date.now() - quoted > 60 * 60 * 1000) reasons.push('報價超過一小時');
    reasons.push('模型未經實戰校準');
    lines.push('PASS · ' + reasons.join('／'));
  }
  result.textContent = lines.join('\n');
};

document.querySelector('#backtest').onsubmit = async event => {
  event.preventDefault();
  try {
    const file = document.querySelector('#csv').files[0];
    const result = backtest(await file.text());
    const format = new Intl.DateTimeFormat('zh-HK', { timeZone: 'Asia/Hong_Kong', dateStyle: 'medium' });
    const scores = result.scores.map(row => row.map(score => score.toFixed(4)));
    report.textContent = [
      '場數　' + result.count + '　｜　' + format.format(result.first) + ' 至 ' + format.format(result.last),
      '模型　　　主和客 Brier ／ 大 2.5 Brier',
      '得失球　　' + scores[0].join(' ／ '),
      'xG　　　　' + scores[1].join(' ／ '),
      '時間欄已檢查。來源、重複賽事及賽前快照真確性須由資料提供者核實。'
    ].join('\n');
  } catch (error) {
    report.textContent = error.message;
  }
};
