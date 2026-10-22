# Combinations API

Decks of cards, and the pairs between them. Every endpoint needs `Authorization: Bearer <token>` and answers `{ data: ... }`. Everything is scoped to the token's user. All paths below are under `/api/combinations`.

A **deck** is a named list of up to 200 **cards**, kept in order. A **pair** is two different cards of the same deck and records what happens when they are combined. Pairs are unordered: the pair of A and B is the pair of B and A, and is stored once. A deck can be linked to one of your projects, and is unlinked (not deleted) when that project is deleted.

A pair is in one of four states:

| State | Meaning |
| ----- | ------- |
| `empty` | nothing worked out yet (the default; a pair that was never saved reads as empty) |
| `drafted` | a first idea is written down |
| `done` | worked out |
| `struck` | ruled out |

## Objects

```json
{ "id": 4, "name": "Spells", "projectId": null, "sourceDeckId": null, "cardCount": 12,
  "counts": { "drafted": 2, "done": 5, "struck": 1 },
  "createdAt": "2026-10-22T18:00:00.000Z", "updatedAt": "2026-10-22T18:00:00.000Z" }
```

`counts` is the number of pairs in each state. `sourceDeckId` is `null` unless the deck was made from another deck.

```json
{ "id": 31, "deckId": 4, "name": "Fire", "detail": "Burns things", "position": 0 }
```

`position` is 0-based and contiguous within the deck.

```json
{ "id": 9, "cardAId": 31, "cardBId": 32, "name": "Steam", "effect": "Hot mist", "notes": "", "state": "done" }
```

`cardAId` is always the smaller card id.

### Fields and limits

Text is trimmed before it is checked for `name`. Names are 1 to 200 characters (a pair `name` may also be empty). `detail`, `effect` and `notes` are at most 5000 characters. A deck name is unique per user.

## GET /decks

Your decks by name. `?projectId=` limits the list to one of your projects. Returns `{ "decks": [deck] }`.

## POST /decks

Body `{ name, projectId? }`. `projectId` must be one of your projects or `null`. Returns the deck, status 201.

## GET /decks/:id

Returns `{ "deck": deck, "cards": [card], "pairs": [pair] }`. Cards are in order; pairs are only those saved, ordered by card ids.

## PATCH /decks/:id

Body `{ name?, projectId? }`, at least one. `projectId: null` unlinks. Returns the deck.

## DELETE /decks/:id

Deletes the deck with its cards and pairs. Returns `{ "id": 4 }`.

## POST /decks/:id/cards

Body `{ name, detail? }`. Appends the card. Returns the card, status 201.

## PATCH /cards/:id

Body `{ name?, detail? }`, at least one. Returns the card.

## PUT /cards/:id/move

Body `{ "direction": "up" | "down" }`. Swaps the card with its neighbour; at either end nothing changes. Returns `{ "cards": [card] }`, the whole deck in its new order.

## DELETE /cards/:id

Deletes the card and every pair it was in, and closes the gap in positions. Returns `{ "removedPairs": 2 }`, the number of those pairs whose state was not `empty`.

## PUT /decks/:id/pairs

Body `{ cardAId, cardBId, name?, effect?, notes?, state? }`. Creates the pair, or updates it when it exists, whichever order the cards are given in. Fields left out keep their stored value (new pairs start empty, state `empty`). Returns the pair.

## Errors

| Status | When |
| ------ | ---- |
| 400 | a field is missing, the wrong type or over its limit; a blank name; a bad `state` or `direction`; a PATCH with no fields; a bad `:id` or `projectId`; the same card twice, or a card that is not in the deck; a 201st card |
| 401 | no or invalid token |
| 403 | the deck, card or linked project belongs to another user |
| 404 | no such deck, card or project |
| 409 | you already have a deck with that name |
