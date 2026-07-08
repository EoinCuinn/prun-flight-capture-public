// Station Keplerian fitting: ANT refit + MOR + BEN
// CSV x,y,z in km. a_m in km. Clockwise: theta = theta_peri - nu

const fs = require('fs');

function solveKepler(M, e) {
  M = ((M % (2*Math.PI)) + 2*Math.PI) % (2*Math.PI);
  let E = M;
  for (let i = 0; i < 100; i++) {
    const dE = (M - E + e*Math.sin(E)) / (1 - e*Math.cos(E));
    E += dE;
    if (Math.abs(dE) < 1e-12) break;
  }
  return E;
}

function modelXYZ_km(a, e, n, t_peri, theta_peri, t) {
  const M = n * (t - t_peri);
  const E = solveKepler(M, e);
  const sqep = Math.sqrt(1+e), sqem = Math.sqrt(1-e);
  const nu = 2 * Math.atan2(sqep*Math.sin(E/2), sqem*Math.cos(E/2));
  const r = a * (1 - e*Math.cos(E));
  const theta = theta_peri - nu;
  return { x: r*Math.cos(theta), y: r*Math.sin(theta) };
}

function fitQuality(rows, a, e, n, t_peri, theta_peri) {
  const errs = rows.map(row => {
    const p = modelXYZ_km(a, e, n, t_peri, theta_peri, row.t_s);
    return Math.sqrt((p.x-row.x_km)**2 + (p.y-row.y_km)**2);
  }).sort((a,b)=>a-b);
  return {
    mean: errs.reduce((s,v)=>s+v)/errs.length,
    p90: errs[Math.floor(errs.length*0.90)],
    p95: errs[Math.floor(errs.length*0.95)],
    max: errs[errs.length-1],
    n: errs.length
  };
}

// Analytical linear regression: phi vs t gives n and phase offset.
// Unwrap atan2(y,x) angles, then fit phi(t) = theta_peri - n*(t - t_ref) for circular orbit.
// Returns {n, theta_peri} with t_peri = t_ref.
function analyticalFit(rows) {
  const sorted = [...rows].sort((a,b) => a.t_s - b.t_s);
  const t_ref = sorted[Math.floor(sorted.length/2)].t_s;

  // Build unwrapped angles
  const angles = [Math.atan2(sorted[0].y_km, sorted[0].x_km)];
  for(let i=1;i<sorted.length;i++){
    let dth = Math.atan2(sorted[i].y_km, sorted[i].x_km) - angles[i-1];
    while(dth > Math.PI) dth -= 2*Math.PI;
    while(dth < -Math.PI) dth += 2*Math.PI;
    angles.push(angles[i-1]+dth);
  }

  // Relative time: t_i - t_ref
  const dt = sorted.map(r => r.t_s - t_ref);
  const phi = angles;

  // Linear regression: phi = theta_peri - n*dt
  // => phi = theta_peri + n*(-dt)
  // Design matrix: [1, -dt]
  const N = dt.length;
  let s1=0, s2=0, s3=0, s4=0, s5=0;
  for(let i=0;i<N;i++){
    const x1 = 1, x2 = -dt[i];
    s1 += x1*x1; s2 += x1*x2; s3 += x2*x2;
    s4 += x1*phi[i]; s5 += x2*phi[i];
  }
  // Solve 2x2: [s1 s2; s2 s3] * [tp; n] = [s4; s5]
  const det = s1*s3 - s2*s2;
  const theta_peri = (s3*s4 - s2*s5) / det;
  const n_signed   = (s1*s5 - s2*s4) / det;
  return { n: Math.abs(n_signed), theta_peri, t_peri: t_ref };
}

// Fine grid search over (n, theta_peri) with t_peri fixed
function gridNTheta(rows, a, e, t_peri,
  n_center, n_range, n_steps,
  thp_center, thp_range, thp_steps) {
  let best = Infinity, best_n, best_thp;
  for(let ni=0;ni<=n_steps;ni++){
    const n = n_center + (ni/n_steps-0.5)*2*n_range;
    for(let thi=0;thi<=thp_steps;thi++){
      const thp = thp_center + (thi/thp_steps-0.5)*2*thp_range;
      const q = fitQuality(rows, a, e, n, t_peri, thp);
      if(q.mean < best){ best=q.mean; best_n=n; best_thp=thp; }
    }
  }
  return { n: best_n, theta_peri: best_thp, mean: best };
}

function angularCoverage(rows, n, t_peri, theta_peri, e) {
  const angles = rows.map(row => {
    const M = n*(row.t_s-t_peri);
    const E = solveKepler(M, e);
    const nu = 2*Math.atan2(Math.sqrt(1+e)*Math.sin(E/2), Math.sqrt(1-e)*Math.cos(E/2));
    return ((theta_peri-nu)%(2*Math.PI)+2*Math.PI)%(2*Math.PI);
  }).sort((a,b)=>a-b);
  let maxGap = 0;
  for(let i=0;i<angles.length;i++){
    const gap = i+1<angles.length ? angles[i+1]-angles[i] : 2*Math.PI-angles[angles.length-1]+angles[0];
    if(gap>maxGap) maxGap=gap;
  }
  return Math.round((1-maxGap/(2*Math.PI))*100);
}

const lines = fs.readFileSync('captures/extracted_positions.csv','utf8').split('\n');
const headers = lines[0].split(',');
const col = h => headers.indexOf(h);
const iId=col('naturalId'), iTs=col('timestamp_ms'), iX=col('x'), iY=col('y');

function loadRows(naturalId) {
  return lines.slice(1)
    .filter(l => l.split(',')[iId] === naturalId)
    .map(l => {
      const p = l.split(',');
      return { t_s: parseFloat(p[iTs])/1000, x_km: parseFloat(p[iX]), y_km: parseFloat(p[iY]) };
    })
    .filter(r => !isNaN(r.x_km) && !isNaN(r.y_km));
}

// ── ANT refit ────────────────────────────────────────────────────────────────
console.log('=== ANT refit (a_m = 33603417 km) ===');
const ANT_rows = loadRows('ANT');
const ANT_a = 33603417, ANT_e = 0.00144911481704531;
const r_ant = ANT_rows.map(r=>Math.sqrt(r.x_km**2+r.y_km**2));
console.log(`Samples: ${ANT_rows.length}`);
console.log(`Observed r_min: ${Math.min(...r_ant).toFixed(0)} km  r_max: ${Math.max(...r_ant).toFixed(0)} km`);
console.log(`FIO r_peri: ${(ANT_a*(1-ANT_e)).toFixed(0)} km  r_apo: ${(ANT_a*(1+ANT_e)).toFixed(0)} km`);

// Analytical linear fit first
const ant0 = analyticalFit(ANT_rows);
const ant0_q = fitQuality(ANT_rows, ANT_a, ANT_e, ant0.n, ant0.t_peri, ant0.theta_peri);
console.log(`Linear fit: n=${ant0.n.toExponential(6)}, T=${(2*Math.PI/ant0.n/86400).toFixed(2)} days, theta_peri=${ant0.theta_peri.toFixed(6)}`);
console.log(`Linear mean: ${ant0_q.mean.toFixed(2)} km`);

// Refine with grid search around analytical result
let antR = gridNTheta(ANT_rows, ANT_a, ANT_e, ant0.t_peri,
  ant0.n, ant0.n*0.002, 30, ant0.theta_peri, 0.05, 40);
antR = gridNTheta(ANT_rows, ANT_a, ANT_e, ant0.t_peri,
  antR.n, antR.n*0.0002, 30, antR.theta_peri, 0.005, 40);
antR = gridNTheta(ANT_rows, ANT_a, ANT_e, ant0.t_peri,
  antR.n, antR.n*0.00002, 20, antR.theta_peri, 0.0005, 30);
antR = gridNTheta(ANT_rows, ANT_a, ANT_e, ant0.t_peri,
  antR.n, antR.n*0.000002, 20, antR.theta_peri, 0.00005, 20);

const ant_q = fitQuality(ANT_rows, ANT_a, ANT_e, antR.n, ant0.t_peri, antR.theta_peri);
const ant_cov = angularCoverage(ANT_rows, antR.n, ant0.t_peri, antR.theta_peri, ANT_e);
console.log(`n=${antR.n.toExponential(10)}, t_peri=${ant0.t_peri.toFixed(3)}, theta_peri=${antR.theta_peri.toFixed(10)}`);
console.log(`Mean: ${ant_q.mean.toFixed(2)} km | p90: ${ant_q.p90.toFixed(2)} | p95: ${ant_q.p95.toFixed(2)} | max: ${ant_q.max.toFixed(2)} | coverage: ${ant_cov}%`);

// ── MOR ───────────────────────────────────────────────────────────────────────
console.log('\n=== MOR (Moria Station, OT-580) ===');
const MOR_a = 198222970002.51038/1000, MOR_e = 0.01901245158584988;
const MOR_rows = loadRows('MOR');
const r_mor = MOR_rows.map(r=>Math.sqrt(r.x_km**2+r.y_km**2));
console.log(`Samples: ${MOR_rows.length}`);
console.log(`FIO r_peri: ${(MOR_a*(1-MOR_e)).toFixed(0)} km  r_apo: ${(MOR_a*(1+MOR_e)).toFixed(0)} km`);
console.log(`Observed r_min: ${Math.min(...r_mor).toFixed(0)} km  r_max: ${Math.max(...r_mor).toFixed(0)} km`);

const mor0 = analyticalFit(MOR_rows);
const mor0_q = fitQuality(MOR_rows, MOR_a, MOR_e, mor0.n, mor0.t_peri, mor0.theta_peri);
console.log(`Linear fit: n=${mor0.n.toExponential(6)}, T=${(2*Math.PI/mor0.n/86400).toFixed(1)} days  mean: ${mor0_q.mean.toFixed(0)} km`);

let morR = gridNTheta(MOR_rows, MOR_a, MOR_e, mor0.t_peri,
  mor0.n, mor0.n*0.01, 40, mor0.theta_peri, 0.3, 40);
morR = gridNTheta(MOR_rows, MOR_a, MOR_e, mor0.t_peri,
  morR.n, morR.n*0.001, 30, morR.theta_peri, 0.03, 30);
morR = gridNTheta(MOR_rows, MOR_a, MOR_e, mor0.t_peri,
  morR.n, morR.n*0.0001, 20, morR.theta_peri, 0.003, 20);
morR = gridNTheta(MOR_rows, MOR_a, MOR_e, mor0.t_peri,
  morR.n, morR.n*0.00001, 20, morR.theta_peri, 0.0003, 20);

const mor_q = fitQuality(MOR_rows, MOR_a, MOR_e, morR.n, mor0.t_peri, morR.theta_peri);
const mor_cov = angularCoverage(MOR_rows, morR.n, mor0.t_peri, morR.theta_peri, MOR_e);
const MOR_T = 2*Math.PI/morR.n;
console.log(`n=${morR.n.toExponential(10)}, t_peri=${mor0.t_peri.toFixed(3)}, theta_peri=${morR.theta_peri.toFixed(10)}`);
console.log(`Mean: ${mor_q.mean.toFixed(2)} km | p90: ${mor_q.p90.toFixed(2)} | p95: ${mor_q.p95.toFixed(2)} | max: ${mor_q.max.toFixed(2)} | coverage: ${mor_cov}%  T=${(MOR_T/86400).toFixed(1)} days`);

// ── BEN ───────────────────────────────────────────────────────────────────────
console.log('\n=== BEN (Benten Station, UV-351) ===');
const BEN_a = 538758343000.9554/1000, BEN_e = 0.03847905804747719;
const BEN_rows = loadRows('BEN');
const r_ben = BEN_rows.map(r=>Math.sqrt(r.x_km**2+r.y_km**2));
console.log(`Samples: ${BEN_rows.length}`);
console.log(`FIO r_peri: ${(BEN_a*(1-BEN_e)).toFixed(0)} km  r_apo: ${(BEN_a*(1+BEN_e)).toFixed(0)} km`);
console.log(`Observed r_min: ${Math.min(...r_ben).toFixed(0)} km  r_max: ${Math.max(...r_ben).toFixed(0)} km`);

const ben0 = analyticalFit(BEN_rows);
const ben0_q = fitQuality(BEN_rows, BEN_a, BEN_e, ben0.n, ben0.t_peri, ben0.theta_peri);
console.log(`Linear fit: n=${ben0.n.toExponential(6)}, T=${(2*Math.PI/ben0.n/86400).toFixed(1)} days  mean: ${ben0_q.mean.toFixed(0)} km`);

let benR = gridNTheta(BEN_rows, BEN_a, BEN_e, ben0.t_peri,
  ben0.n, ben0.n*0.05, 40, ben0.theta_peri, 0.3, 40);
benR = gridNTheta(BEN_rows, BEN_a, BEN_e, ben0.t_peri,
  benR.n, benR.n*0.005, 30, benR.theta_peri, 0.05, 30);
benR = gridNTheta(BEN_rows, BEN_a, BEN_e, ben0.t_peri,
  benR.n, benR.n*0.0005, 20, benR.theta_peri, 0.005, 20);
benR = gridNTheta(BEN_rows, BEN_a, BEN_e, ben0.t_peri,
  benR.n, benR.n*0.00005, 20, benR.theta_peri, 0.0005, 20);

const ben_q = fitQuality(BEN_rows, BEN_a, BEN_e, benR.n, ben0.t_peri, benR.theta_peri);
const ben_cov = angularCoverage(BEN_rows, benR.n, ben0.t_peri, benR.theta_peri, BEN_e);
const BEN_T = 2*Math.PI/benR.n;
console.log(`n=${benR.n.toExponential(10)}, t_peri=${ben0.t_peri.toFixed(3)}, theta_peri=${benR.theta_peri.toFixed(10)}`);
console.log(`Mean: ${ben_q.mean.toFixed(2)} km | p90: ${ben_q.p90.toFixed(2)} | p95: ${ben_q.p95.toFixed(2)} | max: ${ben_q.max.toFixed(2)} | coverage: ${ben_cov}%  T=${(BEN_T/86400).toFixed(1)} days`);

// ── JSON ─────────────────────────────────────────────────────────────────────
console.log('\n=== Proposed JSON entries ===');
console.log(JSON.stringify({
  ANT: {
    naturalId:'ANT', sysId:'8ecf9670ba070d78cfb5537e8d9f1b6c', name:'Antares Station',
    a_m: ANT_a, e: ANT_e,
    n_rad_s: antR.n,
    t_peri_s: parseFloat(ant0.t_peri.toFixed(3)),
    theta_peri_rad: parseFloat(antR.theta_peri.toFixed(10)),
    _note: `Keplerian refit a_m=33603417km. ${ant_q.n} samples, ${ant_cov}% coverage. Analytical linear fit + nonlinear refinement. Mean ${ant_q.mean.toFixed(2)} km, p95 ${ant_q.p95.toFixed(2)} km, max ${ant_q.max.toFixed(2)} km. Fitted 2026-06-29.`,
  },
  MOR: {
    naturalId:'MOR', sysId:'49b6615d39ccba05752b3be77b2ebf36', name:'Moria Station',
    a_m: parseFloat(MOR_a.toFixed(0)), e: MOR_e,
    n_rad_s: morR.n,
    t_peri_s: parseFloat(mor0.t_peri.toFixed(3)),
    theta_peri_rad: parseFloat(morR.theta_peri.toFixed(10)),
    _note: `Keplerian fit ${mor_q.n} samples, ${mor_cov}% coverage (3.3 days/${(MOR_T/86400).toFixed(1)}-day period). Analytical + nonlinear. Mean ${mor_q.mean.toFixed(2)} km, p95 ${mor_q.p95.toFixed(2)} km, max ${mor_q.max.toFixed(2)} km. More data needed. Fitted 2026-06-29.`,
  },
  BEN: {
    naturalId:'BEN', sysId:'92029ff27c1abe932bd2c61ee4c492c7', name:'Benten Station',
    a_m: parseFloat(BEN_a.toFixed(0)), e: BEN_e,
    n_rad_s: benR.n,
    t_peri_s: parseFloat(ben0.t_peri.toFixed(3)),
    theta_peri_rad: parseFloat(benR.theta_peri.toFixed(10)),
    _note: `Keplerian fit ${ben_q.n} samples, ${ben_cov}% coverage (3.0 days/${(BEN_T/86400).toFixed(1)}-day period). Analytical + nonlinear. Mean ${ben_q.mean.toFixed(2)} km, p95 ${ben_q.p95.toFixed(2)} km, max ${ben_q.max.toFixed(2)} km. More data needed. Fitted 2026-06-29.`,
  },
}, null, 2));
