import { useEffect, useMemo, useState } from "react";
import "./ClinicalPhysiologyPage.css";

const MAX_POINTS = 260;

const BASE_PATIENT = {
  name: "Leslie Abbott",
  sex: "FEMALE",
  dob: "1946-08-22",
  id: "87675858"
};

const MEDICATION_ROWS = [
  {
    med: "Simvastatin",
    sub: "Bedtime",
    dose: "5mg",
    taken: [{ ok: true, time: "20:00" }],
    date: "07/16/25"
  },
  {
    med: "Spironolactone",
    sub: "q12hr",
    dose: "25mg",
    taken: [
      { ok: true, time: "08:00" },
      { ok: false, time: "20:00" }
    ],
    date: "07/16/25"
  },
  {
    med: "Oral Temperature",
    sub: "",
    dose: "37.2",
    warning: true,
    taken: [{ ok: false, time: "20:00" }],
    date: "07/10/25"
  }
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function appendValues(series, values) {
  return [...series.slice(values.length), ...values];
}

function ecgValue(i) {
  const beat = (i * 0.071) % 1;
  let value = 0.52;

  if (beat < 0.035) value = 0.52;
  else if (beat < 0.055) value = 0.72;
  else if (beat < 0.073) value = 0.12;
  else if (beat < 0.095) value = 0.92;
  else if (beat < 0.145) value = 0.42;
  else if (beat < 0.27) value = 0.55;
  else value = 0.5 + Math.sin(i * 0.18) * 0.03;

  const crisisZone = i % MAX_POINTS > 170;
  if (crisisZone) {
    value = 0.5 + Math.sin(i * 0.38) * 0.3 + Math.sin(i * 1.1) * 0.07;
  }

  return clamp(value, 0.08, 0.95);
}

function respValue(i) {
  let value = 0.5 + Math.sin(i * 0.09) * 0.3;

  if (i % MAX_POINTS > 185) {
    value += Math.sin(i * 0.36) * 0.11;
  }

  return clamp(value, 0.1, 0.9);
}

function ppgValue(i, soft = false) {
  const beat = (i * 0.059) % 1;
  let pulse =
    beat < 0.12
      ? Math.sin((beat / 0.12) * Math.PI) * 0.62
      : Math.exp(-beat * 5) * 0.25;

  if (soft) pulse *= 0.62;

  let value = 0.77 - pulse + Math.sin(i * 0.12) * 0.025;

  if (i % MAX_POINTS > 190) {
    value += Math.sin(i * 0.45) * 0.08;
  }

  return clamp(value, 0.08, 0.94);
}

function buildSeries(factory) {
  return Array.from({ length: MAX_POINTS }, (_, index) => factory(index));
}

function createInitialLiveState() {
  return {
    tick: 0,
    heartRate: 160,
    respiratoryRate: 35,
    spo2: 99,
    systolic: 130,
    diastolic: 85,
    temperature: 37.2,
    glucose: 225,
    potassium: 5.4,
    creatinine: 1.42,
    wbc: 12.1,
    ecg: buildSeries(ecgValue),
    resp: buildSeries(respValue),
    ppg: buildSeries((i) => ppgValue(i, false)),
    ppgSoft: buildSeries((i) => ppgValue(i, true)),
    heartTrend: [122, 130, 139, 148, 160],
    respTrend: [18, 21, 24, 29, 35],
    spo2Trend: [97, 98, 97, 99, 99],
    glucoseTrend: [125, 139, 141, 205, 225],
    potassiumTrend: [3.9, 4.2, 4.6, 5.1, 5.4],
    creatinineTrend: [0.89, 0.96, 1.05, 1.23, 1.42],
    wbcTrend: [8.2, 9.1, 10.4, 11.2, 12.1]
  };
}

function nextLiveState(prev) {
  const tick = prev.tick + 1;
  const nextIndexes = [tick * 4, tick * 4 + 1, tick * 4 + 2, tick * 4 + 3];

  const heartRate = Math.round(
    clamp(160 + Math.sin(tick / 4) * 7 + Math.sin(tick / 11) * 4, 146, 174)
  );

  const respiratoryRate = Math.round(
    clamp(35 + Math.sin(tick / 5) * 3 + Math.sin(tick / 13) * 2, 29, 40)
  );

  const spo2 = Math.round(clamp(98.5 + Math.sin(tick / 7) * 1.2, 96, 100));

  const systolic = Math.round(clamp(130 + Math.sin(tick / 8) * 4, 124, 138));
  const diastolic = Math.round(clamp(85 + Math.sin(tick / 9) * 3, 80, 90));
  const temperature = Number(clamp(37.2 + Math.sin(tick / 10) * 0.15, 37.0, 37.5).toFixed(1));

  const glucose = Math.round(clamp(225 + Math.sin(tick / 6) * 9, 214, 238));
  const potassium = Number(clamp(5.4 + Math.sin(tick / 8) * 0.15, 5.2, 5.7).toFixed(1));
  const creatinine = Number(clamp(1.42 + Math.sin(tick / 9) * 0.06, 1.34, 1.52).toFixed(2));
  const wbc = Number(clamp(12.1 + Math.sin(tick / 7) * 0.5, 11.4, 12.9).toFixed(1));

  return {
    ...prev,
    tick,
    heartRate,
    respiratoryRate,
    spo2,
    systolic,
    diastolic,
    temperature,
    glucose,
    potassium,
    creatinine,
    wbc,
    ecg: appendValues(prev.ecg, nextIndexes.map(ecgValue)),
    resp: appendValues(prev.resp, nextIndexes.map(respValue)),
    ppg: appendValues(prev.ppg, nextIndexes.map((i) => ppgValue(i, false))),
    ppgSoft: appendValues(prev.ppgSoft, nextIndexes.map((i) => ppgValue(i, true))),
    heartTrend: appendValues(prev.heartTrend, [heartRate]).slice(-8),
    respTrend: appendValues(prev.respTrend, [respiratoryRate]).slice(-8),
    spo2Trend: appendValues(prev.spo2Trend, [spo2]).slice(-8),
    glucoseTrend: appendValues(prev.glucoseTrend, [glucose]).slice(-8),
    potassiumTrend: appendValues(prev.potassiumTrend, [potassium]).slice(-8),
    creatinineTrend: appendValues(prev.creatinineTrend, [creatinine]).slice(-8),
    wbcTrend: appendValues(prev.wbcTrend, [wbc]).slice(-8)
  };
}

function toPolylineNormalized(values, width, height, padding = 6) {
  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - padding - value * (height - padding * 2);
      return `${x},${clamp(y, padding, height - padding)}`;
    })
    .join(" ");
}

function toPolylineScaled(values, width = 80, height = 34, padding = 4) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - padding - ((value - min) / range) * (height - padding * 2);
      return `${x},${clamp(y, padding, height - padding)}`;
    })
    .join(" ");
}

function WaveChart({ label, color, values, compact = false, currentTime = false }) {
  const width = 620;
  const height = compact ? 42 : 66;

  return (
    <div className={`kgen-wave-card ${compact ? "compact" : ""} ${color}`}>
      {label && <span className={`kgen-wave-label ${color}`}>{label}</span>}
      {currentTime && <span className="kgen-current-time">Current time: 10.50</span>}

      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <polyline points={toPolylineNormalized(values, width, height)} />
      </svg>
    </div>
  );
}

function MiniTrend({ values, color = "red" }) {
  return (
    <svg className={`kgen-mini-trend ${color}`} viewBox="0 0 80 34" preserveAspectRatio="none">
      <polyline points={toPolylineScaled(values)} />
    </svg>
  );
}

function LabTile({ name, value, status, meta, trend }) {
  return (
    <article className="kgen-lab-tile">
      <div className="kgen-lab-title">
        <span>{name}</span>
        <button type="button">›</button>
      </div>

      <strong>{value}</strong>

      <div className="kgen-lab-bottom">
        <small>{status}</small>
        <MiniTrend values={trend} />
        <em>{meta}</em>
      </div>
    </article>
  );
}

export default function ClinicalPhysiologyPage({ patient, onOpenLabs }) {
  const [live, setLive] = useState(createInitialLiveState);

  useEffect(() => {
    const interval = setInterval(() => {
      setLive((prev) => nextLiveState(prev));
    }, 420);

    return () => clearInterval(interval);
  }, []);

  const currentPatient = useMemo(() => {
    if (!patient) return BASE_PATIENT;

    return {
      name: patient.name || BASE_PATIENT.name,
      sex: patient.sex?.toUpperCase?.() || BASE_PATIENT.sex,
      dob: BASE_PATIENT.dob,
      id: patient.mrn || patient.id || BASE_PATIENT.id
    };
  }, [patient]);

  const labCards = [
    {
      name: "Glucose",
      value: live.glucose,
      status: "High/Critical",
      meta: "00/23 07/18",
      trend: live.glucoseTrend
    },
    {
      name: "Potassium",
      value: live.potassium.toFixed(1),
      status: "High/Critical",
      meta: "96/33 07/18",
      trend: live.potassiumTrend
    },
    {
      name: "Creatinine",
      value: live.creatinine.toFixed(2),
      status: "High/Critical",
      meta: "00/23 07/18",
      trend: live.creatinineTrend
    },
    {
      name: "WBC",
      value: live.wbc.toFixed(1),
      status: "High",
      meta: "06/33 07/18",
      trend: live.wbcTrend
    }
  ];

  const vitalRows = [
    ["BP", `${live.systolic}/${live.diastolic}`, "mmHg", "07/16/25"],
    ["SpO2", live.spo2, "%", "07/16/25"],
    ["Oral Temperature", live.temperature.toFixed(1), "°C", "07/10/25"]
  ];

  return (
    <section className="kgen-page">
      <header className="kgen-topbar">
        <div className="kgen-brand-box">
          <div className="kgen-logo">⌁</div>
          <span>KardioGenics</span>
        </div>

        <div className="kgen-patient-box">
          <strong>{currentPatient.name}</strong>
          <span>
            {currentPatient.sex} | DOB: {currentPatient.dob} | ID: {currentPatient.id}
          </span>
        </div>

        <div className="kgen-title-box">
  <span>CLINICAL DASHBOARD (REAL-TIME PHYSIOLOGY MONITOR)</span>
</div>
      </header>

      <main className="kgen-grid">
        <section className="kgen-panel kgen-live-panel">
          <div className="kgen-panel-title-row">
            <h2>01. Live Physiology</h2>
            <span className="kgen-live-pill">● Live dummy stream</span>
          </div>

          <div className="kgen-live-content">
            <div className="kgen-wave-stack">
              <WaveChart label="ECG (RED)" color="red" values={live.ecg} currentTime />
              <WaveChart color="red" values={live.resp} compact />
              <WaveChart label="PPG (BLUE)" color="blue" values={live.ppg} />
              <WaveChart color="blue" values={live.ppgSoft} compact />

              <div className="kgen-time-axis">
                <span>0 mo</span>
                <span>2s</span>
                <span>4s</span>
                <span>6s</span>
                <span>12s</span>
                <span>16s</span>
              </div>
            </div>

            <aside className="kgen-side-vitals">
              <div className="kgen-side-vital">
                <span>Heart Rate</span>
                <strong>{live.heartRate}</strong>
                <MiniTrend values={live.heartTrend} />
              </div>

              <div className="kgen-side-vital">
                <span>Respiratory Rate</span>
                <strong className="blue">{live.respiratoryRate}</strong>
                <MiniTrend color="blue" values={live.respTrend} />
              </div>

              <div className="kgen-side-vital">
                <span>SpO2</span>
                <strong className="blue">{live.spo2}%</strong>
                <MiniTrend color="blue" values={live.spo2Trend} />
              </div>
            </aside>
          </div>
        </section>

        <section className="kgen-panel kgen-labs-panel">
          <h2>03. Recent Lab Results &amp; Trends</h2>

          <div className="kgen-lab-grid">
            {labCards.map((item) => (
              <LabTile key={item.name} {...item} />
            ))}
          </div>

          <div className="kgen-mini-table">
            <span>06/23</span>
            <span>06/28</span>
            <span>07/07</span>
            <span>07/18</span>

            <b>125</b>
            <b>139</b>
            <b>141</b>
            <b>{live.glucose}</b>

            <b>{live.creatinine.toFixed(2)}</b>
            <b>14</b>
            <b>0.89</b>
            <b>{live.potassium.toFixed(1)}</b>
          </div>

          <button className="kgen-blue-btn" type="button" onClick={onOpenLabs}>
            Access full table
          </button>
        </section>

        <section className="kgen-panel kgen-alert-panel">
          <h2>02. Critical Alerts &amp; Interpretation</h2>

          <div className="kgen-alert-box">
            <div className="kgen-alert-icon">!</div>

            <h3>(!) Critical abnormalities detected</h3>

            <p>
              <b>Rhythm:</b> Sinus rhythm with peaked T waves progressing to CRS widening,
              sine wave morphology with loss of P waves, widening, sine-wave morphology with
              loss of P waves, agonal complexes, and ventricular fibrillation.
            </p>

            <p>
              <b>PPG Signal:</b> Normal pulsatile waveform with dicrotic notch, degrading
              amplitude, lasting to sore at ventricular fibrillation onset.
            </p>

            <p>
              <b>Likely Etiology:</b> Hyperkalemic arrest in a patient on spironolactone with
              history of intermittent hyperkalemia, possibly precipitated by drug interaction,
              drug overdose, or recent renal impairment during K+ to lethal levels.
            </p>
          </div>
        </section>

        <section className="kgen-panel kgen-labs-small-panel">
          <h2>03. Recent Lab Results &amp; Trends</h2>

          <div className="kgen-lab-grid small">
            {labCards.slice(0, 2).map((item) => (
              <LabTile key={item.name} {...item} />
            ))}
          </div>

          <button className="kgen-blue-btn" type="button" onClick={onOpenLabs}>
            Access full table
          </button>
        </section>

        <section className="kgen-panel kgen-vitals-panel">
          <h2>04. Vital Signs Log</h2>

          <table className="kgen-table vitals">
            <thead>
              <tr>
                <th>Parameter</th>
                <th>Value</th>
                <th>Unit</th>
                <th>Date</th>
              </tr>
            </thead>

            <tbody>
              {vitalRows.map((row) => (
                <tr key={row[0]}>
                  <td>{row[0]}</td>
                  <td>{row[1]}</td>
                  <td>{row[2]}</td>
                  <td>{row[3]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="kgen-panel kgen-med-panel">
          <h2>05. Medication Adherence</h2>

          <table className="kgen-table meds">
            <thead>
              <tr>
                <th>Med Name</th>
                <th>Dosage</th>
                <th>Not-Taken</th>
                <th>Date</th>
              </tr>
            </thead>

            <tbody>
              {MEDICATION_ROWS.map((row) => (
                <tr key={row.med}>
                  <td>
                    <strong>{row.med}</strong>
                    {row.sub && <small>{row.sub}</small>}
                  </td>

                  <td>
                    {row.warning && <span className="kgen-warning">▲</span>} {row.dose}
                  </td>

                  <td>
                    {row.taken.map((item) => (
                      <div key={`${row.med}-${item.time}`}>
                        <span className={item.ok ? "kgen-ok" : "kgen-no"}>
                          {item.ok ? "✓" : "×"}
                        </span>{" "}
                        {item.time}
                      </div>
                    ))}
                  </td>

                  <td>{row.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>

      <footer className="kgen-footer">
        <span>
          Supervisory Governance | Safety Checks | Compliance | Outcomes: Personalized Care,
          Real-time Decisions, Specialist Level Support
        </span>

        <strong>KardioGenics</strong>
      </footer>
    </section>
  );
}