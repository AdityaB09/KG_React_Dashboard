import { useMemo, useState } from "react";

export default function SearchOverlay({
  patients,
  recentSearches,
  initialQuery = "",
  onClose,
  onSelectPatient
}) {
  const [query, setQuery] = useState(initialQuery);

  const matchedPatients = useMemo(() => {
    if (!query.trim()) return patients.slice(0, 4);

    return patients.filter((patient) =>
      `${patient.name} ${patient.mrn} ${patient.unit} ${patient.location}`
        .toLowerCase()
        .includes(query.toLowerCase())
    );
  }, [patients, query]);

  return (
    <div className="search-backdrop" onMouseDown={onClose}>
      <section className="search-panel" onMouseDown={(event) => event.stopPropagation()}>
        <div className="search-input-large">
          <span>⌕</span>
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search patients"
          />
          <button onClick={onClose}>×</button>
        </div>

        <div className="search-section">
          <h3>People</h3>

          {matchedPatients.map((patient) => (
            <button
              key={patient.id}
              className="search-result"
              onClick={() => onSelectPatient(patient.id)}
            >
              <span className="avatar">{patient.avatar}</span>
              <span>
                <strong>{patient.name}</strong>
                <small>MRN: {patient.mrn} • {patient.unit}</small>
              </span>
              <span>›</span>
            </button>
          ))}

          {matchedPatients.length === 0 && (
            <p className="empty-state">No patient found.</p>
          )}
        </div>

        {!query && (
          <div className="search-section">
            <h3>Recent searches</h3>
            {recentSearches.map((item, index) => (
              <div className="search-result passive" key={`${item.title}-${index}`}>
                <span className="row-icon">{item.type[0]}</span>
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.type} • {item.meta}</small>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}