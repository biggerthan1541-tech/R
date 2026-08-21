export const navLinks = [
  { label: "Road", href: "#terrain" },
  { label: "Trail", href: "#terrain" },
  { label: "Race Day", href: "#terrain" },
  { label: "Tech", href: "#tech" },
  { label: "Sale", href: "#lineup" },
];

export const heroStats = [
  { value: "184g", label: "Upper weight", note: "US M9" },
  { value: "87%", label: "Energy return", note: "Lab tested" },
  { value: "6mm", label: "Heel drop", note: "Race geometry" },
];

export const tickerTerms = ["Pace", "Power", "Propulsion", "Distance", "Tempo"];

export const terrains = [
  {
    id: "road",
    name: "Road",
    blurb: "Daily miles, tempo days, negative splits.",
    count: 24,
    art: "road",
  },
  {
    id: "trail",
    name: "Trail",
    blurb: "Grip for loose rock, roots and wet clay.",
    count: 16,
    art: "trail",
  },
  {
    id: "race-day",
    name: "Race Day",
    blurb: "Carbon plate. Everything else removed.",
    count: 9,
    art: "race",
  },
];

export const products = [
  {
    id: "vf-1",
    name: "Velo Flux 1",
    category: "Road / Daily",
    price: 148,
    art: "flux",
  },
  {
    id: "vk-3",
    name: "Velo Kinetic 3",
    category: "Road / Tempo",
    price: 165,
    wasPrice: 190,
    badge: "-13%",
    art: "kinetic",
  },
  {
    id: "va-pro",
    name: "Velo Apex Pro",
    category: "Race Day",
    price: 245,
    art: "apex",
  },
  {
    id: "vt-2",
    name: "Velo Terra 2",
    category: "Trail / All Mountain",
    price: 172,
    art: "terra",
  },
  {
    id: "vd-9",
    name: "Velo Drift 9",
    category: "Road / Recovery",
    price: 132,
    wasPrice: 155,
    badge: "-15%",
    art: "drift",
  },
  {
    id: "vs-elite",
    name: "Velo Surge Elite",
    category: "Race Day",
    price: 268,
    art: "surge",
  },
];

export const perks = [
  {
    title: "Free shipping",
    copy: "On every order over $75, no code needed.",
    icon: "ship",
  },
  {
    title: "60-day returns",
    copy: "Run them. Really run them. Send them back if they miss.",
    icon: "return",
  },
  {
    title: "Member early access",
    copy: "Drops unlock 48 hours before general release.",
    icon: "clock",
  },
];

export const footerColumns = [
  {
    title: "Shop",
    links: ["Road", "Trail", "Race Day", "Apparel", "Accessories", "Sale"],
  },
  {
    title: "Support",
    links: ["Order status", "Shipping", "Returns", "Size guide", "Contact"],
  },
  {
    title: "Company",
    links: ["Our story", "Sustainability", "Careers", "Press", "Athletes"],
  },
  {
    title: "Run Club",
    links: ["Join VELO+", "Training plans", "Local runs", "Race calendar"],
  },
];
