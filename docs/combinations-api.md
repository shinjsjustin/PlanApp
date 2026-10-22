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

## GET /api/combinations/decks

Your decks by name. `?projectId=` limits the list to one of your projects. Returns `{ "decks": [deck] }`.

## POST /api/combinations/decks

Body `{ name, projectId? }`. `projectId` must be one of your projects or `null`. Returns the deck, status 201.

## GET /api/combinations/decks/:id

Returns `{ "deck": deck, "cards": [card], "pairs": [pair] }`. Cards are in order; pairs are only those saved, ordered by card ids.

## PATCH /api/combinations/decks/:id

Body `{ name?, projectId? }`, at least one. `projectId: null` unlinks. Returns the deck.

## DELETE /api/combinations/decks/:id

Deletes the deck with its cards and pairs. Returns `{ "id": 4 }`.

## POST /api/combinations/decks/:id/cards

Body `{ name, detail? }`. Appends the card. Returns the card, status 201.

## PATCH /api/combinations/cards/:id

Body `{ name?, detail? }`, at least one. Returns the card.

## PUT /api/combinations/cards/:id/move

Body `{ "direction": "up" | "down" }`. Swaps the card with its neighbour; at either end nothing changes. Returns `{ "cards": [card] }`, the whole deck in its new order.

## DELETE /api/combinations/cards/:id

Deletes the card and every pair it was in, and closes the gap in positions. Returns `{ "removedPairs": 2 }`, the number of those pairs whose state was not `empty`.

## PUT /api/combinations/decks/:id/pairs

Body `{ cardAId, cardBId, name?, effect?, notes?, state? }`. Creates the pair, or updates it when it exists, whichever order the cards are given in. Fields left out keep their stored value (new pairs start empty, state `empty`). Returns the pair.

## POST /api/combinations/import

Brings in decks from the prototype's JSON. The body is one deck object, a list of decks, or `{ "decks": [deck] }`; other fields are ignored. Every deck becomes a new deck of yours, all in one transaction: if any deck is invalid nothing is saved. A deck name that is already taken (by one of your decks, or by an earlier deck in the same import) gets ` (2)`, ` (3)` and so on. Bodies up to 5 MB are accepted. Returns `{ "decks": [deck] }` in the order given, status 201.

The prototype deck format:

```json
{
  "id": "d1",
  "name": "HordeGame augments",
  "cards": [
    { "id": "fire", "name": "Fire", "detail": "Bullets ignite enemies." },
    { "id": "explosive", "name": "Explosive", "detail": "Bullets explode on impact." }
  ],
  "pairs": {
    "explosive|fire": { "name": "Napalm", "effect": "Burning ground.", "notes": "Cap stacks.", "state": "done" }
  }
}
```

- A deck needs a string `name` and a `cards` list. Every card needs a string `id` and `name`; ids are unique within the deck and contain no `|`. `detail` is optional.
- A pair key is the two card ids joined by `|`, in either order. A pair whose key names an unknown card, the same card twice, or is not an object is skipped. Missing `name`, `effect` and `notes` become empty text and an unknown `state` becomes `empty`.
- The deck `id` is ignored: new ids are assigned. Limits match the routes and are checked after trimming names: a deck has at most 200 cards, deck, card and pair names are at most 200 characters, and `detail`, `effect` and `notes` at most 5000. Deck and card names must not be blank (empty or only spaces); a pair name may be. A deck over a limit makes the whole import a 400 that names the deck.

## GET /api/combinations/export

All your decks as `{ "decks": [deck] }` in the prototype format above, by name. `?projectId=` limits it to one of your projects. Ids are `d_<id>` for decks and `c_<id>` for cards, and pairs still in the `empty` state are left out. The result can be sent back to `POST /import`.

## GET /api/combinations/decks/:id/export

One deck in the prototype format.

## POST /api/combinations/decks/:id/promote

Makes a new deck named `<source name> · done pairs` (with ` (2)` and so on if taken), linked to the same project and with `sourceDeckId` set to the source deck. It has one card for each `done` pair, in grid order (by the position of the earlier card, then of the later one). A card is named after the pair, or `A + B` (card names, earlier first) when the pair has no name, and its detail is the pair's effect. A deck with no done pairs gives a deck with no cards. Returns the deck, status 201.

## Errors

| Status | When |
| ------ | ---- |
| 400 | an import that is not valid deck JSON, has no decks or has a name over 200 characters; a field is missing, the wrong type or over its limit; a blank name; a bad `state` or `direction`; a PATCH with no fields; a bad `:id` or `projectId`; the same card twice, or a card that is not in the deck; a 201st card |
| 401 | no or invalid token |
| 403 | the deck, card or linked project belongs to another user |
| 404 | no such deck, card or project |
| 409 | you already have a deck with that name |
