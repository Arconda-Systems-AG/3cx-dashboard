import { redirect } from "next/navigation";

// Seite entfernt (01.09.2026): Inhalt war vollständig in der Übersicht
// ("Warteschlangen kompakt") + Live-Probleme dupliziert. Redirect fängt
// alte Bookmarks ab.
export default function QueuesRedirect() {
  redirect("/");
}
