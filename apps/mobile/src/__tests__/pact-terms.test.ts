/**
 * Unit tests — deterministic pact terms + hashing. This is the invariant the
 * serverless settlement rests on: the app (create) and the keeper (settle)
 * must derive the IDENTICAL keccak256 for the same match + outcome, because
 * the keeper finds pacts to pay out purely by recomputing these hashes.
 * Run: bun test src
 */
import { describe, expect, mock, test } from "bun:test"
import { ethers } from "ethers"

// pact.ts pulls AsyncStorage (native) for its terms cache — stub it for tests.
mock.module("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  },
}))

import type { Game } from "../football"

const { hashTerms } = await import("../pact")
const { outcomeLabel, predictionTerms } = await import("../football")

const game: Game = {
  id: "760510",
  league: "World Cup",
  leagueName: "World Cup",
  date: "2026-07-09T20:00Z",
  state: "pre",
  completed: false,
  status: "Thu, July 9th at 8:00 PM UTC",
  shortDetail: "",
  venue: "Gillette Stadium",
  home: { name: "France", shortName: "France", abbrev: "FRA", logo: null, score: null, winner: false, homeAway: "home" },
  away: { name: "Morocco", shortName: "Morocco", abbrev: "MAR", logo: null, score: null, winner: false, homeAway: "away" },
}

describe("hashTerms", () => {
  test("is keccak256 of the UTF-8 terms — matching Solidity keccak256(bytes(terms))", () => {
    // Known vector: keccak256("") — pins the hash function itself.
    expect(hashTerms("")).toBe("0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470")
    const s = "France to beat Morocco · WC#760510"
    expect(hashTerms(s)).toBe(ethers.keccak256(ethers.toUtf8Bytes(s)))
  })
})

describe("predictionTerms", () => {
  test("is deterministic for the same match + outcome (app ↔ keeper agreement)", () => {
    expect(predictionTerms(game, "home")).toBe(predictionTerms(game, "home"))
    expect(hashTerms(predictionTerms(game, "home"))).toBe(hashTerms(predictionTerms(game, "home")))
  })

  test("embeds the match id so identical fixtures in other games can't collide", () => {
    expect(predictionTerms(game, "home")).toContain("WC#760510")
  })

  test("every outcome hashes differently", () => {
    const hashes = ["home", "draw", "away"].map((o) => hashTerms(predictionTerms(game, o as any)))
    expect(new Set(hashes).size).toBe(3)
  })

  test("reads as plain English (the human-auditable escrow terms)", () => {
    expect(outcomeLabel(game, "home")).toBe("France to beat Morocco")
    expect(outcomeLabel(game, "draw")).toBe("Draw — France vs Morocco")
    expect(predictionTerms(game, "away")).toBe("Morocco to beat France · WC#760510")
  })
})
