import i18n from "i18next";
import { initReactI18next } from "react-i18next";

// Italian is the only shipped language. The structure leaves room for more
// later, but no English UI is built now (see spec section 16).
export const it = {
  translation: {
    app: { title: "Gestione Spese Aziendali" },
    nav: {
      users: "Utenti",
      reports: "Note spese",
      approvals: "Approvazioni",
      logout: "Esci",
    },
    states: {
      CREATED: "Bozza",
      READY_FOR_APPROVAL: "Da approvare",
      IN_REVISION: "In revisione",
      APPROVED: "Approvata",
      REJECTED: "Respinta",
      SENT_FOR_PAYMENT: "Inviata al pagamento",
      PAID: "Pagata",
    },
    categories: {
      MILEAGE: "Rimborso chilometrico",
      MEALS_LODGING: "Vitto e alloggio",
      TRANSPORT: "Trasporti",
      OTHER: "Altro",
    },
    reports: {
      title: "Le mie note spese",
      newTitle: "Titolo della nota spese",
      create: "Crea nota spese",
      empty: "Nessuna nota spese presente.",
      state: "Stato",
      total: "Totale",
      created: "Creata il",
      open: "Apri",
      back: "Torna all'elenco",
      submit: "Invia per approvazione",
      approve: "Approva",
      reject: "Respinta",
      revise: "Richiedi revisione",
      revisePrompt: "Motivo della revisione",
      approvalsTitle: "Note spese da approvare",
      owner: "Dipendente",
      history: "Storico",
      createError: "Impossibile creare la nota spese.",
      actionError: "Operazione non consentita.",
    },
    items: {
      heading: "Voci di spesa",
      add: "Aggiungi voce",
      category: "Categoria",
      date: "Data",
      description: "Descrizione",
      amount: "Importo (€)",
      vat: "IVA (€)",
      notes: "Note",
      remove: "Elimina",
      empty: "Nessuna voce inserita.",
      addError: "Impossibile aggiungere la voce.",
    },
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
