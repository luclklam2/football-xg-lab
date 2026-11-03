export function distribution(home, away) {
  const poisson = mean => {
    const values = [Math.exp(-mean)];
    for (let i = 1; i <= 50; i++) values.push(values[i - 1] * mean / i);
    return values;
  };
  const awayGoals = poisson(away);
  return poisson(home).flatMap((hp, h) => awayGoals.map((ap, a) => ({ h, a, p: hp * ap })));
}

export function summarize(scores) {
  const result = { home: 0, draw: 0, away: 0, over: 0 };
  for (const { h, a, p } of scores) {
    result[h > a ? 'home' : h === a ? 'draw' : 'away'] += p;
    if (h + a > 2.5) result.over += p;
  }
  return result;
}

export function settle(scores, market, line, odds) {
  const lines = Math.abs(line * 4 % 2) === 1 ? [line - .25, line + .25] : [line];
  let win = 0, loss = 0, push = 0;
  for (const { h, a, p } of scores) {
    for (const part of lines) {
      const margin = {
        over: h + a - part, under: part - h - a,
        home: h - a + part, away: a - h + part
      }[market];
      const stake = p / lines.length;
      if (margin > 0) win += stake;
      else if (margin < 0) loss += stake;
      else push += stake;
    }
  }
  return { win, loss, push, ev: win * (odds - 1) - loss, fair: win ? 1 + loss / win : Infinity };
}

export const columns = 'kickoff,cutoff,hx,ha,ax,aa,hgf,hga,agf,aga,home_goals,away_goals';

export function backtest(csv) {
  const [header, ...rows] = csv.trim().split(/\r?\n/);
  if (header.trim() !== columns || !rows.length) throw Error('CSV 欄名或資料列有誤，請參考樣本。');
  const totals = [[0, 0], [0, 0]];
  const dates = [];
  for (const [index, row] of rows.entries()) {
    const [kickoff, cutoff, ...values] = row.split(',').map(value => value.trim());
    const times = [kickoff, cutoff].map(value => /(?:Z|[+-]\d\d:\d\d)$/.test(value ?? '') ? Date.parse(value) : NaN);
    const numbers = values.map(Number);
    if (!(times[1] < times[0]) || values.length !== 10 ||
        values.some((value, i) => !value || !Number.isFinite(numbers[i]) || numbers[i] < 0 ||
          (i < 8 ? numbers[i] > 10 : !Number.isInteger(numbers[i])))) {
      throw Error('第 ' + (index + 2) + ' 行有無效數值或時間。截數須早於開波。');
    }
    dates.push(times[0]);
    const [hx, ha, ax, aa, hgf, hga, agf, aga, h, a] = numbers;
    const outcome = h > a ? 'home' : h === a ? 'draw' : 'away';
    const models = [[(hgf + aga) / 2, (agf + hga) / 2], [(hx + aa) / 2, (ax + ha) / 2]];
    for (const [i, means] of models.entries()) {
      const result = summarize(distribution(...means));
      for (const side of ['home', 'draw', 'away']) totals[i][0] += (result[side] - Number(side === outcome)) ** 2;
      totals[i][1] += (result.over - Number(h + a > 2.5)) ** 2;
    }
  }
  dates.sort((a, b) => a - b);
  return { count: rows.length, first: dates[0], last: dates.at(-1),
    scores: totals.map(model => model.map(score => score / rows.length)) };
}
