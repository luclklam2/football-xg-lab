import { distribution, summarize } from './model.mjs';

const leagues = new Map([
  ['英格蘭超級聯賽', 'en.1'], ['英格蘭冠軍聯賽', 'en.2'],
  ['英格蘭甲組聯賽', 'en.3'], ['英格蘭乙組聯賽', 'en.4']
]);
const aliases = {
  blackburn:'blackburn rovers', stoke:'stoke city', charlton:'charlton athletic',
  bolton:'bolton wanderers', derby:'derby county', norwich:'norwich city',
  swansea:'swansea city', preston:'preston north end', 'sheff utd':'sheffield united',
  qpr:'queens park rangers', birmingham:'birmingham city', 'west bromwich':'west bromwich albion',
  cardiff:'cardiff city', 'west ham':'west ham united', wolves:'wolverhampton wanderers',
  huddersfield:'huddersfield town', luton:'luton town', wigan:'wigan athletic',
  mansfield:'mansfield town', northampton:'northampton town', 'oxford utd':'oxford united',
  'man utd':'manchester united', 'man city':'manchester city', 'newcastle':'newcastle united',
  spurs:'tottenham hotspur'
};
const normalize = name => String(name ?? '').toLowerCase().replace(/\s+a?fc$/, '').trim();
const club = name => aliases[normalize(name)] ?? normalize(name);
const day = time => new Intl.DateTimeFormat('sv-SE', {timeZone:'Europe/London'}).format(time);
const pct = value => (value * 100).toFixed(1) + '%';
const output = document.querySelector('#goals-result');
let request = 0;

export async function updateGoals(game) {
  const current = ++request;
  output.textContent = '揀馬會場次後，會檢查有冇對應嘅聯賽賽果。';
  if (!game) return;
  const league = leagues.get(game.tournament?.name_ch);
  if (!league) {
    output.textContent = '呢場未有已接駁嘅聯賽賽果。';
    return;
  }
  const kickoff = new Date(game.kickOffTime);
  const date = day(kickoff);
  const year = Number(date.slice(0,4)) - Number(Number(date.slice(5,7)) < 7);
  const season = year + '-' + String(year + 1).slice(-2);
  output.textContent = '讀取聯賽賽果中…';
  try {
    const response = await fetch('https://raw.githubusercontent.com/openfootball/football.json/master/' +
      season + '/' + league + '.json', {cache:'no-cache', signal:AbortSignal.timeout(12000)});
    if (!response.ok) throw Error();
    const {matches} = await response.json();
    const completed = matches.filter(row => /^\d{4}-\d{2}-\d{2}$/.test(row.date) && row.date < date &&
      row.score?.ft?.length === 2 && row.score.ft.every(goal => Number.isInteger(goal) && goal >= 0));
    const split = (team, side, position) => {
      const games = completed.filter(row => club(row[side]) === club(team));
      if (!games.length) return null;
      const average = index => games.reduce((sum, row) => sum + row.score.ft[index], 0) / games.length;
      return { gf:average(position), ga:average(1-position), n:games.length, last:games.map(row => row.date).sort().at(-1) };
    };
    const home = split(game.homeTeam?.name_en,'team1',0);
    const away = split(game.awayTeam?.name_en,'team2',1);
    if (current !== request) return;
    if (!home || !away) {
      output.textContent = '球隊配對未確認，或主場／作客樣本不足。';
      return;
    }
    const h = (home.gf + away.ga) / 2, a = (away.gf + home.ga) / 2;
    const result = summarize(distribution(h,a));
    output.textContent = [
      'OpenFootball · ' + game.tournament.name_ch + ' · ' + season,
      '主場　入 ' + home.gf.toFixed(2) + '／失 ' + home.ga.toFixed(2) + ' · ' + home.n + ' 場 · 最近 ' + home.last,
      '作客　入 ' + away.gf.toFixed(2) + '／失 ' + away.ga.toFixed(2) + ' · ' + away.n + ' 場 · 最近 ' + away.last,
      '主勝 ' + pct(result.home) + '　和 ' + pct(result.draw) + '　客勝 ' + pct(result.away),
      '大 2.5 ' + pct(result.over) + '　細 2.5 ' + pct(1-result.over),
      '賽果庫可能滯後，模型試算未校準。'
    ].join('\n');
  } catch {
    if (current === request) output.textContent = '暫時讀唔到聯賽賽果，請重新揀場或按 Refresh。';
  }
}
