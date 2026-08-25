import { useLocale } from "../state/locale.js";

export function Library() {
  const { messages } = useLocale();
  return (
    <section className="bc-screen">
      <h1 className="bc-screen__heading">{messages.library.heading}</h1>
      <div className="bc-card">
        <h2>{messages.library.kits}</h2>
        <p>{messages.library.empty}</p>
      </div>
      <div className="bc-card" style={{ marginTop: 16 }}>
        <h2>{messages.library.templates}</h2>
        <p>{messages.library.empty}</p>
      </div>
    </section>
  );
}
