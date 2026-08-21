const base = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  viewBox: "0 0 24 24",
  "aria-hidden": "true",
  focusable: "false",
};

export const SearchIcon = (props) => (
  <svg {...base} {...props}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" />
  </svg>
);

export const HeartIcon = ({ filled = false, ...props }) => (
  <svg {...base} fill={filled ? "currentColor" : "none"} {...props}>
    <path d="M12 20s-7.5-4.6-7.5-9.4A4.1 4.1 0 0 1 12 7.9a4.1 4.1 0 0 1 7.5 2.7C19.5 15.4 12 20 12 20Z" />
  </svg>
);

export const BagIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M4.5 7.5h15L18.6 20H5.4L4.5 7.5Z" />
    <path d="M9 10V6.8a3 3 0 0 1 6 0V10" />
  </svg>
);

export const MenuIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M3.5 7h17M3.5 12h17M3.5 17h17" />
  </svg>
);

export const CloseIcon = (props) => (
  <svg {...base} {...props}>
    <path d="m6 6 12 12M18 6 6 18" />
  </svg>
);

export const ArrowIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M4 12h15" />
    <path d="m13 6 6 6-6 6" />
  </svg>
);

export const ChevronIcon = (props) => (
  <svg {...base} {...props}>
    <path d="m9 5 7 7-7 7" />
  </svg>
);

export const ShipIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M2.5 15.5V7h10.5v8.5" />
    <path d="M13 10h4.2l3.3 3.4v2.1H13" />
    <circle cx="7" cy="17.5" r="2" />
    <circle cx="17" cy="17.5" r="2" />
  </svg>
);

export const ReturnIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M4 12a8 8 0 1 1 2.6 5.9" />
    <path d="M4 6.5V12h5.5" />
  </svg>
);

export const ClockIcon = (props) => (
  <svg {...base} {...props}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 1.8" />
  </svg>
);

const social = {
  ...base,
  fill: "currentColor",
  stroke: "none",
};

export const InstagramIcon = (props) => (
  <svg {...social} {...props}>
    <path d="M12 2.2c-2.7 0-3 0-4.1.06-1.1.05-1.8.22-2.5.48a4.9 4.9 0 0 0-1.8 1.16A4.9 4.9 0 0 0 2.4 5.7c-.26.65-.43 1.4-.48 2.5C1.87 9.3 1.85 9.6 1.85 12s0 2.7.07 3.8c.05 1.1.22 1.85.48 2.5a5 5 0 0 0 1.16 1.8 4.9 4.9 0 0 0 1.8 1.16c.65.26 1.4.43 2.5.48 1.1.05 1.4.06 4.14.06s3-.01 4.1-.06c1.1-.05 1.85-.22 2.5-.48a5.1 5.1 0 0 0 2.96-2.96c.26-.65.43-1.4.48-2.5.05-1.1.06-1.4.06-4.1s0-3-.06-4.1c-.05-1.1-.22-1.85-.48-2.5a4.9 4.9 0 0 0-1.16-1.8 4.9 4.9 0 0 0-1.8-1.16c-.65-.26-1.4-.43-2.5-.48C15 2.2 14.7 2.2 12 2.2Zm0 1.8c2.67 0 2.98.01 4.03.06.98.04 1.5.2 1.86.34.47.18.8.4 1.15.75.35.35.57.68.75 1.15.14.36.3.88.34 1.86.05 1.05.06 1.36.06 4.03s-.01 3-.06 4.03c-.04.98-.2 1.5-.34 1.86-.18.47-.4.8-.75 1.15-.35.35-.68.57-1.15.75-.36.14-.88.3-1.86.34-1.05.05-1.36.06-4.03.06s-3-.01-4.03-.06c-.98-.04-1.5-.2-1.86-.34a3.1 3.1 0 0 1-1.15-.75 3.1 3.1 0 0 1-.75-1.15c-.14-.36-.3-.88-.34-1.86C4.02 15 4 14.67 4 12s.02-3 .07-4.03c.04-.98.2-1.5.34-1.86.18-.47.4-.8.75-1.15.35-.35.68-.57 1.15-.75.36-.14.88-.3 1.86-.34C9.02 4.02 9.33 4 12 4Z" />
    <path d="M12 15.34a3.34 3.34 0 1 1 0-6.68 3.34 3.34 0 0 1 0 6.68Zm0-8.48a5.14 5.14 0 1 0 0 10.28 5.14 5.14 0 0 0 0-10.28Z" />
    <circle cx="17.35" cy="6.65" r="1.2" />
  </svg>
);

export const XIcon = (props) => (
  <svg {...social} {...props}>
    <path d="M17.2 3h3.3l-7.2 8.2L21.7 21h-6.5l-4.5-5.9L5.4 21H2.1l7.7-8.8L2 3h6.7l4.1 5.4L17.2 3Zm-1.2 16h1.8L8.1 4.9H6.1L16 19Z" />
  </svg>
);

export const YouTubeIcon = (props) => (
  <svg {...social} {...props}>
    <path d="M21.6 7.2a2.5 2.5 0 0 0-1.76-1.77C18.25 5 12 5 12 5s-6.25 0-7.84.43A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.76 1.77C5.75 19 12 19 12 19s6.25 0 7.84-.43a2.5 2.5 0 0 0 1.76-1.77A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8ZM10 15.1V8.9l5.2 3.1-5.2 3.1Z" />
  </svg>
);

export const StravaIcon = (props) => (
  <svg {...social} {...props}>
    <path d="M10.3 2 4.5 13.4h3.4L10.3 8.6l2.4 4.8h3.4L10.3 2Z" />
    <path d="M15.7 13.4 14.1 16.6l-1.6-3.2H10l4.1 8.2 4.1-8.2h-2.5Z" />
  </svg>
);
