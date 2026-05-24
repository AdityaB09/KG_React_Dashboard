import { useState } from "react";

export default function WidgetCard({
  title,
  items,
  kind,
  onAdd,
  onSeeAll,
  defaultExpanded = true,
  fullWidth = false
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const briefItems = items.slice(0, fullWidth ? 2 : 3);
  const visibleItems = expanded ? items : briefItems;

  return (
    <section className={`widget-card ${fullWidth ? "full-width" : ""} ${expanded ? "expanded" : "collapsed"}`}>
      <header className="widget-header">
        <button className="widget-title-btn" onClick={() => setExpanded((value) => !value)}>
          <strong>{title}</strong>
          <span>{expanded ? "⌃" : "⌄"}</span>
        </button>
        <button className="add-btn" onClick={onAdd}>+ Add</button>
      </header>

      {expanded && (
        <div className="widget-body">
          {visibleItems.map((item) => (
            <WidgetRow key={item.id} item={item} kind={kind} />
          ))}
        </div>
      )}

      {!expanded && (
        <button className="collapsed-message" onClick={() => setExpanded(true)}>
          Expand {title.toLowerCase()} to view {items.length} items
        </button>
      )}

      <button className="see-all" onClick={onSeeAll}>
        See all {kind === "labs" ? "reports" : kind}
      </button>
    </section>
  );
}

function WidgetRow({ item, kind }) {
  if (kind === "medications") {
    return (
      <article className="widget-row">
        <div className="row-icon">✚</div>
        <div>
          <strong>{item.medication}</strong>
          <p>{item.dose}, {item.frequency}</p>
        </div>
        <span className={`small-pill ${item.status.toLowerCase()}`}>{item.status}</span>
        <span className="chevron">›</span>
      </article>
    );
  }

  if (kind === "labs") {
    return (
      <article className="widget-row">
        <div className="row-icon">□</div>
        <div>
          <strong>{item.title}</strong>
          <p>{item.description}</p>
        </div>
        <span className="row-value">{item.value}</span>
        <span className="chevron">›</span>
      </article>
    );
  }

  return (
    <article className="widget-row">
      <div className="row-icon">▣</div>
      <div>
        <strong>{item.title}</strong>
        <p>{item.type} • {item.owner}</p>
      </div>
      <span className="row-value">{item.date}</span>
      <span className="chevron">›</span>
    </article>
  );
}
