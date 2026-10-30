import { Fragment, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listClimbs, thumbUrl } from "../api/climbs";
import type { ClimbSummary } from "../api/climbs";
import { prefetchWall } from "../api/walls";

import { WALL_ID, WALL_ANGLES } from "../config";

type SortKey = "name" | "date" | "grade" | "rating" | "sends";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "name", label: "Alphabetical" },
  { key: "date", label: "Set date" },
  { key: "grade", label: "Grade" },
  { key: "rating", label: "Rating" },
  { key: "sends", label: "Sends" },
];

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function gradeRank(g: string | null): number {
  if (!g) return -1;
  const n = parseInt(g.replace(/[^0-9]/g, ""), 10);
  return isNaN(n) ? -1 : n;
}

// Ascending comparator for a given key; direction is applied separately.
function cmpAsc(a: ClimbSummary, b: ClimbSummary, key: SortKey): number {
  switch (key) {
    case "name": return a.name.localeCompare(b.name);
    case "date": return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    case "grade": return gradeRank(a.grade) - gradeRank(b.grade);
    case "rating": return (a.rating ?? 0) - (b.rating ?? 0);
    case "sends": return a.send_count - b.send_count;
  }
}

export default function ClimbsList() {
  const navigate = useNavigate();
  const [climbs, setClimbs] = useState<ClimbSummary[] | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("date");          // applied
  const [reverse, setReverse] = useState(false);               // applied
  const [draftSort, setDraftSort] = useState<SortKey>("date"); // staged in the menu
  const [draftReverse, setDraftReverse] = useState(false);
  const [angleFilter, setAngleFilter] = useState<number | null>(null); // its own dropdown
  const [menuOpen, setMenuOpen] = useState(false);
  const [angleMenuOpen, setAngleMenuOpen] = useState(false);

  function openMenu() {
    setDraftSort(sort);        // start the draft from what's currently applied
    setDraftReverse(reverse);
    setMenuOpen(true);
  }
  function applyMenu() {
    setSort(draftSort);        // commit the draft -> this is what re-sorts the list
    setReverse(draftReverse);
    setMenuOpen(false);
  }

  useEffect(() => {
    listClimbs()
      .then(setClimbs)
      .catch((e) => { console.log("load climbs failed", e); setClimbs([]); });
  }, []);

  // Warm the full-res wall photo so opening any individual climb is instant.
  useEffect(() => {
    prefetchWall(WALL_ID).catch(() => {});
  }, []);

  const visible = useMemo(() => {
    if (!climbs) return [];
    const q = query.trim().toLowerCase();
    const list = climbs.filter(
      (c) =>
        (c.name.toLowerCase().includes(q) || (c.setter_name ?? "").toLowerCase().includes(q)) &&
        (angleFilter === null || c.angle === angleFilter)
    );
    // Name sorts A→Z by default; everything else is "most/highest/newest" first.
    const descByDefault = sort !== "name";
    const useDesc = descByDefault !== reverse; // reverse flips the default direction
    return [...list].sort((a, b) => {
      const asc = cmpAsc(a, b, sort);
      return useDesc ? -asc : asc;
    });
  }, [climbs, query, sort, reverse, angleFilter]);

  function selectAngle(a: number | null) {
    setAngleFilter(a);        // single choice -> apply immediately and close
    setAngleMenuOpen(false);
  }

  const activeLabel = SORTS.find((o) => o.key === sort)?.label ?? "Sort";

  return (
    <div className="list-screen">
      <div className="wall-topbar">
        <button className="link-btn" onClick={() => navigate("/home")}>&larr; Home</button>
        <button className="link-btn" onClick={() => navigate("/climbs/new")}>+ New</button>
      </div>

      <div className="list-controls">
        <input
          className="list-search"
          placeholder="Search by climb or setter..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="list-filter-row">
          <div className="sort-wrap">
          <button className="sort-btn" onClick={() => (menuOpen ? setMenuOpen(false) : openMenu())}>
            {activeLabel}{reverse ? " ↑" : " ↓"} ▾
          </button>
          {menuOpen && (
            <>
              <div className="sort-backdrop" onClick={() => setMenuOpen(false)} />
              <div className="sort-menu">
                {SORTS.map((opt) => (
                  <button
                    key={opt.key}
                    className={`sort-opt${draftSort === opt.key ? " active" : ""}`}
                    onClick={() => setDraftSort(opt.key)}
                  >
                    {opt.label}{draftSort === opt.key && <span className="sort-check">✓</span>}
                  </button>
                ))}
                <div className="sort-sep" />
                <button
                  className={`sort-opt${draftReverse ? " active" : ""}`}
                  onClick={() => setDraftReverse((r) => !r)}
                >
                  Reverse order{draftReverse && <span className="sort-check">✓</span>}
                </button>
                <div className="sort-sep" />
                <button className="sort-apply" onClick={applyMenu}>Apply</button>
              </div>
            </>
          )}
          </div>

          <div className="sort-wrap angle-wrap">
            <button className="sort-btn" onClick={() => setAngleMenuOpen((o) => !o)}>
              {angleFilter != null ? `${angleFilter}\u00b0` : "All angles"} ▾
            </button>
            {angleMenuOpen && (
              <>
                <div className="sort-backdrop" onClick={() => setAngleMenuOpen(false)} />
                <div className="sort-menu angle-menu">
                  <button
                    className={`sort-opt${angleFilter === null ? " active" : ""}`}
                    onClick={() => selectAngle(null)}
                  >
                    All angles{angleFilter === null && <span className="sort-check">✓</span>}
                  </button>
                  <div className="sort-sep" />
                  {WALL_ANGLES.map((a) => (
                    <button
                      key={a}
                      className={`sort-opt${angleFilter === a ? " active" : ""}`}
                      onClick={() => selectAngle(a)}
                    >
                      {a}&deg;{angleFilter === a && <span className="sort-check">✓</span>}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="climb-list">
        {climbs === null && <p className="muted center">Loading...</p>}
        {climbs && climbs.length === 0 && <p className="muted center">No climbs yet. Create one.</p>}
        {climbs && climbs.length > 0 && visible.length === 0 && (
          <p className="muted center">No climbs match.</p>
        )}
        {visible.map((c, i) => {
          const showHeader =
            sort === "date" &&
            (i === 0 || new Date(c.created_at).toDateString() !== new Date(visible[i - 1].created_at).toDateString());
          return (
          <Fragment key={c.id}>
            {showHeader && <div className="date-header">{formatDay(c.created_at)}</div>}
            <button className="climb-row" onClick={() => navigate(`/climbs/${c.id}`)}>
              <div className="climb-thumb">
                <img
                  className="climb-thumb-img"
                  src={thumbUrl(c.id, c.thumb_version ?? "0")}
                  loading="lazy"
                  alt=""
                />
              </div>
              <span className="climb-row-main">
                <span className="climb-name">
                  {c.name}
                  {c.sent_by_me && <span className="sent-tick" title="You've sent this"> ✓</span>}
                </span>
                <span className="climb-grade-line">{c.grade || "Ungraded"}{c.angle != null && ` · ${c.angle}\u00b0`}</span>
                <span className="climb-sub">
                  {c.send_count} {c.send_count === 1 ? "send" : "sends"}
                  {c.rating != null && ` · ★ ${c.rating}`}
                </span>
                {c.setter_name && <span className="climb-setter-sub">Set by {c.setter_name}</span>}
              </span>
            </button>
          </Fragment>
          );
        })}
      </div>
    </div>
  );
}
