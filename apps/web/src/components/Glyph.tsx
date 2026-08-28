/** Кружок направления: первая буква на подложке его цвета. */
export function Glyph({
  name,
  color,
  large = false,
}: {
  name: string;
  color: string;
  large?: boolean;
}) {
  return (
    <div
      className={large ? 'glyph glyph-lg' : 'glyph'}
      style={{
        background: `color-mix(in srgb, var(${color}) 16%, transparent)`,
        color: `var(${color})`,
      }}
      aria-hidden="true"
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}
