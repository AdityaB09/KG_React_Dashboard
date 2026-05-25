export default function ECGPanel({ telemetry }) {
  const width = 640;
  const height = 150;

  const points = telemetry.ecg
    .map((point, index) => {
      const x = (index / (telemetry.ecg.length - 1)) * width;
      const y = point.y * height;
      return `${x},${y}`;
    })
    .join(" ");

  const isDanger = telemetry.oxygen < 92 || telemetry.heartRate > 120;

  return (
    <section className={`ecg-panel ${isDanger ? "danger" : ""}`}>
      <div className="ecg-header">
        <div>
          <h2>Live ECG Stream</h2>
          <p>{telemetry.alert}</p>
        </div>

        <span className={`live-dot ${isDanger ? "danger" : ""}`}>
          ● Live
        </span>
      </div>

      <div className="telemetry-grid">
        <div>
          <span>HR</span>
          <strong>{telemetry.heartRate} bpm</strong>
        </div>
        <div>
          <span>SpO₂</span>
          <strong>{telemetry.oxygen}%</strong>
        </div>
        <div>
          <span>BP</span>
          <strong>{telemetry.systolic}/{telemetry.diastolic}</strong>
        </div>
        <div>
          <span>RR</span>
          <strong>{telemetry.respiratoryRate}/min</strong>
        </div>
        <div>
          <span>Temp</span>
          <strong>{telemetry.temperature}°F</strong>
        </div>
      </div>

      <div className="ecg-stream-box">
        <svg viewBox={`0 0 ${width} ${height}`} className="ecg-wave">
          <polyline points={points} />
        </svg>
      </div>
    </section>
  );
}