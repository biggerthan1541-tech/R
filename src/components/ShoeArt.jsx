const colorways = {
  flux: {
    upper: "#0b0b0b",
    panel: "#2f2f2f",
    trim: "#ffffff",
    midsole: "#f2f2f2",
    outsole: "#0b0b0b",
    plate: "#ff3d00",
  },
  kinetic: {
    upper: "#ff3d00",
    panel: "#cc3000",
    trim: "#ffffff",
    midsole: "#0b0b0b",
    outsole: "#0b0b0b",
    plate: "#ffffff",
  },
  apex: {
    upper: "#e9e9e9",
    panel: "#c4c4c4",
    trim: "#0b0b0b",
    midsole: "#ff3d00",
    outsole: "#0b0b0b",
    plate: "#0b0b0b",
  },
  terra: {
    upper: "#33402f",
    panel: "#1e281c",
    trim: "#d9cbb3",
    midsole: "#d9cbb3",
    outsole: "#1e281c",
    plate: "#ff3d00",
  },
  drift: {
    upper: "#9a9a9a",
    panel: "#6f6f6f",
    trim: "#ffffff",
    midsole: "#ffffff",
    outsole: "#4a4a4a",
    plate: "#0b0b0b",
  },
  surge: {
    upper: "#0b0b0b",
    panel: "#2f2f2f",
    trim: "#ff3d00",
    midsole: "#ff3d00",
    outsole: "#0b0b0b",
    plate: "#0b0b0b",
  },
  hero: {
    upper: "#0b0b0b",
    panel: "#242424",
    trim: "#ffffff",
    midsole: "#ffffff",
    outsole: "#0b0b0b",
    plate: "#ff3d00",
  },
};

/**
 * CSS/SVG-drawn stand-in for product photography — a generic side-profile
 * running shoe. No real product, silhouette or brand mark is reproduced.
 */
export default function ShoeArt({ variant = "flux", className = "" }) {
  const c = colorways[variant] ?? colorways.flux;

  return (
    <svg
      viewBox="0 0 340 200"
      className={className}
      role="presentation"
      aria-hidden="true"
      focusable="false"
    >
      {/* outsole rubber, sitting a few units proud of the midsole */}
      <path
        d="M36 148 C26 162 30 178 52 180 L240 180 C272 179 292 172 300 158 C303 152 297 148 290 152 L40 144 Z"
        fill={c.outsole}
      />
      {/* midsole — deep under the heel, thin and rockered at the toe */}
      <path
        d="M36 142 C26 156 30 172 52 174 L240 174 C272 173 292 166 300 152 C303 146 297 142 290 146 L40 138 Z"
        fill={c.midsole}
      />
      {/* lug gaps cut through the exposed rubber */}
      <g stroke={c.midsole} strokeWidth="4" strokeLinecap="butt">
        <path d="M78 172 L78 182" />
        <path d="M112 174 L112 183" />
        <path d="M186 174 L186 183" />
        <path d="M220 174 L220 182" />
      </g>
      {/* carbon plate suspended in the foam */}
      <path
        d="M42 156 C96 168 176 170 238 162 C266 158 288 152 300 146"
        fill="none"
        stroke={c.plate}
        strokeWidth="5"
        strokeLinecap="round"
      />

      {/* upper: heel counter, collar notch, vamp, toe box */}
      <path
        d="M40 140
           C33 110 39 74 56 60
           C65 52 75 55 80 67
           C87 83 96 91 110 97
           C150 113 205 123 252 131
           C274 135 290 141 297 149
           L292 155
           L42 146 Z"
        fill={c.upper}
      />
      {/* toe box panel */}
      <path
        d="M232 127 C258 132 284 139 297 149 L292 155 L230 137 Z"
        fill={c.panel}
      />
      {/* heel counter panel */}
      <path
        d="M40 140 C33 110 39 74 56 60 C61 56 66 55 70 57 C54 74 48 108 51 142 Z"
        fill={c.panel}
      />
      {/* collar foam */}
      <path
        d="M55 64 C64 54 76 57 81 70"
        fill="none"
        stroke={c.trim}
        strokeWidth="4"
        strokeLinecap="round"
      />
      {/* tongue, tucked below the collar line */}
      <path
        d="M101 98 L110 82 C113 76 123 76 126 83 L137 106 Z"
        fill={c.panel}
      />
      <path
        d="M110 82 C113 76 123 76 126 83"
        fill="none"
        stroke={c.trim}
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      {/* lace bars along the throat */}
      <g stroke={c.trim} strokeWidth="3.5" strokeLinecap="round">
        <path d="M126 86 L143 96" />
        <path d="M140 94 L159 103" />
        <path d="M156 102 L176 110" />
        <path d="M173 110 L194 117" />
      </g>
      {/* side stripe — the brand mark stands in as a plain speed bar */}
      <path d="M92 118 L208 134 L206 143 L90 127 Z" fill={c.plate} />
      {/* heel pull tab */}
      <rect x="36" y="66" width="7" height="16" rx="3.5" fill={c.trim} />
    </svg>
  );
}
