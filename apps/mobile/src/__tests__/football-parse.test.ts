/**
 * Unit tests — the ESPN fixture parser feeding the home screen + settlement.
 * Run: bun test src
 */
import { describe, expect, test } from "bun:test"

import { filterGames, parseEvent, type Game } from "../football"

// A trimmed real-shape ESPN scoreboard event (fifa.world).
const espnEvent = {
  id: 760510,
  date: "2026-07-09T20:00Z",
  status: { type: { state: "pre", completed: false, shortDetail: "7/9 - 8:00 PM UTC" } },
  competitions: [
    {
      id: "760510",
      venue: { fullName: "Gillette Stadium" },
      competitors: [
        {
          homeAway: "home",
          score: "0",
          winner: false,
          team: { displayName: "France", shortDisplayName: "France", abbreviation: "FRA", logo: "https://a.espncdn.com/fra.png" },
        },
        {
          homeAway: "away",
          score: "0",
          winner: false,
          team: { displayName: "Morocco", shortDisplayName: "Morocco", abbreviation: "MAR", logo: "https://a.espncdn.com/mar.png" },
        },
      ],
    },
  ],
}

describe("parseEvent", () => {
  test("maps a real ESPN event into the app's Game shape", () => {
    const g = parseEvent(espnEvent, "World Cup")!
    expect(g).not.toBeNull()
    expect(g.id).toBe("760510") // stringified — used in room topics + pact terms
    expect(g.state).toBe("pre")
    expect(g.completed).toBe(false)
    expect(g.venue).toBe("Gillette Stadium")
    expect(g.home.abbrev).toBe("FRA")
    expect(g.away.abbrev).toBe("MAR")
    expect(g.home.homeAway).toBe("home")
  })

  test("orders home/away by homeAway flag, not array order", () => {
    const flipped = {
      ...espnEvent,
      competitions: [
        {
          ...espnEvent.competitions[0],
          competitors: [...espnEvent.competitions[0].competitors].reverse(),
        },
      ],
    }
    const g = parseEvent(flipped, "World Cup")!
    expect(g.home.abbrev).toBe("FRA")
    expect(g.away.abbrev).toBe("MAR")
  })

  test("returns null for a malformed event instead of crashing the feed", () => {
    expect(parseEvent({ id: 1 }, "World Cup")).toBeNull()
    expect(parseEvent({ id: 1, competitions: [{ competitors: [] }] }, "World Cup")).toBeNull()
  })
})

describe("filterGames", () => {
  const mk = (state: Game["state"], completed = false) =>
    ({ ...parseEvent(espnEvent, "World Cup")!, state, completed }) as Game

  test("splits live / upcoming / completed correctly", () => {
    const games = [mk("pre"), mk("in"), mk("post", true)]
    expect(filterGames(games, "live").map((g) => g.state)).toEqual(["in"])
    expect(filterGames(games, "upcoming").map((g) => g.state)).toEqual(["pre"])
    expect(filterGames(games, "completed").map((g) => g.state)).toEqual(["post"])
    expect(filterGames(games, "all")).toHaveLength(3)
  })
})
