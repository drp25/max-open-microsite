import React, { useEffect, useMemo, useState } from 'react'
import logo from './logo.jpeg'

/*
 * This component implements the Max Open microsite with a few new features:
 * - Players can be reordered via drag and drop in a dedicated ranking list.  The
 *   ordering defines their seeding; the first seven players will be placed
 *   into group A while the remainder go into group B.  After reordering the
 *   players you can click “Použít nasazení” to regenerate the group
 *   assignments, schedules and clear all existing match results.
 * - Each match score can be cleared individually.  An “×” button appears
 *   next to every matchup allowing you to reset that particular result
 *   without affecting other matches.
 * - A tournament logo (imported above) is displayed next to the page title.
 */

// Initial list of participants with their original seed (rank) and names.  The
// default ordering reflects the tournament seeding before any adjustments.  When
// the user reorders this list we update the `rank` property of each player to
// match their new position (1 = best seed).  During seeding the first seven
// players go to group A and the rest to group B.
const initialParticipants = [
  { name: 'Marek Vaniš', rank: 1 },
  { name: 'Dušan Maleček', rank: 2 },
  { name: 'Pochy', rank: 3 },
  { name: 'David Kapin', rank: 4 },
  { name: 'Marek Schneider', rank: 5 },
  { name: 'Šimon Opekar', rank: 6 },
  { name: 'David Rys', rank: 7 },
  { name: 'Jakub Mráček', rank: 8 },
  { name: 'Ondřej Holboj', rank: 9 },
  { name: 'Venca Fál', rank: 10 },
  { name: 'Franta Fál', rank: 11 },
  { name: 'Vláďa Tvrdek', rank: 12 },
  { name: 'Martin Klanica', rank: 13 },
]

// Utility to compute a round-robin schedule for a list of teams.  If there
// is an odd number of teams a dummy “VOLNO” entry is added so that each team
// has a bye in one round.  The algorithm rotates all but the first entry
// around the fixed first entry.
function roundRobin(teams) {
  const t = [...teams]
  const BYE = teams.length % 2 === 1 ? { name: 'VOLNO', bye: true } : null
  if (BYE) t.push(BYE)
  const n = t.length
  const rounds = n - 1
  const half = n / 2
  const schedule = []
  for (let r = 0; r < rounds; r++) {
    const pairs = []
    for (let i = 0; i < half; i++) {
      const a = t[i]
      const b = t[n - 1 - i]
      if (a?.bye || b?.bye) continue
      pairs.push([a.name, b.name])
    }
    schedule.push({ round: r + 1, matches: pairs })
    t.splice(1, 0, t.pop()) // rotate all but the first entry
  }
  return schedule
}

// Helpers to build unique identifiers for a match and to initialise blank
// results for a given schedule.  A result entry stores the names of the
// competitors (a and b), the round number and two strings (ag and bg) to
// hold the game scores.  Empty strings denote unset values.
function idFor(group, a, b) {
  return `${group}::${a}__${b}`
}
function emptyResults(schedule, group) {
  const out = {}
  schedule.forEach(({ round, matches }) => {
    matches.forEach(([a, b]) => {
      out[idFor(group, a, b)] = { a, b, round, ag: '', bg: '' }
    })
  })
  return out
}

// Save and load match state to/from localStorage.  We persist only the
// match results keyed by group; we ignore the ranking and seeding because
// recomputing seeds from the ranking is straightforward.  If the stored
// data does not exist or cannot be parsed we return null.
function loadState() {
  try {
    const raw = localStorage.getItem('tenis-microsite-state-v2')
    if (!raw) return null
    return JSON.parse(raw)
  } catch (e) {
    return null
  }
}
function saveState(s) {
  localStorage.setItem('tenis-microsite-state-v2', JSON.stringify(s))
}

// Compute standings given the list of players in a group and the recorded
// results.  The returned array includes each player's name, rank, wins (W),
// losses (L), games for (GF), games against (GA) and game difference (GD).
// Sorting is by W descending, then GD, GF and finally the seeding rank.
function calcStandings(players, resultsForGroup) {
  const table = players.map(p => ({ name: p.name, rank: p.rank, W: 0, L: 0, GF: 0, GA: 0, GD: 0 }))
  const index = Object.fromEntries(table.map((r, i) => [r.name, i]))
  Object.values(resultsForGroup).forEach((m) => {
    if (!m) return
    const { a, b, ag, bg } = m
    const A = index[a], B = index[b]
    const agn = Number(ag), bgn = Number(bg)
    if (Number.isFinite(agn) && Number.isFinite(bgn) && ag !== '' && bg !== '') {
      table[A].GF += agn; table[A].GA += bgn
      table[B].GF += bgn; table[B].GA += agn
      if (agn > bgn) { table[A].W++; table[B].L++ } else if (bgn > agn) { table[B].W++; table[A].L++ }
    }
  })
  table.forEach(r => r.GD = r.GF - r.GA)
  table.sort((x, y) => y.W - x.W || y.GD - x.GD || y.GF - x.GF || x.rank - y.rank)
  return table
}

// Reorder helper: moves an element from one index to another in an array.
function reorder(list, fromIndex, toIndex) {
  const result = [...list]
  const [moved] = result.splice(fromIndex, 1)
  result.splice(toIndex, 0, moved)
  return result
}

export default function App() {
  // Ranking state: an ordered list of participants.  Reordering this list via
  // drag and drop changes each participant's rank value (index + 1).
  const [ranking, setRanking] = useState(() => {
    const sorted = [...initialParticipants].sort((a, b) => a.rank - b.rank)
    return sorted.map((p, i) => ({ ...p, rank: i + 1 }))
  })

  // Groups are derived from the ranking.  The first 7 players go to group A,
  // the remainder to group B.  Each group entry includes updated rank.
  const groupACount = 7
  const [{ playersA, playersB }, setGroups] = useState(() => {
    const A = ranking.slice(0, groupACount).map((p, i) => ({ ...p, rank: i + 1 }))
    const B = ranking.slice(groupACount).map((p, i) => ({ ...p, rank: groupACount + i + 1 }))
    return { playersA: A, playersB: B }
  })

  // Compute schedules whenever players change.  The round-robin algorithm
  // determines the order of matches in each group.
  const scheduleA = useMemo(() => roundRobin(playersA), [playersA])
  const scheduleB = useMemo(() => roundRobin(playersB), [playersB])

  // State for recorded results.  If there is saved data we use it provided
  // the keys match the current schedule; otherwise we start empty.
  const [state, setState] = useState(() => {
    const loaded = loadState()
    if (loaded && loaded.A && loaded.B) return loaded
    return { A: emptyResults(scheduleA, 'A'), B: emptyResults(scheduleB, 'B') }
  })

  // Persist match results whenever they change.  Rankings and seeding are
  // computed on the fly and not stored.
  useEffect(() => {
    saveState(state)
  }, [state])

  // Standings for each group based on current players and results.
  const standingsA = useMemo(() => calcStandings(playersA, state.A), [playersA, state.A])
  const standingsB = useMemo(() => calcStandings(playersB, state.B), [playersB, state.B])

  // Update a single score field for a match.  We store scores as strings
  // because empty values represent an unset score.
  const updateScore = (group, key, field, value) => {
    setState((s) => ({
      ...s,
      [group]: {
        ...s[group],
        [key]: { ...s[group][key], [field]: value }
      }
    }))
  }

  // Reset all results to blank after confirmation.
  const resetAll = () => {
    if (!window.confirm('Smazat všechny výsledky?')) return
    setState({ A: emptyResults(scheduleA, 'A'), B: emptyResults(scheduleB, 'B') })
  }

  // Clear an individual match result.
  const clearMatch = (group, key) => {
    setState((s) => ({
      ...s,
      [group]: {
        ...s[group],
        [key]: { ...s[group][key], ag: '', bg: '' }
      }
    }))
  }

  // Drag and drop handlers for ranking list.
  const [draggedIndex, setDraggedIndex] = useState(null)
  const handleDragStart = (idx) => setDraggedIndex(idx)
  const handleDrop = (idx) => {
    if (draggedIndex === null || draggedIndex === idx) {
      setDraggedIndex(null)
      return
    }
    const reordered = reorder(ranking, draggedIndex, idx)
    // update rank numbers after reordering
    reordered.forEach((p, i) => { p.rank = i + 1 })
    setRanking(reordered)
    setDraggedIndex(null)
  }

  // Apply seeding: split the ranking into two groups and reset schedules
  // and results accordingly.
  const applySeeding = () => {
    const A = ranking.slice(0, groupACount).map((p, i) => ({ ...p, rank: i + 1 }))
    const B = ranking.slice(groupACount).map((p, i) => ({ ...p, rank: groupACount + i + 1 }))
    setGroups({ playersA: A, playersB: B })
    const schedA = roundRobin(A)
    const schedB = roundRobin(B)
    setState({ A: emptyResults(schedA, 'A'), B: emptyResults(schedB, 'B') })
  }

  // Export and import match data.
  const onExport = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'tenis_microsite_data.json'
    a.click()
  }
  const onImport = (e) => {
    const f = e.target.files?.[0]; if (!f) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result)
        if (parsed.A && parsed.B) {
          setState(parsed)
        } else {
          alert('Soubor nemá požadovaný formát.')
        }
      } catch (err) {
        alert('Soubor nelze načíst.')
      }
    }
    reader.readAsText(f)
  }

  // Compose bracket for playoff (top 4 from each group).
  const top4A = standingsA.slice(0, 4).map(r => r.name)
  const top4B = standingsB.slice(0, 4).map(r => r.name)
  const bracket = [
    { label: 'ČF1', a: top4A[0] || '1A', b: top4B[3] || '4B' },
    { label: 'ČF2', a: top4A[1] || '2A', b: top4B[2] || '3B' },
    { label: 'ČF3', a: top4B[0] || '1B', b: top4A[3] || '4A' },
    { label: 'ČF4', a: top4B[1] || '2B', b: top4A[2] || '3A' },
  ]

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header with logo and actions */}
        <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <img src={logo} alt="Logo" className="h-12 w-12 object-contain" />
            <h1 className="text-2xl md:text-3xl font-bold">Max Open – turnajová microsite</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn" onClick={onExport}>Export dat</button>
            <label className="btn cursor-pointer">
              <input type="file" accept="application/json" className="hidden" onChange={onImport} />
              Načíst data
            </label>
            <button className="btn" onClick={resetAll}>Reset výsledků</button>
          </div>
        </header>

        {/* Ranking section: draggable list and seeding button */}
        <div className="card">
          <h2 className="text-xl font-semibold mb-2">Seřazení hráčů (přetáhněte myší)</h2>
          <ul>
            {ranking.map((p, idx) => (
              <li
                key={p.name}
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(idx)}
                className="bg-white rounded-2xl p-2 mb-1 shadow flex justify-between items-center cursor-move"
              >
                <span>{idx + 1}. {p.name}</span>
              </li>
            ))}
          </ul>
          <button className="btn mt-2" onClick={applySeeding}>Použít nasazení</button>
        </div>

        {/* Tabs for schedule, standings and playoff */}
        <Tabs
          tabs={[
            { id: 'rozpis', label: 'Rozpis' },
            { id: 'tabulky', label: 'Tabulky' },
            { id: 'playoff', label: 'Playoff' },
          ]}
        >
          {/* Schedule view */}
          <div data-tab="rozpis" className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              {/* Group A schedule */}
              <div className="card">
                <h2 className="text-xl font-semibold mb-2">Skupina A – rozpis a výsledky</h2>
                {scheduleA.map(({ round, matches }) => (
                  <div key={`A-${round}`} className="mb-3">
                    <div className="text-sm font-semibold text-gray-600 mb-1">Kolo {round}</div>
                    <div className="grid grid-cols-1 gap-2">
                      {matches.map(([a, b]) => {
                        const key = idFor('A', a, b)
                        const rec = state.A[key]
                        return (
                          <div key={key} className="grid grid-cols-12 items-center gap-2 bg-white rounded-2xl p-2 shadow">
                            <div className="col-span-5 text-right pr-2">{a}</div>
                            <div className="col-span-2 text-center">
                              <input inputMode="numeric" pattern="[0-9]*" className="input text-center" placeholder="0" value={rec.ag} onChange={(e) => updateScore('A', key, 'ag', e.target.value)} />
                            </div>
                            <div className="col-span-2 text-center">
                              <input inputMode="numeric" pattern="[0-9]*" className="input text-center" placeholder="0" value={rec.bg} onChange={(e) => updateScore('A', key, 'bg', e.target.value)} />
                            </div>
                            <div className="col-span-3 pl-2 flex justify-between items-center">
                              <span>{b}</span>
                              <button onClick={() => clearMatch('A', key)} className="text-red-500 hover:text-red-700 ml-2">×</button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Group B schedule */}
              <div className="card">
                <h2 className="text-xl font-semibold mb-2">Skupina B – rozpis a výsledky</h2>
                {scheduleB.map(({ round, matches }) => (
                  <div key={`B-${round}`} className="mb-3">
                    <div className="text-sm font-semibold text-gray-600 mb-1">Kolo {round}</div>
                    <div className="grid grid-cols-1 gap-2">
                      {matches.map(([a, b]) => {
                        const key = idFor('B', a, b)
                        const rec = state.B[key]
                        return (
                          <div key={key} className="grid grid-cols-12 items-center gap-2 bg-white rounded-2xl p-2 shadow">
                            <div className="col-span-5 text-right pr-2">{a}</div>
                            <div className="col-span-2 text-center">
                              <input inputMode="numeric" pattern="[0-9]*" className="input text-center" placeholder="0" value={rec.ag} onChange={(e) => updateScore('B', key, 'ag', e.target.value)} />
                            </div>
                            <div className="col-span-2 text-center">
                              <input inputMode="numeric" pattern="[0-9]*" className="input text-center" placeholder="0" value={rec.bg} onChange={(e) => updateScore('B', key, 'bg', e.target.value)} />
                            </div>
                            <div className="col-span-3 pl-2 flex justify-between items-center">
                              <span>{b}</span>
                              <button onClick={() => clearMatch('B', key)} className="text-red-500 hover:text-red-700 ml-2">×</button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="text-xs text-gray-500">Ve skupinách se hraje na 4 vítězné gamy. Zadej skóre jako čísla (např. 4–2). Kliknutím na × vedle zápasu vymažete pouze tento výsledek.</div>
          </div>

          {/* Standings view */}
          <div data-tab="tabulky" className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="card">
                <h2 className="text-xl font-semibold mb-2">Tabulka – Skupina A</h2>
                <Standings data={standingsA} />
              </div>
              <div className="card">
                <h2 className="text-xl font-semibold mb-2">Tabulka – Skupina B</h2>
                <Standings data={standingsB} />
              </div>
            </div>
          </div>

          {/* Playoff view */}
          <div data-tab="playoff" className="space-y-4">
            <div className="card">
              <h2 className="text-xl font-semibold mb-2">Playoff (4 postupují z každé skupiny)</h2>
              <div className="grid md:grid-cols-2 gap-3">
                {bracket.map(m => (
                  <div key={m.label} className="bg-white rounded-2xl p-3 shadow flex items-center justify-between">
                    <span className="font-semibold w-12">{m.label}</span>
                    <span className="text-right flex-1 pr-2">{m.a}</span>
                    <span className="text-gray-500">vs</span>
                    <span className="pl-2 flex-1">{m.b}</span>
                  </div>
                ))}
              </div>
              <p className="text-sm text-gray-600 mt-2">Párování: ČF1 1A–4B, ČF2 2A–3B, ČF3 1B–4A, ČF4 2B–3A.</p>
            </div>
          </div>
        </Tabs>
      </div>
    </div>
  )
}

// Standings component renders a table of results for a given group.
function Standings({ data }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-100">
            <th className="text-left p-2 rounded-l-xl">#</th>
            <th className="text-left p-2">Hráč</th>
            <th className="text-center p-2">W</th>
            <th className="text-center p-2">L</th>
            <th className="text-center p-2">GF</th>
            <th className="text-center p-2">GA</th>
            <th className="text-center p-2 rounded-r-xl">GD</th>
          </tr>
        </thead>
        <tbody>
          {data.map((r, i) => (
            <tr key={r.name} className="odd:bg-white even:bg-gray-50">
              <td className="p-2">{i + 1}</td>
              <td className="p-2">{r.name}</td>
              <td className="text-center p-2">{r.W}</td>
              <td className="text-center p-2">{r.L}</td>
              <td className="text-center p-2">{r.GF}</td>
              <td className="text-center p-2">{r.GA}</td>
              <td className="text-center p-2">{r.GD}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Simple tabs implementation.  We reuse the component from the original
// microsite.  Each child panel must provide a `data-tab` prop matching one
// of the tab ids passed in the `tabs` array.
function Tabs({ tabs, children }) {
  const [active, setActive] = useState(tabs[0]?.id || 'rozpis')
  const panels = React.Children.toArray(children)
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {tabs.map(t => (
          <button key={t.id} className="tab-btn" data-active={active === t.id} onClick={() => setActive(t.id)}>{t.label}</button>
        ))}
      </div>
      {panels.map((p, idx) => {
        if (!React.isValidElement(p)) return null
        return React.cloneElement(p, { hidden: p.props['data-tab'] !== active, key: idx })
      })}
    </div>
  )
}