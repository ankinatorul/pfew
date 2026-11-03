export type OfficialSource = {
  id: string;
  name: string;
  url: string;
  country: string;
  scope: string;
};
const destinations = [
  [
    "JP",
    "Japan",
    "japan",
    "https://www.mofa.go.jp/j_info/visit/visa/",
    "Ministry of Foreign Affairs of Japan",
  ],
  [
    "AU",
    "Australia",
    "australia",
    "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-finder",
    "Australian Department of Home Affairs",
  ],
  [
    "NZ",
    "New Zealand",
    "new-zealand",
    "https://www.immigration.govt.nz/",
    "Immigration New Zealand",
  ],
  [
    "GB",
    "United Kingdom",
    "united-kingdom",
    "https://www.gov.uk/check-uk-visa",
    "UK Government visa guidance",
  ],
  [
    "US",
    "United States",
    "usa",
    "https://travel.state.gov/content/travel/en/us-visas.html",
    "US Department of State",
  ],
  ["FR", "France", "france", "https://france-visas.gouv.fr/", "France-Visas"],
  [
    "IT",
    "Italy",
    "italy",
    "https://vistoperitalia.esteri.it/",
    "Italian Ministry of Foreign Affairs",
  ],
  [
    "ES",
    "Spain",
    "spain",
    "https://www.exteriores.gob.es/",
    "Spanish Ministry of Foreign Affairs",
  ],
  [
    "GR",
    "Greece",
    "greece",
    "https://www.mfa.gr/",
    "Greek Ministry of Foreign Affairs",
  ],
  [
    "RO",
    "Romania",
    "romania",
    "https://eviza.mae.ro/",
    "Romanian Ministry of Foreign Affairs",
  ],
  [
    "TH",
    "Thailand",
    "thailand",
    "https://www.thaievisa.go.th/",
    "Thai Ministry of Foreign Affairs",
  ],
  [
    "SG",
    "Singapore",
    "singapore",
    "https://www.ica.gov.sg/enter-transit-depart/entering-singapore",
    "Singapore Immigration & Checkpoints Authority",
  ],
] as const;
export const officialSources: OfficialSource[] = destinations.flatMap(
  ([country, name, slug, url, authority]) => [
    {
      id: country.toLowerCase() + "-entry",
      name: authority,
      url,
      country,
      scope:
        "Official destination portal. Check the sections applicable to your nationality, document, visit purpose and dates.",
    },
    ...(country === "GB"
      ? []
      : [
          {
            id: country.toLowerCase() + "-fcdo",
            name: "UK FCDO travel advice: " + name,
            url:
              "https://www.gov.uk/foreign-travel-advice/" +
              slug +
              "/entry-requirements",
            country,
            scope:
              "UK government advice is primarily for British nationals. It may not apply to your passport or residency.",
          },
        ]),
  ],
);
export function officialSource(id: string) {
  return officialSources.find((source) => source.id === id) || null;
}
export function sourcesForLocation(locationId: string | null | undefined) {
  const country = locationId?.split(":")[1];
  return officialSources.filter((source) => source.country === country);
}
