import { updateGoals } from './goals.mjs?v=1.3.1';
import query from './hkjc-query.mjs';

const endpoint = 'https://info.cld.hkjc.com/graphql/base/';
const format = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Hong_Kong', dateStyle: 'short', timeStyle: 'medium'
});
const hkt = time => format.format(new Date(time));
const inputTime = time => hkt(time).slice(0, 16).replace(' ', 'T');
const fixture = document.querySelector('#fixture');
const quote = document.querySelector('#quote');
const detail = document.querySelector('#match-detail');
const refresh = document.querySelector('#refresh');
const status = document.querySelector('#feed-status');
const match = document.querySelector('#match');
let matches = new Map(), quotes = [];
let snapshots = new Map();
const xgStatus = document.querySelector('#xg-status');
const fields = ['hx', 'ha', 'ax', 'aa', 'hn', 'an', 'source', 'cutoff'];
const key = (code, kickoff) => code + '|' + Date.parse(kickoff);
const timestamp = value => typeof value === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));

function applySnapshot(game) {
  const row = game && snapshots.get(key(game.frontEndId, game.kickOffTime));
  if (!row) {
    xgStatus.textContent = game ? '呢場未有已核對嘅 xG 快照，可以匯入或手填。' : '揀場後會檢查有冇可用嘅 xG 快照。';
    return;
  }
  for (const field of fields) match.elements[field].value = field === 'cutoff' ? inputTime(row.cutoff) : row[field];
  xgStatus.textContent = '已帶入 ' + row.source + ' · 截數 ' + hkt(row.cutoff) + ' HKT';
  match.dispatchEvent(new Event('input'));
}

document.querySelector('#xg-file').onchange = async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const { fixtures } = JSON.parse(await file.text());
    if (!Array.isArray(fixtures) || !fixtures.length) throw Error();
    const next = new Map();
    for (const row of fixtures) {
      if (!row || typeof row.match !== 'string' || !/^FB\d+$/.test(row.match) ||
          !timestamp(row.kickoff) || !timestamp(row.cutoff) || Date.parse(row.cutoff) >= Date.parse(row.kickoff) ||
          Date.parse(row.cutoff) > Date.now() ||
          typeof row.source !== 'string' || !row.source.trim() ||
          !['hx','ha','ax','aa'].every(field => Number.isFinite(row[field]) && row[field] >= 0 && row[field] <= 10) ||
          !['hn','an'].every(field => Number.isSafeInteger(row[field]) && row[field] > 0)) throw Error();
      const id = key(row.match, row.kickoff);
      if (next.has(id)) throw Error();
      next.set(id, row);
    }
    snapshots = next;
    const game = matches.get(fixture.value);
    if (game) {
      for (const field of fields) match.elements[field].value = '';
      match.dispatchEvent(new Event('input'));
      applySnapshot(game);
    } else {
      xgStatus.textContent = '已匯入 ' + snapshots.size + ' 場，請選擇賽事。';
    }
  } catch {
    xgStatus.textContent = '匯入失敗。請檢查場次、時間、樣本同 xG 欄位。';
  }
};

function clearQuote() {
  for (const field of ['line', 'odds', 'quoted']) match.elements[field].value = '';
  match.dispatchEvent(new Event('input'));
}

function selectFixture() {
  const game = matches.get(fixture.value);
  quote.replaceChildren(new Option('選擇盤口以帶入試算', ''));
  detail.textContent = '';
  quotes = [];
  quote.disabled = true;
  if (!game) return;
  const had = new Map();
  for (const pool of game.foPools ?? []) {
    if (pool.status !== 'SELLINGSTARTED') continue;
    for (const line of pool.lines ?? []) {
      if (line.status !== 'AVAILABLE') continue;
      const parts = String(line.condition).split('/');
      const valid = parts.length <= 2 && parts.every(value => /^[+-]?\d+(\.\d+)?$/.test(value));
      const number = valid ? parts.reduce((sum, value) => sum + Number(value), 0) / parts.length : NaN;
      for (const selection of line.combinations ?? []) {
        const odds = Number(selection.currentOdds);
        if (selection.status !== 'AVAILABLE' || !Number.isFinite(odds) || odds < 1.01) continue;
        const side = selection.str;
        if (pool.oddsType === 'HAD' && ['H', 'D', 'A'].includes(side)) had.set(side, odds);
        const total = pool.oddsType === 'HIL';
        if (!(total ? ['H', 'L'].includes(side) : pool.oddsType === 'HDC' && ['H', 'A'].includes(side))) continue;
        if (!Number.isFinite(number) || Math.abs(number) > 10 || !Number.isInteger(number * 4) || (total && number < 0)) continue;
        const market = total ? (side === 'H' ? 'over' : 'under') : (side === 'H' ? 'home' : 'away');
        const value = market === 'away' ? -number : number;
        const name = {over:'大',under:'細',home:'主隊讓球',away:'客隊讓球'}[market];
        quotes.push({ market, value, odds, updated: Date.parse(pool.updateAt), main: line.main,
          label: name + ' ' + (value > 0 && !total ? '+' : '') + value + ' @ ' + odds });
      }
    }
  }
  quotes.sort((a, b) => Number(b.main) - Number(a.main));
  quotes.forEach((item, index) => quote.add(new Option(item.label + (item.main ? ' · 主盤' : ''), String(index))));
  quote.disabled = !quotes.length;
  detail.textContent = '主和客（主／和／客）　' + ['H','D','A'].map(side => had.get(side) ?? '—').join(' ／ ') +
    (quotes.length ? '' : '　｜　暫無可帶入盤口');
}

fixture.onchange = () => {
  const game = matches.get(fixture.value);
  for (const field of fields) match.elements[field].value = '';
  match.elements.kickoff.value = game ? inputTime(game.kickOffTime) : '';
  clearQuote();
  selectFixture();
  applySnapshot(game);
  updateGoals(game);
};
quote.onchange = () => {
  clearQuote();
  const item = quote.value === '' ? null : quotes[Number(quote.value)];
  if (!item) return;
  match.elements.market.value = item.market;
  match.elements.line.value = item.value;
  match.elements.odds.value = item.odds;
  if (Number.isFinite(item.updated)) match.elements.quoted.value = inputTime(item.updated);
};
document.querySelector('#demo').addEventListener('click', () => {
  fixture.value = '';
  selectFixture();
  applySnapshot();
  updateGoals();
});

async function load() {
  refresh.disabled = true;
  fixture.disabled = true;
  quote.disabled = true;
  const selected = fixture.value;
  if (quote.value !== '') clearQuote();
  status.textContent = '正在讀取馬會賽事…';
  try {
    const types = ['HAD', 'HIL', 'HDC'];
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(12000),
      body: JSON.stringify({ operationName:'matchList', query, variables: {
        startIndex:null,endIndex:null,startDate:null,endDate:null,tournIds:null,matchIds:null,
        frontEndIds:null,fbOddsTypes:types,fbOddsTypesM:types,showAllMatch:false,
        featuredMatchesOnly:false,earlySettlementOnly:false
      } })
    });
    if (!response.ok) throw Error();
    const payload = await response.json();
    if (payload.errors?.length || !Array.isArray(payload.data?.matches)) throw Error();
    const now = Date.now();
    const days = [hkt(now).slice(0, 10), hkt(now + 86400000).slice(0, 10)];
    const games = payload.data.matches.filter(game => {
      const time = Date.parse(game.kickOffTime);
      return game.status === 'PREEVENT' && time > now && days.includes(hkt(time).slice(0, 10));
    }).sort((a, b) => Date.parse(a.kickOffTime) - Date.parse(b.kickOffTime));
    matches = new Map(games.map(game => [String(game.id), game]));
    fixture.replaceChildren(new Option('請選擇賽事', ''));
    for (const game of matches.values()) {
      const name = team => team?.name_ch || team?.name_en || '—';
      const label = [hkt(game.kickOffTime).slice(5, 16), game.frontEndId, name(game.tournament),
        name(game.homeTeam) + ' 對 ' + name(game.awayTeam)].filter(Boolean).join(' · ');
      fixture.add(new Option(label, game.id));
    }
    fixture.value = matches.has(selected) ? selected : '';
    if (selected) match.elements.kickoff.value = fixture.value ? inputTime(matches.get(selected).kickOffTime) : '';
    fixture.disabled = !matches.size;
    selectFixture();
    updateGoals(matches.get(fixture.value));
    status.textContent = days.join(' ／ ') + ' · ' + (matches.size ? matches.size + ' 場未開波' : '暫無未開波賽事') +
      ' · 讀取時間 ' + hkt(now) + ' HKT';
  } catch {
    status.textContent = '暫時未能讀取馬會資料。請按 Refresh 重試，或到馬會網站核對。';
    detail.textContent = '';
  } finally {
    refresh.disabled = false;
  }
}
refresh.onclick = load;
load();
