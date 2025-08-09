import React, { useEffect, useMemo, useState } from 'react'
// Import the tournament logo from the source folder.  Vite will copy this asset
// into the build and provide a hashed URL for it.  Using the imported
// variable ensures the compiled code references the correct file.
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
  // Corrected spelling of Vláďa Tvrdek
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
    // Use a new storage key (v3) to ensure any incompatible saved data from
    // previous versions does not cause runtime errors.  If no state exists
    // under this key, the site will initialise fresh results.
    const raw = localStorage.getItem('tenis-microsite-state-v3')
    if (!raw) return null
    return JSON.parse(raw)
  } catch (e) {
    return null
  }
}
function saveState(s) {
  localStorage.setItem('tenis-microsite-state-v3', JSON.stringify(s))
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
    // If either player is not part of the current standings table (e.g. leftover
    // results from a previous seeding), skip this match entirely.  Without
    // this guard an undefined index would cause a runtime error when
    // accessing table[A] or table[B].
    if (A === undefined || B === undefined) return
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
  // State controlling which algorithm is used to split the ranking into two groups.
  // "had" applies the snake algorithm (pairs alternate A/B,B/A), while "prumer"
  // assigns the first half of players to group A and the remainder to group B.
  const [seedingAlgo, setSeedingAlgo] = useState('had')
  // Ranking state: an ordered list of participants.  Reordering this list via
  // drag and drop changes each participant's rank value (index + 1).
  const [ranking, setRanking] = useState(() => {
    const sorted = [...initialParticipants].sort((a, b) => a.rank - b.rank)
    return sorted.map((p, i) => ({ ...p, rank: i + 1 }))
  })

  // Helper to split the ranking into two groups using a "snake" seeding algorithm.
  // Players are paired, and the first pair is assigned A/B, the next pair B/A, etc.
  // This balances the average strength of each group.  Each entry includes
  // an updated rank equal to its index+1 in the ranking.
  const splitSnake = (list) => {
    const A = []
    const B = []
    list.forEach((p, idx) => {
      const pair = Math.floor(idx / 2)
      const evenPair = pair % 2 === 0
      if (evenPair) {
        if (idx % 2 === 0) {
          A.push({ ...p, rank: idx + 1 })
        } else {
          B.push({ ...p, rank: idx + 1 })
        }
      } else {
        if (idx % 2 === 0) {
          B.push({ ...p, rank: idx + 1 })
        } else {
          A.push({ ...p, rank: idx + 1 })
        }
      }
    })
    return { A, B }
  }

  // Split players into groups using the selected algorithm.  When "had" is
  // chosen we call splitSnake; otherwise we place the first half of players
  // into group A and the remainder into group B.  Ranks are updated to match
  // the current order.
  const splitGroups = (list, algo) => {
    if (algo === 'had') {
      return splitSnake(list)
    } else {
      const half = Math.ceil(list.length / 2)
      const A = []
      const B = []
      list.forEach((p, idx) => {
        const newRank = idx + 1
        if (idx < half) {
          A.push({ ...p, rank: newRank })
        } else {
          B.push({ ...p, rank: newRank })
        }
      })
      return { A, B }
    }
  }

  // Groups are derived from the ranking using the snake seeding algorithm above.
  const [{ playersA, playersB }, setGroups] = useState(() => {
    // By default use the snake algorithm on initial load.  Subsequent seeding
    // operations will respect the selected algorithm via applySeeding().
    const { A, B } = splitSnake(ranking)
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

  // Password protection for editing match results.  When `auth` is false, score
  // inputs and clear buttons are disabled.  The `password` state holds the
  // current user input; when it matches the hard-coded secret the user is
  // authenticated and can edit results.
  const [password, setPassword] = useState('')
  const [auth, setAuth] = useState(false)
  const handleAuth = () => {
    if (password === 'tottowolf') {
      setAuth(true)
      setPassword('')
    } else {
      alert('Nesprávné heslo!')
    }
  }

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

  // Reset all results to blank after confirmation.  Only allowed when
  // authenticated via the password.  Attempting to reset without
  // authentication will show an alert.
  const resetAll = () => {
    if (!auth) {
      alert('Pro reset výsledků musíte zadat správné heslo a odemknout úpravy.')
      return
    }
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


  // Ranking editing helpers.  On mobile devices drag and drop is not
  // available, so provide explicit controls to move players up or down,
  // rename a player or remove them entirely.  After any change we recompute
  // rank numbers so that `rank` reflects the new ordering (1 = highest seed).
  const renamePlayer = (idx, newName) => {
    setRanking(list => {
      const out = [...list]
      out[idx] = { ...out[idx], name: newName }
      return out
    })
  }
  const deletePlayer = (idx) => {
    if (!window.confirm('Opravdu odstranit hráče?')) return
    setRanking(list => {
      const out = [...list]
      out.splice(idx, 1)
      return out.map((p, i) => ({ ...p, rank: i + 1 }))
    })
  }
  const moveUp = (idx) => {
    if (idx <= 0) return
    setRanking(list => {
      const out = reorder(list, idx, idx - 1)
      out.forEach((p, i) => { p.rank = i + 1 })
      return out
    })
  }
  const moveDown = (idx) => {
    setRanking(list => {
      if (idx >= list.length - 1) return list
      const out = reorder(list, idx, idx + 1)
      out.forEach((p, i) => { p.rank = i + 1 })
      return out
    })
  }

  // Add a new player to the ranking.  A default name is generated and names
  // are ensured to be unique.  After insertion the rank numbers are updated.
  const addPlayer = () => {
    setRanking(list => {
      const names = list.map(p => p.name)
      const base = 'Nový hráč'
      let count = 1
      let candidate = base
      // If the base name already exists, append a number until unique
      while (names.includes(candidate)) {
        count++
        candidate = `${base} ${count}`
      }
      const newList = [...list, { name: candidate, rank: list.length + 1 }]
      // Update ranks sequentially
      return newList.map((p, i) => ({ ...p, rank: i + 1 }))
    })
  }

  // Apply seeding: split the ranking into two groups and reset schedules
  // and results accordingly.
  const applySeeding = () => {
    // Compute new groups using the selected seeding algorithm
    const { A, B } = splitGroups(ranking, seedingAlgo)
    setGroups({ playersA: A, playersB: B })
    const schedA = roundRobin(A)
    const schedB = roundRobin(B)
    // Reset all match results when reseeding
    setState({ A: emptyResults(schedA, 'A'), B: emptyResults(schedB, 'B') })
  }

  /*
   * Export and import functions have been removed.  Previously, these allowed
   * users to download or upload tournament data manually.  Persistence is
   * now handled automatically via localStorage.
   */

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
                {/* Use the imported logo asset.  Vite will replace this with the correct hashed URL. */}
                <img src={logo} alt="Logo" className="h-12 w-12 object-contain" />
                {/* Remove the word "turnajová" from the title per user request */}
                <h1 className="text-2xl md:text-3xl font-bold">Max Open – microsite</h1>
              </div>
          <div className="flex flex-wrap items-center gap-3">
            {/* Reset button is disabled when the user is not authenticated */}
            <button className="btn" onClick={resetAll} disabled={!auth}>Reset výsledků</button>
            {!auth ? (
              <span className="flex items-center gap-2">
                <input type="password" className="input w-32" placeholder="Heslo" value={password} onChange={(e) => setPassword(e.target.value)} />
                <button className="btn" onClick={handleAuth}>Odemknout</button>
              </span>
            ) : (
              <button className="btn" onClick={() => setAuth(false)}>Zamknout úpravy</button>
            )}
          </div>
        </header>

        {/* The ranking editor and seeding controls are moved to a dedicated "Nasazení" tab below */}

        {/* Tabs for seeding, schedule, standings and playoff */}
        <Tabs
          tabs={[
            { id: 'nasazeni', label: 'Nasazení' },
            { id: 'rozpis', label: 'Rozpis' },
            { id: 'tabulky', label: 'Tabulky' },
            { id: 'playoff', label: 'Playoff' },
          ]}
        >
          {/* Nasazení view: ranking editor and seeding configuration */}
          <div data-tab="nasazeni" className="space-y-4">
            <div className="card">
              <h2 className="text-xl font-semibold mb-2">Nasazení do skupin</h2>
              <p className="text-sm text-gray-600 mb-3">
                Seřaďte hráče podle aktuální výkonnosti a poté klikněte na&nbsp;
                „Použít nasazení“. Skupiny lze vytvořit dvěma způsoby:&nbsp;
                <strong>had</strong> – párové procházení seznamem střídavě A/B,B/A,
                nebo&nbsp;<strong>průměr rankingu</strong> – první polovina hráčů jde do skupiny&nbsp;A
                a zbytek do skupiny&nbsp;B. Níže můžete zvolit algoritmus.
              </p>
              <div className="flex items-center gap-2 mb-3">
                <label className="text-sm">Algoritmus:</label>
                <select
                  value={seedingAlgo}
                  onChange={(e) => setSeedingAlgo(e.target.value)}
                  className="input w-40"
                >
                  <option value="had">had</option>
                  <option value="prumer">průměr rankingu</option>
                </select>
              </div>
              <ul>
                {ranking.map((p, idx) => (
                  <li
                    key={p.name}
                    className="bg-white rounded-2xl p-2 mb-1 shadow flex items-center gap-2"
                  >
                    <span className="w-6 text-right text-sm">{idx + 1}.</span>
                    <input
                      type="text"
                      value={p.name}
                      onChange={(e) => renamePlayer(idx, e.target.value)}
                      className="flex-1 input py-1 px-2 text-sm"
                      disabled={!auth}
                    />
                    <div className="flex items-center gap-1">
                      <button
                        className="btn px-2 py-1 text-sm"
                        onClick={() => moveUp(idx)}
                        disabled={!auth || idx === 0}
                        title="Posun nahoru"
                      >▲</button>
                      <button
                        className="btn px-2 py-1 text-sm"
                        onClick={() => moveDown(idx)}
                        disabled={!auth || idx === ranking.length - 1}
                        title="Posun dolů"
                      >▼</button>
                      <button
                        className="btn px-2 py-1 text-sm text-red-600"
                        onClick={() => deletePlayer(idx)}
                        disabled={!auth}
                        title="Odstranit hráče"
                      >×</button>
                    </div>
                  </li>
                ))}
              </ul>
              {/* Add player button: disabled when not authenticated */}
              <button className="btn mt-2 mr-2" onClick={addPlayer} disabled={!auth}>Přidat hráče</button>
              <button className="btn mt-2" onClick={applySeeding}>Použít nasazení</button>
            </div>
          </div>

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
                      {matches.map(([a, b], idxMatch) => {
                        const key = idFor('A', a, b)
                        const rec = state.A[key]
                        const court = (idxMatch % 3) + 1
                        return (
                          <div key={key} className='grid grid-cols-9 md:grid-cols-13 items-center gap-2 bg-white rounded-2xl p-2 shadow'>
                            <div className='col-span-1 text-center text-xs font-semibold text-gray-600'>Kurt {court}</div>
                            {/* Player A name cell: allow wrapping on mobile by adding whitespace-normal and break-words */}
                            <div className='col-span-3 md:col-span-4 text-left pl-2 whitespace-normal break-words'>{a}</div>
                            <div className='col-span-1 md:col-span-2 text-center'>
                              <input inputMode='numeric' pattern='[0-9]*' className='input text-center' placeholder='0' value={rec.ag} onChange={(e) => updateScore('A', key, 'ag', e.target.value)} disabled={!auth} />
                            </div>
                            <div className='col-span-1 md:col-span-2 text-center'>
                              <input inputMode='numeric' pattern='[0-9]*' className='input text-center' placeholder='0' value={rec.bg} onChange={(e) => updateScore('A', key, 'bg', e.target.value)} disabled={!auth} />
                            </div>
                            <div className='col-span-3 md:col-span-4 pl-2 flex items-center justify-between'>
                              <span className='whitespace-normal break-words flex-1'>{b}</span>
                              <button onClick={() => clearMatch('A', key)} className='text-red-500 hover:text-red-700 ml-2 flex-shrink-0' disabled={!auth}>×</button>
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
                      {matches.map(([a, b], idxMatch) => {
                        const key = idFor('B', a, b)
                        const rec = state.B[key]
                        const court = (idxMatch % 3) + 1
                        return (
                          <div key={key} className='grid grid-cols-9 md:grid-cols-13 items-center gap-2 bg-white rounded-2xl p-2 shadow'>
                            <div className='col-span-1 text-center text-xs font-semibold text-gray-600'>Kurt {court}</div>
                            {/* Player A name cell: allow wrapping on mobile by adding whitespace-normal and break-words */}
                            <div className='col-span-3 md:col-span-4 text-left pl-2 whitespace-normal break-words'>{a}</div>
                            <div className='col-span-1 md:col-span-2 text-center'>
                              <input inputMode='numeric' pattern='[0-9]*' className='input text-center' placeholder='0' value={rec.ag} onChange={(e) => updateScore('B', key, 'ag', e.target.value)} disabled={!auth} />
                            </div>
                            <div className='col-span-1 md:col-span-2 text-center'>
                              <input inputMode='numeric' pattern='[0-9]*' className='input text-center' placeholder='0' value={rec.bg} onChange={(e) => updateScore('B', key, 'bg', e.target.value)} disabled={!auth} />
                            </div>
                            <div className='col-span-3 md:col-span-4 pl-2 flex items-center justify-between'>
                              <span className='whitespace-normal break-words flex-1'>{b}</span>
                              <button onClick={() => clearMatch('B', key)} className='text-red-500 hover:text-red-700 ml-2 flex-shrink-0' disabled={!auth}>×</button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="text-xs text-gray-500">Ve skupinách se hraje na 4 vítězné gamy. Zadej skóre jako čísla (např. 4–2). Kliknutím na × vedle zápasu vymažete pouze tento výsledek. Zápasy jsou rozděleny na tři kurty (1–3).</div>
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