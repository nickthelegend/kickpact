/**
 * Football data — real fixtures from ESPN's public API (no key). Powers the
 * Home games feed and game-detail pages. Defaults to the FIFA World Cup;
 * swappable to any league code (eng.1, esp.1, …).
 */
const ESPN = "https://site.api.espn.com/apis/site/v2/sports/soccer"

export type GameState = "pre" | "in" | "post"

export interface Team {
  name: string
  shortName: string
  abbrev: string
  logo: string | null
  score: string | null
  winner: boolean
  homeAway: "home" | "away"
}

export interface Game {
  id: string
  league: string
  leagueName: string
  date: string // ISO kickoff
  state: GameState
  completed: boolean
  status: string // "FT", "45'", "HT"
  shortDetail: string // "6/30 - 5:00 PM" / "FT"
  venue: string | null
  home: Team
  away: Team
}

export const LEAGUES = [
  { code: "fifa.world", name: "World Cup" },
  { code: "eng.1", name: "Premier League" },
  { code: "esp.1", name: "La Liga" },
  { code: "uefa.champions", name: "Champions League" },
] as const

function parseTeam(c: any): Team {
  const t = c.team ?? {}
  return {
    name: t.displayName ?? t.name ?? "TBD",
    shortName: t.shortDisplayName ?? t.name ?? "TBD",
    abbrev: t.abbreviation ?? "—",
    logo: t.logo ?? (t.logos?.[0]?.href ?? null),
    score: c.score ?? null,
    winner: !!c.winner,
    homeAway: c.homeAway === "home" ? "home" : "away",
  }
}

function parseEvent(e: any, leagueName: string): Game | null {
  const comp = e.competitions?.[0]
  if (!comp) return null
  const comps = comp.competitors ?? []
  const home = comps.find((c: any) => c.homeAway === "home") ?? comps[0]
  const away = comps.find((c: any) => c.homeAway === "away") ?? comps[1]
  if (!home || !away) return null
  const st = e.status?.type ?? {}
  return {
    id: String(e.id),
    league: comp.id ? leagueName : leagueName,
    leagueName,
    date: e.date,
    state: (st.state ?? "pre") as GameState,
    completed: !!st.completed,
    status: st.shortDetail ?? st.detail ?? "",
    shortDetail: st.shortDetail ?? "",
    venue: comp.venue?.fullName ?? null,
    home: parseTeam(home),
    away: parseTeam(away),
  }
}

function ymd(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`
}

const cache = new Map<string, { at: number; games: Game[] }>()

/**
 * All fixtures for a league across a window around now (covers completed,
 * live and upcoming in one fetch). Cached for 30s.
 */
export async function fetchGames(
  league = "fifa.world",
  leagueName = "World Cup",
): Promise<Game[]> {
  const key = league
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < 30_000) return hit.games

  const now = new Date()
  const from = new Date(now.getTime() - 30 * 864e5) // 30 days back
  const to = new Date(now.getTime() + 30 * 864e5) // 30 days forward
  const url = `${ESPN}/${league}/scoreboard?dates=${ymd(from)}-${ymd(to)}&limit=400`
  const res = await fetch(url)
  const data = await res.json()
  const games = (data.events ?? [])
    .map((e: any) => parseEvent(e, leagueName))
    .filter(Boolean) as Game[]
  games.sort((a, b) => +new Date(a.date) - +new Date(b.date))
  cache.set(key, { at: Date.now(), games })
  return games
}

export type Filter = "live" | "upcoming" | "completed" | "all"

export function filterGames(games: Game[], f: Filter): Game[] {
  if (f === "all") return games
  if (f === "live") return games.filter((g) => g.state === "in")
  if (f === "upcoming") return games.filter((g) => g.state === "pre")
  return games.filter((g) => g.state === "post")
}

export async function fetchGame(
  id: string,
  league = "fifa.world",
  leagueName = "World Cup",
): Promise<Game | null> {
  const all = await fetchGames(league, leagueName)
  return all.find((g) => g.id === id) ?? null
}

export function kickoffLabel(g: Game): string {
  const d = new Date(g.date)
  const day = d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  return `${day} · ${time}`
}

export type Outcome = "home" | "draw" | "away"

/** The official result of a finished match, or null if not finished. */
export function finalOutcome(g: Game): Outcome | null {
  if (g.state !== "post") return null
  if (g.home.winner) return "home"
  if (g.away.winner) return "away"
  const h = Number(g.home.score),
    a = Number(g.away.score)
  if (!Number.isNaN(h) && !Number.isNaN(a)) return h > a ? "home" : a > h ? "away" : "draw"
  return "draw"
}

/** Human label for a predicted outcome — e.g. "England to beat Congo DR". */
export function outcomeLabel(g: Game, outcome: Outcome): string {
  if (outcome === "draw") return `Draw — ${g.home.shortName} vs ${g.away.shortName}`
  const win = outcome === "home" ? g.home : g.away
  const lose = outcome === "home" ? g.away : g.home
  return `${win.shortName} to beat ${lose.shortName}`
}

/**
 * Deterministic on-chain terms string for a prediction. The keeper recomputes
 * this from the same ESPN game + outcome, so the keccak hash always matches —
 * no off-chain mapping needed. Stable on game id (NOT kickoff time).
 */
export function predictionTerms(g: Game, outcome: Outcome): string {
  return `${outcomeLabel(g, outcome)} · WC#${g.id}`
}
