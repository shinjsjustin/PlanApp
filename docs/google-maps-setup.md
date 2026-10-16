# Google Maps setup (drive times)

Drive times between saved places use the Google Routes API. The key is optional:
without `GOOGLE_MAPS_API_KEY`, places still work and travel shows as unavailable.

1. Open [Google Cloud Console](https://console.cloud.google.com/) on the project you
   use for PlanApp, and make sure billing is turned on for it.
2. Go to APIs & Services > Library and enable the **Routes API**.
3. Go to APIs & Services > Credentials > Create credentials > API key.
4. Edit the key and under API restrictions choose "Restrict key", then select only
   the **Routes API**. The key is for server use only: it is never sent to the
   browser, so do not add it to any client `.env`.
5. Set `GOOGLE_MAPS_API_KEY=<your key>` in `.env` on dev, and in the `.env` on the
   production host.
6. Restart the server on each machine so it picks up the new value.

## Cost

Results are cached for 30 days per address pair and hour of the week, so repeat
lookups cost nothing and usage should stay within the free allowance.

## Check it works

Call `GET /api/bourne/travel?from=<placeId>&to=<placeId>&departAt=<ISO time with offset>` with your login token.
A drive duration and distance in the response means the key works. If travel shows
as unavailable, check the key is set, the Routes API is enabled, and billing is on.
