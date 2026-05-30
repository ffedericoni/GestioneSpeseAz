import i18n from "i18next";
import { initReactI18next } from "react-i18next";

// Italian is the only shipped language. The structure leaves room for more
// later, but no English UI is built now (see spec section 16).
export const it = {
  translation: {
    app: { title: "Gestione Spese Aziendali" },
    nav: { users: "Utenti", logout: "Esci" },
    login: {
      heading: "Accedi",
      email: "Email",
      password: "Password",
      submit: "Accedi",
      error: "Credenziali non valide",
    },
    roles: {
      EMPLOYEE: "Dipendente",
      MANAGER: "Responsabile",
      FINANCE: "Amministrazione",
      ADMIN: "Amministratore",
    },
    users: {
      title: "Gestione utenti",
      newUser: "Nuovo utente",
      fullName: "Nome e cognome",
      email: "Email",
      role: "Ruolo",
      manager: "Responsabile",
      active: "Attivo",
      noManager: "Nessuno",
      status: { active: "Attivo", inactive: "Disattivato" },
      create: "Crea utente",
      save: "Salva",
      cancel: "Annulla",
      deactivate: "Disattiva",
      activate: "Riattiva",
      empty: "Nessun utente presente.",
      createError: "Impossibile creare l'utente.",
      emailTaken: "Email già registrata.",
    },
    common: { loading: "Caricamento…", required: "Campo obbligatorio" },
  },
};

void i18n.use(initReactI18next).init({
  resources: { it },
  lng: "it",
  fallbackLng: "it",
  interpolation: { escapeValue: false },
});

export default i18n;
