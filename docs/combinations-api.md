# Combinations API

Decks of cards, and the pairs between them. Every endpoint needs `Authorization: Bearer <token>` and answers `{ data: ... }`. Everything is scoped to the token's user. All paths below are under `/api/combinations`.

A **deck** is a named list of up to 200 **cards**, kept in order. A **pair** is two different cards of the same deck and records what happens when they are combined. A deck has a **mode**. In `combinations` (the default) pairs are unordered: the pair of A and B is the pair of B and A, and is stored once. In `permutations` pairs are ordered: A then B and B then A are two separate pairs. A deck can be linked to one of your projects, and is unlinked (not deleted) when that project is deleted.

Each card sits on the **X axis** (columns), the **Y axis** (rows), both, or neither. A pair shows in the grid when its cards are placed for the deck's mode: in `combinations`, one card on X and the other on Y; in `permutations`, the first card on Y and the second on X.

A deck can also be a **recipe deck** (`recipe: true`). There a pair is a recipe: its two cards are the ingredients and its name is the result. The result is a card of the same deck. A result card made by the server is a **crafted** card; the cards you add yourself are base cards. A recipe deck is always a `combinations` deck. A recipe can use one card twice (Stone + Stone).

A pair is in one of four states:

| State | Meaning |
| ----- | ------- |
| `empty` | nothing worked out yet (the default; a pair that was never saved reads as empty) |
| `drafted` | a first idea is written down |
| `done` | worked out |
| `struck` | ruled out |

## Objects

```json
{ "id": 4, "name": "Spells", "mode": "combinations", "projectId": null, "sourceDeckId": null, "recipe": false, "cardCount": 12,
  "counts": { "drafted": 2, "done": 5, "struck": 1 },
  "createdAt": "2026-10-22T18:00:00.000Z", "updatedAt": "2026-10-22T18:00:00.000Z" }
```

`mode` is `combinations` or `permutations`. `counts` is the number of saved pairs in each state, hidden pairs included (see `onX` and `onY` below). `sourceDeckId` is `null` unless the deck was made from another deck. `recipe` is `true` for a recipe deck.

```json
{ "id": 31, "deckId": 4, "name": "Fire", "detail": "Burns things", "position": 0, "onX": false, "onY": false, "crafted": false }
```

`position` is 0-based and contiguous within the deck. `onX` and `onY` say whether the card is on the X axis and the Y axis. `crafted` is `true` for a card the server made as a recipe result, and `false` for every other card (always `false` outside a recipe deck). A card made with `POST /decks/:id/cards` starts on no axis (both `false`). Taking a card off an axis hides its pairs in the grid but does not delete them: they come back when the card goes back on. `counts` and `cardCount` in the deck list still count every saved pair.

```json
{ "id": 9, "cardAId": 31, "cardBId": 32, "resultCardId": null, "name": "Steam", "effect": "Hot mist", "notes": "", "state": "done" }
```

`resultCardId` is the card this pair makes, or `null`. It is only set in a recipe deck, and it is the card whose name the pair's `name` holds. In a `combinations` deck `cardAId` is always the smaller card id. In a `permutations` deck `cardAId` is the first card (the one on Y) and `cardBId` the second (the one on X), whatever their ids.

### Fields and limits

Text is trimmed before it is checked for `name`. Names are 1 to 200 characters (a pair `name` may also be empty). `detail`, `effect` and `notes` are at most 5000 characters. A deck name is unique per user.

## GET /api/combinations/decks

Your decks by name. `?projectId=` limits the list to one of your projects. Returns `{ "decks": [deck] }`.

## POST /api/combinations/decks

Body `{ name, projectId? }`. `projectId` must be one of your projects or `null`. Returns the deck, status 201.

## GET /api/combinations/decks/:id

Returns `{ "deck": deck, "cards": [card], "pairs": [pair] }`. Cards are in order; pairs are only those saved, ordered by card ids.

## PATCH /api/combinations/decks/:id

Body `{ name?, projectId?, mode?, recipe? }`, at least one. `projectId: null` unlinks. `mode` is `combinations` or `permutations`. `recipe` is a boolean. Returns the deck.

Going from `permutations` back to `combinations` folds the ordered pairs into unordered ones. For each two cards, the filled pair is kept (or one empty pair if neither is filled), with the smaller card id first, and the other order is removed. If both orders of any two cards are filled, nothing changes and the answer is a 409 that names them, for example `Both orders are filled for: Fire + Ice`. Fill or clear one order and try again. Going to `permutations` keeps every pair as it is.

Turning `recipe` on links every pair that has a name to a card of that name. A card with that name is reused; otherwise a new crafted card is made, on both axes. A pair with no name makes nothing. Turning `recipe` off clears every `resultCardId`. The cards, including crafted ones, and the pair names stay as they are, and `crafted` stays `true` on them.

A recipe deck cannot be a `permutations` deck. Turning `recipe` on for a `permutations` deck, or setting `mode` to `permutations` on a recipe deck, is a 409 `A recipe deck cannot use permutations`.

## DELETE /api/combinations/decks/:id

Deletes the deck with its cards and pairs. Returns `{ "id": 4 }`.

## POST /api/combinations/decks/:id/cards

Body `{ name, detail? }`. Appends the card. Returns the card, status 201.

## PATCH /api/combinations/cards/:id

Body `{ name?, detail?, onX?, onY? }`, at least one. `onX` and `onY` are booleans that put the card on or off an axis. Taking a card off hides its pairs without deleting them. Renaming a card also renames every pair that makes it (every pair whose `resultCardId` is the card). Returns the card.

## PUT /api/combinations/cards/:id/move

Body `{ "direction": "up" | "down" }`. Swaps the card with its neighbour; at either end nothing changes. Returns `{ "cards": [card] }`, the whole deck in its new order.

## DELETE /api/combinations/cards/:id

Deletes the card and every pair it was in, and closes the gap in positions. Pairs that made the card stay, with their result and name cleared. Returns `{ "removedPairs": 2 }`, the number of those pairs whose state was not `empty`.

## PUT /api/combinations/decks/:id/pairs

Body `{ cardAId, cardBId, name?, effect?, notes?, state? }`. In a recipe deck `cardAId` and `cardBId` may be the same card (a same-item recipe such as Stone + Stone); elsewhere that is a 400. Creates the pair, or updates it when it exists, whichever order the cards are given in. Fields left out keep their stored value (new pairs start empty, state `empty`). In a `combinations` deck the cards are stored smaller id first. In a `permutations` deck the order given is kept: `cardAId` is the first card, and the swapped order is a different pair. Returns the pair.

In a recipe deck the pair's `name` is the result, and a `name` in the body is linked to a card:

- A card with that name already in the deck is used. Nothing new is made.
- Otherwise, if the pair already made a crafted card that no other pair makes, that card is renamed.
- Otherwise a new crafted card is made, on both axes. If the deck already has 200 cards this is a 400.
- An empty `name` clears the result: the pair makes nothing.

`resultCardId` is set to the card, and the pair's `name` to that card's name. When a name is set and the pair is still `empty`, and no `state` is sent, the state becomes `done`. A crafted card the pair no longer makes is removed, unless another pair makes it or a pair that is not `empty` uses it as an ingredient. A crafted card therefore stays while any recipe makes it or a filled pair uses it. In a recipe deck the answer is the pair plus the deck's whole card list, since cards may have been added, renamed or removed:

```json
{ "id": 9, "cardAId": 31, "cardBId": 32, "resultCardId": 33, "name": "Plank", "effect": "", "notes": "", "state": "done",
  "cards": [card] }
```

## POST /api/combinations/import

Brings in decks from the prototype's JSON. The body is one deck object, a list of decks, or `{ "decks": [deck] }`; other fields are ignored. Every deck becomes a new deck of yours, all in one transaction: if any deck is invalid nothing is saved. A deck name that is already taken (by one of your decks, or by an earlier deck in the same import) gets ` (2)`, ` (3)` and so on. Bodies up to 5 MB are accepted. Returns `{ "decks": [deck] }` in the order given, status 201.

The prototype deck format:

```json
{
  "id": "d1",
  "name": "HordeGame augments",
  "mode": "combinations",
  "cards": [
    { "id": "fire", "name": "Fire", "detail": "Bullets ignite enemies.", "onX": true, "onY": true },
    { "id": "explosive", "name": "Explosive", "detail": "Bullets explode on impact.", "onX": true, "onY": true }
  ],
  "pairs": {
    "explosive|fire": { "name": "Napalm", "effect": "Burning ground.", "notes": "Cap stacks.", "state": "done" }
  }
}
```

- A deck needs a string `name` and a `cards` list. Every card needs a string `id` and `name`; ids are unique within the deck and contain no `|`. `detail` is optional. `mode` is optional: `permutations` makes an ordered deck, anything else (or missing) is `combinations`. `onX` and `onY` are optional booleans; old files without them, or with other values, put the card on both axes.
- In a `combinations` deck a pair key is the two card ids joined by `|`, in either order. In a `permutations` deck the key order matters: `a|b` is the pair from card `a` (first, on Y) to card `b` (second, on X), and `b|a` is a separate pair. A pair whose key names an unknown card, the same card twice, or is not an object is skipped. Missing `name`, `effect` and `notes` become empty text and an unknown `state` becomes `empty`.
- A recipe deck sets `"recipe": true`. Its cards may have `kind` (`"base"` or `"crafted"`; anything else is `base`), and a pair may have `result`, the id of the card it makes. A pair key may name the same card twice (`s|s`). Without `result`, a pair with a name is linked to a card of that name as in `PUT pairs`. The deck is always a `combinations` deck on import. `items` and `recipes` (see export) are ignored: `cards` and `pairs` hold the deck.
- The deck `id` is ignored: new ids are assigned. Limits match the routes and are checked after trimming names: a deck has at most 200 cards, deck, card and pair names are at most 200 characters, and `detail`, `effect` and `notes` at most 5000. Deck and card names must not be blank (empty or only spaces); a pair name may be. A deck over a limit makes the whole import a 400 that names the deck.

## GET /api/combinations/export

All your decks as `{ "decks": [deck] }` in the prototype format above, by name. `?projectId=` limits it to one of your projects. Ids are `d_<id>` for decks and `c_<id>` for cards, and pairs still in the `empty` state are left out. Each deck has its `mode`, and each card its `onX` and `onY`. In a `permutations` deck pair keys are written first card then second card; in a `combinations` deck the smaller id comes first. The result can be sent back to `POST /import`.

A deck that is not a recipe deck is exported exactly as above, with no recipe fields. A recipe deck adds `"recipe": true`, a `kind` on each card, a `result` on each pair, and two lists for a game to read:

- `items`: every card as `{ id, name, detail, kind }`, where `kind` is `crafted` if a pair that is not `struck` makes the card, else `base`.
- `recipes`: one `{ ingredients: [id, id], result: id }` for each pair that makes a card and is not `struck`. A same-item recipe repeats the id.

Pairs in a recipe deck are also exported while `empty` if they make something. Example, Wood + Stone makes Plank and Stone + Stone makes Gravel:

```json
{
  "id": "d_7", "name": "Crafting", "mode": "combinations", "recipe": true,
  "cards": [
    { "id": "c_1", "name": "Wood", "detail": "", "onX": true, "onY": true, "kind": "base" },
    { "id": "c_2", "name": "Stone", "detail": "", "onX": true, "onY": true, "kind": "base" },
    { "id": "c_3", "name": "Plank", "detail": "", "onX": true, "onY": true, "kind": "crafted" },
    { "id": "c_4", "name": "Gravel", "detail": "", "onX": true, "onY": true, "kind": "crafted" }
  ],
  "pairs": {
    "c_1|c_2": { "name": "Plank", "effect": "", "notes": "", "state": "done", "result": "c_3" },
    "c_2|c_2": { "name": "Gravel", "effect": "", "notes": "", "state": "done", "result": "c_4" }
  },
  "items": [
    { "id": "c_1", "name": "Wood", "detail": "", "kind": "base" },
    { "id": "c_2", "name": "Stone", "detail": "", "kind": "base" },
    { "id": "c_3", "name": "Plank", "detail": "", "kind": "crafted" },
    { "id": "c_4", "name": "Gravel", "detail": "", "kind": "crafted" }
  ],
  "recipes": [
    { "ingredients": ["c_1", "c_2"], "result": "c_3" },
    { "ingredients": ["c_2", "c_2"], "result": "c_4" }
  ]
}
```

## GET /api/combinations/decks/:id/export

One deck in the prototype format.

## POST /api/combinations/decks/:id/promote

Makes a new deck named `<source name> · done pairs` (with ` (2)` and so on if taken), linked to the same project and with `sourceDeckId` set to the source deck. It is always a `combinations` deck. It has one card for each visible `done` pair (done pairs hidden because a card is off its axis are skipped), each placed on both axes, in grid order (by the position of the earlier card, then of the later one). A card is named after the pair, or `A + B` (card names, earlier first) when the pair has no name, and its detail is the pair's effect. A deck with no done pairs gives a deck with no cards. Returns the deck, status 201.

## Errors

| Status | When |
| ------ | ---- |
| 400 | an import that is not valid deck JSON, has no decks or has a name over 200 characters; a field is missing, the wrong type or over its limit; a blank name; a bad `state` or `direction`; a PATCH with no fields; a bad `:id` or `projectId`; the same card twice, or a card that is not in the deck; a 201st card, including a crafted result card; the same card twice in a deck that is not a recipe deck |
| 401 | no or invalid token |
| 403 | the deck, card or linked project belongs to another user |
| 404 | no such deck, card or project |
| 409 | you already have a deck with that name; a flip from `permutations` to `combinations` while both orders of two cards are filled; turning `recipe` on for a `permutations` deck, or `permutations` on for a recipe deck |
