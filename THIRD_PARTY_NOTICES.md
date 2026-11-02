# Geographic data

Automatic city time zones use [city-timezones](https://github.com/kevinroberts/city-timezones) v1.3.4 (npm package declares MIT) and [tz-lookup](https://github.com/darkskyapp/tz-lookup) v6.1.25 (CC0). City points are approximate city centers, not venue coordinates. The city list is finite; choose the matching city and country from results. IANA/Intl rules apply daylight saving to dates, rather than storing fixed UTC offsets.

Google Maps and Places data is loaded only through Google's APIs when configured. Place IDs may be retained; provider names, addresses, coordinates and attributions returned by Places are transient in memory and are not included in offline downloads. The interactive map supplies Google's own map attribution; fresh Places cards show provider attribution and retrieval time. Review Google's current Maps Platform terms for the deployment and region.
