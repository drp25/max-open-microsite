import React, { useEffect, useMemo, useState } from 'react'

const playersA = [
  { name: 'Marek Vaniš', rank: 1 },
  { name: 'Pochy', rank: 3 },
  { name: 'David Kapin', rank: 4 },
  { name: 'Marek Schneider', rank: 5 },
  { name: 'Franta Fál', rank: 11 },
  { name: 'Vláď da Tvrdek', rank: 12 },
  { name: 'Martin Klanica', rank: 13 },
]
const playersB = [
  { name: 'Dušan Maleček', rank: 2 },
  { name: 'Šimon Opekar', rank: 6 },
  { name: 'David Rys', rank: 7 },
  { name: 'Jakub Mráček', rank: 8 },
  { name: 'Ondřej Holboj', rank: 9 },
  { name: 'Venca Fál', rank: 10 },
]

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
    t.splice(1, 0, t.pop()) // rotate except first
  }
  return schedule
}
const scheduleA = roundRobin(playersA)
const scheduleB = roundRobin(playersB)

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
function loadState() {
  try { return JSON.parse(localStorage.getItem('tenis-microsite-state-v1')) } catch (e) { return null }
}
function saveState(s) {
  localStorage.setItem('tenis-microsite-state-v1', JSON.stringify(s))
}
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

export default function App() {
  const initial = useMemo(() => loadState() || ({ A: emptyResults(scheduleA, 'A'), B: emptyResults(scheduleB, 'B') }), [])
  const [state, setState] = useState(initial)
  useEffect(() => { saveState(state) }, [state])

  const standingsA = useMemo(() => calcStandings(playersA, state.A), [state.A])
  const standingsB = useMemo(() => calcStandings(playersB, state.B), [state.B])

  const updateScore = (group, key, field, value) => {
    setState((s) => ({ ...s, [group]: { ...s[group], [key]: { ...s[group][key], [field]: value } } }))
  }
  const resetAll = () => {
    if (!confirm('Smazat všechny výsledky?')) return
    setState({ A: emptyResults(scheduleA, 'A'), B: emptyResults(scheduleB, 'B') })
  }
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
    reader.onload = () => { try { setState(JSON.parse(reader.result)) } catch(e) { alert('Soubor nelze načíst') } }
    reader.readAsText(f)
  }

  const top4A = standingsA.slice(0,4).map(r=>r.name)
  const top4B = standingsB.slice(0,4).map(r=>r.name)
  const bracket = [
    { label: 'ČF1', a: top4A[0] || '1A', b: top4B[3] || '4B' },
    { label: 'ČF2', a: top4A[1] || '2A', b: top4B[2] || '3B' },
    { label: 'ČF3', a: top4B[0] || '1B', b: top4A[3] || '4A' },
    { label: 'ČF4', a: top4B[1] || '2B', b: top4A[2] || '3A' },
  ]

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h1 className="text-2xl md:text-3xl font-bold">Max Open – turnajová microsite</h1>
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn" onClick={onExport}>Export dat</button>
            <label className="btn cursor-pointer">
              <input type="file" accept="application/json" className="hidden" onChange={onImport} />
              Načíst data
            </label>
            <button className="btn" onClick={resetAll}>Reset výsledků</button>
          </div>
        </header>

        <Tabs
          tabs={[
            { id: 'rozpis', label: 'Rozpis' },
            { id: 'tabulky', label: 'Tabulky' },
            { id: 'playoff', label: 'Playoff' },
          ]}
        >
          <div data-tab="rozpis" className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
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
                            <div className="col-span-3 pl-2">{b}</div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>

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
                            <div className="col-span-3 pl-2">{b}</div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="text-xs text-gray-500">Ve skupinách se hraje na 4 vítězné gamy. Zadej skóre jako čísla (např. 4–2).</div>
          </div>

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
              <p className="text-sm text-gray-600 mt-2">Párování: ČF1 1A–4B, ČF2 2A–3B, ČF3 1B–4A, ČF4 2B–3A.</p>
            </div>
          </div>
        </Tabs>
      </div>
    </div>
  )
}

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
              <td className="p-2">{i+1}</td>
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

function Tabs({ tabs, children }) {
  const [active, setActive] = useState(tabs[0]?.id || 'rozpis')
  const panels = React.Children.toArray(children)
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {tabs.map(t => (
          <button key={t.id} className="tab-btn" data-active={active===t.id} onClick={()=>setActive(t.id)}>{t.label}</button>
        ))}
      </div>
      {panels.map((p, idx) => {
        if (!React.isValidElement(p)) return null
        return React.cloneElement(p, { hidden: p.props['data-tab'] !== active, key: idx })
      })}
    </div>
  )
}
