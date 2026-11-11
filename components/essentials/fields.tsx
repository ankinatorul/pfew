type Fields = {
  name: string;
  label: string;
  type?: string;
  options?: readonly string[];
  required?: boolean;
  max?: number;
  min?: number;
  step?: string;
};
export function Fields({
  fields,
  values,
}: {
  fields: Fields[];
  values: Record<string, string | number | boolean | null | undefined>;
}) {
  const value = (name: string, fallback = "") => {
    const v = values[name];
    return typeof v === "string" || typeof v === "number" ? v : fallback;
  };
  return (
    <>
      {fields
        .filter(
          (f) =>
            !["timezone", "end_timezone", "arrival_timezone"].includes(f.name),
        )
        .map((f) => (
          <label key={f.name}>
            {f.label}
            {f.options ? (
              <select name={f.name} defaultValue={value(f.name, f.options[0])}>
                {f.options.map((o) => (
                  <option key={o} value={o}>
                    {o || "Not specified"}
                  </option>
                ))}
              </select>
            ) : f.type === "textarea" ? (
              <textarea
                name={f.name}
                rows={3}
                maxLength={f.max || 4000}
                defaultValue={value(f.name)}
              />
            ) : (
              <input
                name={f.name}
                type={f.type || "text"}
                required={f.required}
                maxLength={f.max || 200}
                min={f.min}
                max={f.type === "number" ? f.max : undefined}
                step={f.step}
                defaultValue={value(f.name)}
              />
            )}
          </label>
        ))}
    </>
  );
}
