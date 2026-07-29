import { useEffect, useMemo, useState } from "react";

import { fetchCreatures, loadIndex } from "../adapters/meg/client";
import { combatantFromCreature, searchIndex, type MegIndexEntry } from "../adapters/meg/parse";
import type { Combatant } from "../core/types";

/**
 * Search MEG by name and add what you find.
 *
 * The catalogue is fetched once, on first open, and searched in memory from
 * then on — so typing costs the site nothing (DECISIONS §5). Only pressing Add
 * sends a second request, and only for the template that was picked.
 *
 * GM only. Adding combatants changes the shape of the encounter, which §2.2
 * keeps on the GM's side of the line.
 */

interface Props {
  onAdd: (combatants: Combatant[], problems: string[]) => void;
  onClose: () => void;
}

type Status = "idle" | "loading" | "ready" | "failed";

export function MegSearch({ onAdd, onClose }: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [entries, setEntries] = useState<MegIndexEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [amount, setAmount] = useState(1);
  const [adding, setAdding] = useState<number | null>(null);

  // Fetched on open rather than on mount of the panel: nobody should pay 2.9 MB
  // for opening the tracker, only for opening the importer.
  useEffect(() => {
    let live = true;
    setStatus("loading");

    void loadIndex().then((result) => {
      if (!live) return;
      setEntries(result.entries);
      setError(result.error);
      setStatus(result.entries.length > 0 ? "ready" : "failed");
    });

    return () => {
      live = false;
    };
  }, []);

  const results = useMemo(() => searchIndex(entries, query), [entries, query]);

  const add = async (entry: MegIndexEntry) => {
    setAdding(entry.id);
    const { creatures, problems } = await fetchCreatures(entry.id, amount);

    const combatants: Combatant[] = [];
    const allProblems = [...problems];

    for (const creature of creatures) {
      const { value, problems: creatureProblems } = combatantFromCreature(
        creature,
        crypto.randomUUID(),
      );
      allProblems.push(...creatureProblems);
      if (value) combatants.push(value);
    }

    setAdding(null);
    onAdd(combatants, allProblems);
  };

  return (
    <section className="meg" aria-label="Import from the Mythras Enemy Generator">
      <div className="meg-head">
        <h2>Import from MEG</h2>
        <button type="button" className="ghost" onClick={onClose} aria-label="Close importer">
          ✕
        </button>
      </div>

      {status === "loading" && <p className="meg-note">Loading the catalogue…</p>}

      {status === "failed" && (
        <p className="meg-note meg-error">
          {error ?? "The catalogue could not be loaded."} Search is unavailable until MEG can be
          reached.
        </p>
      )}

      {status === "ready" && (
        <>
          {/* Shown when a stale cache was used because the network failed. */}
          {error && <p className="meg-note meg-error">Using a saved catalogue: {error}</p>}

          <div className="meg-controls">
            <input
              type="search"
              className="meg-query"
              placeholder="Search by name, race or tag"
              aria-label="Search MEG"
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <label className="meg-amount">
              ×
              <input
                type="number"
                min={1}
                max={20}
                value={amount}
                aria-label="How many to roll"
                onChange={(event) => setAmount(Math.max(1, Math.min(20, Number(event.target.value))))}
              />
            </label>
          </div>

          {query.trim() !== "" && results.length === 0 && (
            <p className="meg-note">Nothing matches “{query}”.</p>
          )}

          <ul className="meg-results">
            {results.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  className="meg-result"
                  disabled={adding !== null}
                  onClick={() => void add(entry)}
                >
                  <span className="meg-result-name">{entry.name}</span>
                  <span className="meg-result-meta">
                    {entry.race}
                    {entry.rank > 0 && ` · rank ${entry.rank}`}
                  </span>
                  {/*
                    The owner is shown because everything in MEG was written by
                    somebody. Credit is the least the catalogue is owed.
                  */}
                  {entry.owner && <span className="meg-result-owner">{entry.owner}</span>}
                </button>
              </li>
            ))}
          </ul>

          {adding !== null && <p className="meg-note">Rolling…</p>}
        </>
      )}
    </section>
  );
}
