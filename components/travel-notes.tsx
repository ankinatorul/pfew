import { parseMapsLink } from "../lib/maps-link";
export function TravelNotes({ text }: { text: string }) {
  const pieces = text.split(/(https:\/\/[^\s<>]+)/g);
  return (
    <p className="notes">
      {pieces.map((piece, index) => {
        const match = piece.match(/^(.*?)([.,;!)]+)?$/);
        const value = match?.[1] || piece,
          tail = match?.[2] || "";
        const maps = parseMapsLink(value);
        return maps ? (
          <span key={index}>
            <a href={maps.url} target="_blank" rel="noopener noreferrer">
              Open saved Google Maps link ↗
            </a>
            {tail}
          </span>
        ) : (
          piece
        );
      })}
    </p>
  );
}
