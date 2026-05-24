import { useMemo } from "react";

export default function SearchOverlay({
  patients,
  recentSearches,
  query,
  setQuery,
  onClose,
  onSelectPatient
}) {
  const matchedPatients = useMemo(() => {
    if (!query.trim()) return patients.slice(0, 4);

    return patients.filter((patient) =>
      `${patient.name} ${patient.mrn} ${patient.unit} ${patient.location}`
        .toLowerCase()
        .includes(query.toLowerCase())
    );
  }, [patients, query]);

  return (
    <div className="search-dropdown">
      <div className="search-dropdown-input">
        <span>⌕</span>
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="What are you looking for?"
        />
        <button onClick={onClose}>×</button>
      </div>

      <div className="search-dropdown-list">
        <h3>People</h3>

        {matchedPatients.map((patient) => (
          <button
            key={patient.id}
            className="dropdown-result"
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

        {!query && (
          <>
            <h3>Recent searches</h3>
            {recentSearches.slice(0, 5).map((item, index) => (
              <div className="dropdown-result passive" key={`${item.title}-${index}`}>
                <span className="row-icon">{item.type[0]}</span>
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.type} • {item.meta}</small>
                </span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}