const { useEffect, useMemo, useState } = React;

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatMonth(value) {
  if (!value) return "Unknown Month";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown Month";
  return date.toLocaleString(undefined, { month: "long", year: "numeric" });
}

function monthSortKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "0000-00";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function shortPreview(text) {
  if (!text) return "";
  const trimmed = String(text).replace(/\s+/g, " ").trim();
  const cutoffMatch = trimmed.match(/^(.*?)(?=\s+Name of Candidate:|$)/i);
  const base = cutoffMatch ? cutoffMatch[1].trim() : trimmed;
  if (base.length <= 120) return base;
  return `${base.slice(0, 117).trim()}...`;
}

function App() {
  const [data, setData] = useState([]);
  const [meta, setMeta] = useState({ count: 0, generatedAt: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [openMonths, setOpenMonths] = useState({});
  const [selectedGroupKey, setSelectedGroupKey] = useState("");
  const [selectedGroupItems, setSelectedGroupItems] = useState([]);
  const [supportYear, setSupportYear] = useState("All");
  const [supportMonth, setSupportMonth] = useState("All");

  const load = async () => {
    try {
      setLoading(true);
      setError("");
      const response = await fetch("/api/po-mails");
      if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
      }
      const payload = await response.json();
      setData(payload.items || []);
      setMeta({
        count: payload.count || 0,
        generatedAt: payload.generatedAt || "",
      });
    } catch (err) {
      setError(err.message || "Failed to load data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return data;
    return data.filter((item) => {
      const haystack = [
        item.subject,
        item.from?.name,
        item.from?.address,
        item.receivedDateTime,
        item.extracted?.candidate_name,
        item.extracted?.email,
        item.extracted?.location,
        item.extracted?.job_location,
        item.extracted?.end_client,
        item.extracted?.rate,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [data, query]);

  const selected = filtered.find((item) => item.id === selectedId);
  const grouped = useMemo(() => {
    const monthBuckets = new Map();
    for (const item of filtered) {
      const monthKey = formatMonth(item.receivedDateTime);
      const sortKey = monthSortKey(item.receivedDateTime);
      if (!monthBuckets.has(monthKey)) {
        monthBuckets.set(monthKey, { sortKey, items: [] });
      }
      monthBuckets.get(monthKey).items.push(item);
    }
    return Array.from(monthBuckets.entries())
      .sort((a, b) => (a[1].sortKey < b[1].sortKey ? 1 : -1))
      .map(([monthLabel, bucket]) => {
        const items = bucket.items;
        const candidateBuckets = new Map();
        for (const item of items) {
          const candidateKey =
            item.extracted?.candidate_name || item.subject || "Untitled";
          if (!candidateBuckets.has(candidateKey)) {
            candidateBuckets.set(candidateKey, []);
          }
          candidateBuckets.get(candidateKey).push(item);
        }
        return {
          monthLabel,
          groups: Array.from(candidateBuckets.entries()).map(
            ([candidateKey, groupItems]) => ({
              key: candidateKey,
              displayName: candidateKey,
              items: groupItems,
            })
          ),
        };
      });
  }, [filtered]);

  const supportCounts = useMemo(() => {
    const counts = new Map();
    for (const item of filtered) {
      const date = new Date(item.receivedDateTime || 0);
      if (!Number.isNaN(date.getTime())) {
        const year = String(date.getFullYear());
        const month = String(date.getMonth() + 1).padStart(2, "0");
        if (supportYear !== "All" && year !== supportYear) continue;
        if (supportMonth !== "All" && month !== supportMonth) continue;
      }
      const name = item.extracted?.interview_support_by || "Unknown";
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
  }, [filtered, supportYear, supportMonth]);

  const supportFilters = useMemo(() => {
    const years = new Set();
    const months = new Set();
    for (const item of filtered) {
      const date = new Date(item.receivedDateTime || 0);
      if (Number.isNaN(date.getTime())) continue;
      years.add(String(date.getFullYear()));
      months.add(String(date.getMonth() + 1).padStart(2, "0"));
    }
    return {
      years: Array.from(years).sort().reverse(),
      months: Array.from(months).sort(),
    };
  }, [filtered]);

  const latestPeriod = useMemo(() => {
    let latest = null;
    for (const item of filtered) {
      const date = new Date(item.receivedDateTime || 0);
      if (Number.isNaN(date.getTime())) continue;
      if (!latest || date > latest) latest = date;
    }
    if (!latest) return { year: "All", month: "All" };
    return {
      year: String(latest.getFullYear()),
      month: String(latest.getMonth() + 1).padStart(2, "0"),
    };
  }, [filtered]);

  useEffect(() => {
    if (supportYear === "All" && latestPeriod.year !== "All") {
      setSupportYear(latestPeriod.year);
    }
    if (supportMonth === "All" && latestPeriod.month !== "All") {
      setSupportMonth(latestPeriod.month);
    }
  }, [latestPeriod, supportYear, supportMonth]);

  const monthLabel = (value) => {
    if (value === "All") return "All Months";
    const date = new Date(`2000-${value}-01T00:00:00Z`);
    return date.toLocaleString(undefined, { month: "long" });
  };

  const supportCandidates = useMemo(() => {
    const buckets = new Map();
    for (const item of filtered) {
      const date = new Date(item.receivedDateTime || 0);
      if (!Number.isNaN(date.getTime())) {
        const year = String(date.getFullYear());
        const month = String(date.getMonth() + 1).padStart(2, "0");
        if (supportYear !== "All" && year !== supportYear) continue;
        if (supportMonth !== "All" && month !== supportMonth) continue;
      }
      const expert = item.extracted?.interview_support_by || "Unknown";
      const candidate = item.extracted?.candidate_name || "Unknown";
      if (!buckets.has(expert)) buckets.set(expert, new Set());
      buckets.get(expert).add(candidate);
    }
    return buckets;
  }, [filtered, supportYear, supportMonth]);

  const latestPerCompany = (items) => {
    const buckets = new Map();
    for (const item of items) {
      const company =
        item.extracted?.end_client ||
        item.extracted?.job_location ||
        "Unknown Company";
      const existing = buckets.get(company);
      if (!existing) {
        buckets.set(company, item);
        continue;
      }
      const a = new Date(existing.receivedDateTime || 0).getTime();
      const b = new Date(item.receivedDateTime || 0).getTime();
      if (b > a) buckets.set(company, item);
    }
    return Array.from(buckets.values()).sort((a, b) => {
      const aDate = new Date(a.receivedDateTime || 0).getTime();
      const bDate = new Date(b.receivedDateTime || 0).getTime();
      return bDate - aDate;
    });
  };

  const toggleMonth = (label) => {
    setOpenMonths((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  return (
    <div>
      <header className="header">
        <div>
          <h1 className="title">Latest PO Mails</h1>
          <div className="subtitle">
            {meta.generatedAt
              ? `Last synced ${formatDate(meta.generatedAt)}`
              : "Waiting for first sync"}
          </div>
        </div>
        <div className="controls">
          <input
            className="search"
            placeholder="Search by candidate, subject, client, rate..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="button" onClick={load} disabled={loading}>
            {loading ? "Loading..." : "Refresh"}
          </button>
          <span className="pill">{filtered.length} results</span>
        </div>
      </header>

      <div className="layout">
        <section className="panel">
          <div className="status">
            {loading && "Fetching latest emails..."}
            {!loading && error && <span className="error">{error}</span>}
            {!loading && !error && meta.count === 0 && "No results found."}
          </div>
          <div className="list">
            {grouped.map(({ monthLabel, groups }) => {
              const isOpen = openMonths[monthLabel];
              return (
                <div key={monthLabel}>
                  <button
                    type="button"
                    className="month-toggle"
                    onClick={() => toggleMonth(monthLabel)}
                  >
                    <span>{monthLabel}</span>
                    <span className="month-count">
                      {groups.reduce((acc, group) => acc + group.items.length, 0)}
                    </span>
                    <span className="month-caret">{isOpen ? "–" : "+"}</span>
                  </button>
                  {isOpen &&
                    groups.map((group) => {
                      const groupKey = `${monthLabel}::${group.key}`;
                      const isActive = groupKey === selectedGroupKey;
                      const deduped = latestPerCompany(group.items);
                      const first = deduped[0];
                      return (
                        <article
                          key={groupKey}
                          className={`list-item ${isActive ? "active" : ""}`}
                          onClick={() =>
                            setSelectedGroupKey((prev) => {
                              if (prev === groupKey) {
                                setSelectedId("");
                                setSelectedGroupItems([]);
                                return "";
                              }
                              setSelectedGroupItems(deduped);
                              setSelectedId(first?.id || "");
                              return groupKey;
                            })
                          }
                        >
                          <h3 className="list-title">
                            {group.displayName}
                          </h3>
                          <div className="list-submeta">
                            <span>
                              Support:{" "}
                              {first?.extracted?.interview_support_by || "-"}
                            </span>
                            <span>TL: {first?.extracted?.team_lead || "-"}</span>
                            <span>Mgr: {first?.extracted?.manager || "-"}</span>
                          </div>
                          <div className="list-meta">
                            <span>{first?.from?.name || "Unknown sender"}</span>
                            <span>{formatDate(first?.receivedDateTime)}</span>
                            <span>POs: {deduped.length}</span>
                            {first?.extracted?.rate && (
                              <span>Rate: {first.extracted.rate}</span>
                            )}
                          </div>
                        </article>
                      );
                    })}
                </div>
              );
            })}
          </div>
        </section>

        <section className="panel details">
          {!selected && (
            <div className="empty">
              Select a message to see PO details.
            </div>
          )}
          {selected && (
            <div>
              <h2 className="list-title">{selected.subject || "PO details"}</h2>
              <div className="list-meta" style={{ marginBottom: "12px" }}>
                <span>{selected.from?.name || "Unknown sender"}</span>
                <span>{selected.from?.address || ""}</span>
                <span>{formatDate(selected.receivedDateTime)}</span>
              </div>
              {selectedGroupItems.length > 1 && (
                <div className="po-group">
                  <div className="po-group-title">
                    Total POs for candidate: {selectedGroupItems.length}
                  </div>
                </div>
              )}
              <div className="detail-stack">
                {(selectedGroupItems.length ? selectedGroupItems : [selected]).map(
                  (item) => (
                    <div key={item.id} className="detail-card">
                      <div className="detail-header">
                        <div className="detail-title">
                          {formatDate(item.receivedDateTime) || "Date unknown"}
                        </div>
                        {item.extracted?.rate && (
                          <div className="detail-pill">
                            Rate: {item.extracted.rate}
                          </div>
                        )}
                      </div>
                      <div className="detail-grid">
                        <div className="field">
                          <label>Candidate</label>
                          <div>{item.extracted?.candidate_name || "-"}</div>
                        </div>
                        <div className="field">
                          <label>Email</label>
                          <div>{item.extracted?.email || "-"}</div>
                        </div>
                        <div className="field">
                          <label>Phone</label>
                          <div>{item.extracted?.phone_number || "-"}</div>
                        </div>
                        <div className="field">
                          <label>Location</label>
                          <div>{item.extracted?.location || "-"}</div>
                        </div>
                        <div className="field">
                          <label>Position</label>
                          <div>{item.extracted?.position_applied || "-"}</div>
                        </div>
                        <div className="field">
                          <label>Job Location</label>
                          <div>{item.extracted?.job_location || "-"}</div>
                        </div>
                        <div className="field">
                          <label>End Client</label>
                          <div>{item.extracted?.end_client || "-"}</div>
                        </div>
                        <div className="field">
                          <label>Rate</label>
                          <div>{item.extracted?.rate || "-"}</div>
                        </div>
                        <div className="field">
                          <label>Interview Support By</label>
                          <div>
                            {item.extracted?.interview_support_by || "-"}
                          </div>
                        </div>
                        <div className="field">
                          <label>Team Lead</label>
                          <div>{item.extracted?.team_lead || "-"}</div>
                        </div>
                        <div className="field">
                          <label>Manager</label>
                          <div>{item.extracted?.manager || "-"}</div>
                        </div>
                        <div className="field">
                          <label>Preview</label>
                          <div>{shortPreview(item.bodyPreview) || "-"}</div>
                        </div>
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>
          )}
        </section>
      </div>
      <div className="support-footer">
        <div className="support-panel support-panel-wide">
          <div className="support-title">Interview Support By</div>
          <div className="support-filters">
            <div className="support-tabs">
              <button
                type="button"
                className={`support-tab ${
                  supportYear === "All" ? "active" : ""
                }`}
                onClick={() => setSupportYear("All")}
              >
                All Years
              </button>
              {supportFilters.years.map((year) => (
                <button
                  key={year}
                  type="button"
                  className={`support-tab ${
                    supportYear === year ? "active" : ""
                  }`}
                  onClick={() => setSupportYear(year)}
                >
                  {year}
                </button>
              ))}
            </div>
            <select
              className="support-select"
              value={supportMonth}
              onChange={(e) => setSupportMonth(e.target.value)}
            >
              <option value="All">All Months</option>
              {supportFilters.months.map((month) => (
                <option key={month} value={month}>
                  {monthLabel(month)}
                </option>
              ))}
            </select>
          </div>
          <div className="support-table-wrap">
            <table className="support-table">
              <thead>
                <tr>
                  <th>Expert</th>
                  <th>Count</th>
                  <th>Candidates</th>
                </tr>
              </thead>
              <tbody>
                {supportCounts.map((row) => (
                  <tr key={row.name}>
                    <td>{row.name}</td>
                    <td>{row.count}</td>
                    <td>
                      <select
                        className="support-select support-select-inline"
                        defaultValue=""
                      >
                        <option value="" disabled>
                          View candidate
                        </option>
                        {Array.from(
                          supportCandidates.get(row.name) || ["Unknown"]
                        ).map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
