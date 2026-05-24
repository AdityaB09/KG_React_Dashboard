function ECGWave({ offset = 0 }) {
  const points = [
    "0,46", "28,46", "34,42", "40,46", "48,46", "52,16", "57,76", "65,46",
    "92,46", "102,35", "118,46", "145,46", "152,42", "158,46", "166,46",
    "170,18", "176,77", "185,46", "215,46", "226,36", "242,46", "280,46"
  ].join(" ");

  return (
    <svg viewBox="0 0 280 92" className="ecg-wave" role="img" aria-label="ECG waveform">
      <polyline points={points} transform={`translate(${offset} 0)`} />
      <polyline points={points} transform={`translate(${offset - 280} 0)`} />
    </svg>
  );
}

export default function ECGPanel() {
  return (
    <section className="ecg-panel">
      <div className="ecg-header">
        <div>
          <h2>ECG Overview</h2>
          <p>Live rhythm preview</p>
        </div>
        <span className="live-dot">Live</span>
      </div>
      <ECGWave />
      <ECGWave offset={25} />
    </section>
  );
}
