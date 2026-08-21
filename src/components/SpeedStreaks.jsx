const streaks = [
  { top: "12%", width: "30vw", delay: "0s", duration: "2.6s", opacity: 0.4 },
  { top: "22%", width: "18vw", delay: "1.1s", duration: "3.4s", opacity: 0.25 },
  { top: "38%", width: "40vw", delay: "0.5s", duration: "2.2s", opacity: 0.45 },
  { top: "54%", width: "24vw", delay: "1.8s", duration: "3.1s", opacity: 0.28 },
  { top: "72%", width: "34vw", delay: "0.9s", duration: "2.8s", opacity: 0.38 },
  { top: "86%", width: "16vw", delay: "2.3s", duration: "3.9s", opacity: 0.2 },
];

export default function SpeedStreaks() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden opacity-50 motion-reduce:hidden lg:left-[45%] lg:opacity-100"
    >
      {streaks.map((streak, index) => (
        <span
          key={index}
          className="animate-streak absolute left-0 block h-0.5 rounded-full bg-[linear-gradient(90deg,transparent,var(--color-signal))]"
          style={{
            top: streak.top,
            width: streak.width,
            animationDelay: streak.delay,
            animationDuration: streak.duration,
            opacity: streak.opacity,
          }}
        />
      ))}
    </div>
  );
}
