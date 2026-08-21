import Editorial from "./components/Editorial";
import Footer from "./components/Footer";
import Hero from "./components/Hero";
import Lineup from "./components/Lineup";
import Marquee from "./components/Marquee";
import Nav from "./components/Nav";
import Perks from "./components/Perks";
import PromoBar from "./components/PromoBar";
import Terrain from "./components/Terrain";

export default function App() {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:bg-ink focus:px-5 focus:py-3 focus:text-sm focus:font-bold focus:tracking-widest focus:text-paper focus:uppercase"
      >
        Skip to content
      </a>
      <PromoBar />
      <Nav />
      <main id="main">
        <Hero />
        <Marquee />
        <Terrain />
        <Lineup />
        <Editorial />
        <Perks />
      </main>
      <Footer />
    </>
  );
}
